import { Octokit } from '@octokit/rest';
import {
  GITHUB_SYNC_INITIAL_BACKOFF_MS,
  GITHUB_SYNC_MAX_RETRIES,
} from './constants';
import {
  getGitHubSettings,
  getPendingPages,
  getVolume,
  markPageSynced,
} from './db';
import type { GitHubSettings, Page, Volume } from '../types';

/**
 * GitHub バックアップ層。
 *
 * 設計メモ:
 *  - トークンは IndexedDB の meta ストアに保存（localStorage より eviction に耐える）。
 *  - 各 Page を 1 ファイル (`volumes/{ordinal}-{volumeId}/page-{NN}.txt`) として PUT。
 *  - SHA はリポジトリから取得してキャッシュ（メモリのみ）。
 *  - 失敗時は exponential backoff で最大3回リトライ。
 *  - オフライン時は何もせず、syncStatus='pending' のまま残す。`online` イベントで再開。
 */

const shaCache = new Map<string, string>();

function buildPath(volume: Volume, page: Page): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `volumes/${pad(volume.ordinal, 3)}-${volume.id}/page-${pad(
    page.pageNumber
  )}.txt`;
}

function b64encode(s: string): string {
  // UTF-8 → base64（ブラウザの btoa は Latin-1 までなので TextEncoder 経由）
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function createOctokit(s: GitHubSettings): Octokit {
  return new Octokit({ auth: s.token });
}

/** 疎通テスト: リポジトリ情報を取得できるか */
export async function testConnection(
  s: GitHubSettings
): Promise<{ ok: boolean; message: string }> {
  try {
    const ok = createOctokit(s);
    const res = await ok.repos.get({ owner: s.owner, repo: s.repo });
    return { ok: true, message: `${res.data.full_name} に接続しました` };
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 401) return { ok: false, message: 'トークンが無効です' };
    if (e.status === 404)
      return { ok: false, message: 'リポジトリが見つかりません' };
    return { ok: false, message: e.message ?? '接続失敗' };
  }
}

/** 1ページの PUT（SHA 管理込み） */
async function putPage(
  octokit: Octokit,
  s: GitHubSettings,
  volume: Volume,
  page: Page
): Promise<void> {
  const path = buildPath(volume, page);
  const message = `Update page ${page.pageNumber} of volume ${volume.ordinal}`;
  const content = b64encode(page.content);

  // SHA を取得（キャッシュ優先）
  let sha = shaCache.get(path);
  if (!sha) {
    try {
      const got = await octokit.repos.getContent({
        owner: s.owner,
        repo: s.repo,
        path,
      });
      if (!Array.isArray(got.data) && 'sha' in got.data) {
        sha = got.data.sha;
        shaCache.set(path, sha);
      }
    } catch (err) {
      const e = err as { status?: number };
      if (e.status !== 404) throw err;
      // 404 = 新規作成なので sha 不要
    }
  }

  try {
    const res = await octokit.repos.createOrUpdateFileContents({
      owner: s.owner,
      repo: s.repo,
      path,
      message,
      content,
      sha,
    });
    // 新しい SHA を保存
    const newSha = res.data.content?.sha;
    if (newSha) shaCache.set(path, newSha);
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 422) {
      // SHA 不一致 → キャッシュを捨てて再取得してリトライ
      shaCache.delete(path);
      const got = await octokit.repos.getContent({
        owner: s.owner,
        repo: s.repo,
        path,
      });
      if (!Array.isArray(got.data) && 'sha' in got.data) {
        shaCache.set(path, got.data.sha);
      }
      throw err; // リトライループに任せる
    }
    throw err;
  }
}

/** 未同期ページを全てコミット（exponential backoff でリトライ） */
export async function syncPendingPages(): Promise<{
  synced: number;
  failed: number;
}> {
  const s = await getGitHubSettings();
  if (!s || !s.token || !s.owner || !s.repo) return { synced: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0 };
  }

  const octokit = createOctokit(s);
  const pending = await getPendingPages();
  let synced = 0;
  let failed = 0;

  for (const page of pending) {
    const volume = await getVolume(page.volumeId);
    if (!volume) continue;

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < GITHUB_SYNC_MAX_RETRIES; attempt++) {
      try {
        await putPage(octokit, s, volume, page);
        await markPageSynced(page.id);
        synced++;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const wait = GITHUB_SYNC_INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(wait);
      }
    }
    if (lastErr) {
      failed++;
      // eslint-disable-next-line no-console
      console.warn('[github] sync failed for page', page.id, lastErr);
    }
  }
  return { synced, failed };
}

/** 非同期に発火するだけのヘルパ（useAutoSave から fire-and-forget） */
export function syncPendingPagesBackground() {
  void syncPendingPages().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[github] background sync failed', err);
  });
}

/** online イベントで同期を再開する。アプリ起動時に一度だけ呼ぶ */
export function registerOnlineSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => {
    syncPendingPagesBackground();
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
