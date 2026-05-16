import { Octokit } from '@octokit/rest';
import {
  GITHUB_SYNC_INITIAL_BACKOFF_MS,
  GITHUB_SYNC_MAX_RETRIES,
} from './constants';
import {
  dateKey,
  getAllMemos,
  getDeletedMemoDays,
  getGitHubSettings,
  getPendingMemos,
  getPendingPages,
  getVolume,
  markMemosSyncedByDay,
  markPageSynced,
  removeDeletedMemoDay,
  replaceAllData,
} from './db';
import type { GitHubSettings, Memo, Page, Volume } from '../types';

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

/** 非同期に発火するだけのヘルパ（autosave から fire-and-forget） */
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
    syncPendingMemosBackground();
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

// =============================================================================
// Memo バックアップ (M4: 日付別ファイル memos/YYYY-MM-DD.md)
// =============================================================================

/**
 * 1日分のメモ配列を 1 ファイル内容に整形する。
 * createdAt 昇順、各メモを `## HH:MM:SS\n{content}\n` として連結。
 * 時刻は dateKey と同じローカル時刻基準（new Date のローカル getter）。
 */
export function buildMemoFileContent(memosOfDay: Memo[]): string {
  const sorted = [...memosOfDay].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const pad = (n: number) => String(n).padStart(2, '0');
  let out = '';
  for (const m of sorted) {
    const d = new Date(m.createdAt);
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    out += `## ${hh}:${mm}:${ss}\n${m.content}\n`;
  }
  return out;
}

/**
 * メモファイルの PUT（SHA 管理込み）。
 * putPage の SHA 取得 → 422 再取得リトライ ロジックをコピー流用
 * （汎用リファクタしない＝回帰面積最小, AGENTS.md 方針）。
 */
async function putMemoFile(
  octokit: Octokit,
  s: GitHubSettings,
  path: string,
  rawContent: string
): Promise<void> {
  const message = `Update memo file ${path}`;
  const content = b64encode(rawContent);

  // SHA を取得（キャッシュ優先）。shaCache は volumes/.. と memos/.. で
  // パスが異なるためキー衝突しない（E14）。
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

/**
 * 未同期メモを日付別ファイルにコミット（exponential backoff でリトライ）。
 * syncPendingPages と同型の settings/online ガード・backoff。
 *
 * 手順:
 *   1. settings/online ガード（無 or オフラインで {0,0} 早期 return）
 *   2. getPendingMemos() → dateKey(createdAt) でユニーク日集合 D
 *   3. 各 d∈D: getAllMemos() から d の全メモ抽出 → createdAt 昇順
 *      → buildMemoFileContent → 生成に使った id 配列を保持
 *      → putMemoFile('memos/'+d+'.md', content) → 成功で
 *        markMemosSyncedByDay(d, ids)（生成時 id 集合のみ, E3/C2）
 */
export async function syncPendingMemos(): Promise<{
  synced: number;
  failed: number;
}> {
  const s = await getGitHubSettings();
  if (!s || !s.token || !s.owner || !s.repo) return { synced: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0 };
  }

  const octokit = createOctokit(s);
  const pending = await getPendingMemos();
  let synced = 0;
  let failed = 0;

  // pending メモが属する日集合
  const days = new Set<string>();
  for (const m of pending) days.add(dateKey(m.createdAt));

  for (const d of days) {
    // その日の全メモ（pending/synced 問わず）を最新状態で再生成
    const all = await getAllMemos();
    const ofDay = all
      .filter((m) => dateKey(m.createdAt) === d)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const ids = ofDay.map((m) => m.id); // 生成時 id 集合（E3/C2）
    const content = buildMemoFileContent(ofDay);
    const path = `memos/${d}.md`;

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < GITHUB_SYNC_MAX_RETRIES; attempt++) {
      try {
        await putMemoFile(octokit, s, path, content);
        await markMemosSyncedByDay(d, ids);
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
      console.warn('[github] memo sync failed for day', d, lastErr);
    }
  }

  // A12 (U1): 当日全メモ削除日は空内容 PUT でリモートを空に。
  // 成功で deleted-day を除去（再実行で二重 PUT しない）。失敗時は残す。
  const deletedDays = await getDeletedMemoDays();
  for (const d of deletedDays) {
    const path = `memos/${d}.md`;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < GITHUB_SYNC_MAX_RETRIES; attempt++) {
      try {
        await putMemoFile(octokit, s, path, '');
        await removeDeletedMemoDay(d);
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
      console.warn('[github] memo deleted-day sync failed', d, lastErr);
    }
  }

  return { synced, failed };
}

/** 非同期に発火するだけのヘルパ（autosave から fire-and-forget） */
export function syncPendingMemosBackground() {
  void syncPendingMemos().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[github] background memo sync failed', err);
  });
}

// =============================================================================
// Import (GitHub → ローカル置換復元)
// =============================================================================

/** `volumes/{ordinal3桁}-{volumeId}/page-{NN}.txt` のパス解析 */
export interface ParsedBackupPath {
  path: string;
  ordinal: number;
  volumeId: string;
  pageNumber: number;
}

const BACKUP_PATH_RE = /^volumes\/(\d{3,})-([^/]+)\/page-(\d{2,})\.txt$/;

export function parseBackupPath(path: string): ParsedBackupPath | null {
  const m = path.match(BACKUP_PATH_RE);
  if (!m) return null;
  return {
    path,
    ordinal: parseInt(m[1], 10),
    volumeId: m[2],
    pageNumber: parseInt(m[3], 10),
  };
}

export type ImportPhase = 'preparing' | 'fetching' | 'writing' | 'done';

export interface ImportProgress {
  phase: ImportPhase;
  current: number;
  total: number;
}

/**
 * base64 文字列（改行含む可能性あり）を UTF-8 文字列にデコード。
 * GitHub API の getBlob が返す形式に対応。
 */
function decodeBase64UTF8(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * GitHub バックアップリポジトリから全ページを取得してローカルに復元する（置換）。
 *
 * 手順:
 *   1. default branch の HEAD tree を recursive 取得
 *   2. `volumes/*` にマッチする blob 全件をピックアップ
 *   3. 並列で blob 内容 + 最新 commit 日時を取得
 *   4. Volume/Page を再構築（id は path 由来、Page id は新規UUID）
 *   5. replaceAllData でローカルを置換
 *
 * ordinal 最大の Volume を 'active'、それ以外を 'completed' とする。
 */
export async function importFromGitHub(
  onProgress?: (p: ImportProgress) => void
): Promise<{ volumes: number; pages: number }> {
  const s = await getGitHubSettings();
  if (!s || !s.token || !s.owner || !s.repo) {
    throw new Error('GitHub 設定が保存されていません');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('オフラインです');
  }

  const octokit = createOctokit(s);
  onProgress?.({ phase: 'preparing', current: 0, total: 0 });

  // 1. default branch の HEAD SHA
  const repoInfo = await octokit.repos.get({ owner: s.owner, repo: s.repo });
  const branch = repoInfo.data.default_branch;
  let headSha: string;
  try {
    const ref = await octokit.git.getRef({
      owner: s.owner,
      repo: s.repo,
      ref: `heads/${branch}`,
    });
    headSha = ref.data.object.sha;
  } catch {
    throw new Error('リポジトリが空、またはアクセスできません');
  }

  // 2. recursive tree
  const tree = await octokit.git.getTree({
    owner: s.owner,
    repo: s.repo,
    tree_sha: headSha,
    recursive: 'true',
  });

  const files: Array<ParsedBackupPath & { sha: string }> = [];
  for (const item of tree.data.tree) {
    if (item.type !== 'blob' || !item.path || !item.sha) continue;
    const parsed = parseBackupPath(item.path);
    if (parsed) files.push({ ...parsed, sha: item.sha });
  }

  if (files.length === 0) {
    throw new Error('バックアップファイルが見つかりません');
  }

  // 3. 並列 fetch (内容 + 最新 commit 日時)
  const total = files.length;
  let fetched = 0;
  onProgress?.({ phase: 'fetching', current: 0, total });

  const CONCURRENCY = 4;
  const results: Array<{
    file: ParsedBackupPath;
    content: string;
    date: string;
  }> = [];

  async function fetchOne(f: ParsedBackupPath & { sha: string }) {
    const [blob, commits] = await Promise.all([
      octokit.git.getBlob({
        owner: s!.owner,
        repo: s!.repo,
        file_sha: f.sha,
      }),
      octokit.repos
        .listCommits({
          owner: s!.owner,
          repo: s!.repo,
          path: f.path,
          per_page: 1,
        })
        .catch(() => ({ data: [] as unknown[] })),
    ]);
    const content = decodeBase64UTF8(blob.data.content);
    const commitList = commits.data as Array<{
      commit?: {
        committer?: { date?: string };
        author?: { date?: string };
      };
    }>;
    const date =
      commitList[0]?.commit?.committer?.date ??
      commitList[0]?.commit?.author?.date ??
      new Date().toISOString();
    results.push({ file: f, content, date });
    fetched++;
    onProgress?.({ phase: 'fetching', current: fetched, total });
  }

  // 単純な並列数制御（配列をチャンク化して Promise.all）
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(fetchOne));
  }

  // 4. Volume/Page 再構築
  const volumeBuckets = new Map<
    string,
    { ordinal: number; createdAt: string }
  >();
  const pages: Page[] = [];
  const now = new Date().toISOString();

  for (const r of results) {
    const { file, content, date } = r;
    pages.push({
      id: crypto.randomUUID(),
      volumeId: file.volumeId,
      pageNumber: file.pageNumber,
      content,
      createdAt: date,
      updatedAt: date,
      syncStatus: 'synced',
    });
    const prev = volumeBuckets.get(file.volumeId);
    if (!prev) {
      volumeBuckets.set(file.volumeId, {
        ordinal: file.ordinal,
        createdAt: date,
      });
    } else if (date < prev.createdAt) {
      prev.createdAt = date;
    }
  }

  const maxOrdinal = Array.from(volumeBuckets.values()).reduce(
    (mx, v) => Math.max(mx, v.ordinal),
    0
  );
  const volumes: Volume[] = Array.from(volumeBuckets.entries()).map(
    ([id, v]) => ({
      id,
      ordinal: v.ordinal,
      createdAt: v.createdAt || now,
      status: v.ordinal === maxOrdinal ? 'active' : 'completed',
    })
  );
  volumes.sort((a, b) => a.ordinal - b.ordinal);

  // 5. DB 置換
  onProgress?.({ phase: 'writing', current: 0, total: pages.length });
  await replaceAllData(volumes, pages);

  // SHA キャッシュは古い情報なのでクリア（次回 sync 時に再取得）
  shaCache.clear();

  // 最終同期日時を更新
  const settings = await getGitHubSettings();
  if (settings) {
    const { setGitHubSettings } = await import('./db');
    await setGitHubSettings({ ...settings, lastSyncedAt: now });
  }

  onProgress?.({
    phase: 'done',
    current: pages.length,
    total: pages.length,
  });

  return { volumes: volumes.length, pages: pages.length };
}
