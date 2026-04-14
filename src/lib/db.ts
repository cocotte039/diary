import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  GITHUB_SETTINGS_KEY,
} from './constants';
import type {
  GitHubSettings,
  Page,
  SyncStatus,
  Volume,
  VolumeStatus,
} from '../types';
import { splitIntoPages } from './pagination';

/**
 * IndexedDB スキーマ (v1)。
 * - volumes: keyPath 'id', index 'by-status', index 'by-ordinal'
 * - pages:   keyPath 'id', index 'by-volume-page' ([volumeId, pageNumber]),
 *            index 'by-createdAt'
 * - meta:    汎用 KV ストア（GitHub設定など）
 */
interface DiaryDB extends DBSchema {
  volumes: {
    key: string;
    value: Volume;
    indexes: {
      'by-status': VolumeStatus;
      'by-ordinal': number;
    };
  };
  pages: {
    key: string;
    value: Page;
    indexes: {
      'by-volume-page': [string, number];
      'by-volume': string;
      'by-createdAt': string;
      'by-syncStatus': SyncStatus;
    };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<DiaryDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<DiaryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DiaryDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('volumes')) {
          const vs = db.createObjectStore('volumes', { keyPath: 'id' });
          vs.createIndex('by-status', 'status');
          vs.createIndex('by-ordinal', 'ordinal');
        }
        if (!db.objectStoreNames.contains('pages')) {
          const ps = db.createObjectStore('pages', { keyPath: 'id' });
          ps.createIndex('by-volume-page', ['volumeId', 'pageNumber']);
          ps.createIndex('by-volume', 'volumeId');
          ps.createIndex('by-createdAt', 'createdAt');
          ps.createIndex('by-syncStatus', 'syncStatus');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

/** テスト用: DB ハンドルをリセットする（接続があれば閉じる） */
export async function _resetDBForTests() {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // ignore
    }
    dbPromise = null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  // crypto.randomUUID() は全モダンブラウザと Node18+ で利用可
  return crypto.randomUUID();
}

// =============================================================================
// Volume 操作
// =============================================================================

export async function getAllVolumes(): Promise<Volume[]> {
  const db = await getDB();
  const all = await db.getAll('volumes');
  return all.sort((a, b) => a.ordinal - b.ordinal);
}

export async function getVolume(id: string): Promise<Volume | undefined> {
  const db = await getDB();
  return db.get('volumes', id);
}

export async function getActiveVolume(): Promise<Volume | undefined> {
  const db = await getDB();
  const idx = db.transaction('volumes').store.index('by-status');
  const actives: Volume[] = [];
  let cursor = await idx.openCursor('active');
  while (cursor) {
    actives.push(cursor.value);
    cursor = await cursor.continue();
  }
  // 最新（ordinal 最大）を active として扱う
  actives.sort((a, b) => b.ordinal - a.ordinal);
  return actives[0];
}

/**
 * 起動時リカバリ: active が0個 → 新規作成、2個以上 → 最新以外を completed。
 * Page #1 が無ければ作成する。
 * 返り値: アクティブな Volume。
 */
export async function ensureActiveVolume(): Promise<Volume> {
  const db = await getDB();
  const tx = db.transaction(['volumes', 'pages'], 'readwrite');
  const vStore = tx.objectStore('volumes');
  const pStore = tx.objectStore('pages');

  const allVolumes: Volume[] = await vStore.getAll();
  const actives = allVolumes.filter((v) => v.status === 'active');
  actives.sort((a, b) => b.ordinal - a.ordinal);

  let active: Volume;
  if (actives.length === 0) {
    const ordinal =
      allVolumes.reduce((mx, v) => Math.max(mx, v.ordinal), 0) + 1;
    active = {
      id: uuid(),
      createdAt: nowIso(),
      status: 'active',
      ordinal,
    };
    await vStore.put(active);
  } else {
    active = actives[0];
    // 2個以上 → 最新以外を completed
    for (const extra of actives.slice(1)) {
      extra.status = 'completed';
      await vStore.put(extra);
    }
  }

  // Page #1 の存在確認
  const page1Index = pStore.index('by-volume-page');
  const existing = await page1Index.get([active.id, 1]);
  if (!existing) {
    const p1: Page = {
      id: uuid(),
      volumeId: active.id,
      pageNumber: 1,
      content: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      syncStatus: 'pending',
    };
    await pStore.put(p1);
  }

  await tx.done;
  return active;
}

// =============================================================================
// Page 操作
// =============================================================================

export async function getPagesByVolume(volumeId: string): Promise<Page[]> {
  const db = await getDB();
  const idx = db.transaction('pages').store.index('by-volume');
  const pages: Page[] = [];
  let cursor = await idx.openCursor(volumeId);
  while (cursor) {
    pages.push(cursor.value);
    cursor = await cursor.continue();
  }
  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  return pages;
}

export async function getPage(
  volumeId: string,
  pageNumber: number
): Promise<Page | undefined> {
  const db = await getDB();
  return db.getFromIndex('pages', 'by-volume-page', [volumeId, pageNumber]);
}

/**
 * アクティブな Volume のテキスト全体を 30 行ごとに分割し、
 * IndexedDB の Page レコードを作成・更新する。
 * - 既存ページは content/updatedAt/syncStatus=pending で更新
 * - 行数が増えた場合は新しい Page を作成
 * - 行数が減った場合は余剰の Page を削除（ただし Page #1 は残す）
 */
export async function saveVolumeText(
  volumeId: string,
  text: string
): Promise<Page[]> {
  const db = await getDB();
  const chunks = splitIntoPages(text);
  const tx = db.transaction('pages', 'readwrite');
  const store = tx.objectStore('pages');

  // 既存ページを pageNumber 順で取得
  const byVolume = store.index('by-volume');
  const existing: Page[] = [];
  let cursor = await byVolume.openCursor(volumeId);
  while (cursor) {
    existing.push(cursor.value);
    cursor = await cursor.continue();
  }
  existing.sort((a, b) => a.pageNumber - b.pageNumber);
  const byPageNum = new Map(existing.map((p) => [p.pageNumber, p]));

  const now = nowIso();
  const updated: Page[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const pageNumber = i + 1;
    const content = chunks[i];
    const prev = byPageNum.get(pageNumber);
    if (prev) {
      if (prev.content !== content) {
        const next: Page = {
          ...prev,
          content,
          updatedAt: now,
          syncStatus: 'pending',
        };
        await store.put(next);
        updated.push(next);
      } else {
        updated.push(prev);
      }
    } else {
      const p: Page = {
        id: uuid(),
        volumeId,
        pageNumber,
        content,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      };
      await store.put(p);
      updated.push(p);
    }
  }

  // 余剰ページの削除（Page #1 は必ず残す）
  for (const old of existing) {
    if (old.pageNumber > chunks.length && old.pageNumber > 1) {
      await store.delete(old.id);
    }
  }

  await tx.done;
  return updated;
}

/** Volume のテキストを連結して返す（書く画面で textarea に流し込む） */
export async function loadVolumeText(volumeId: string): Promise<string> {
  const pages = await getPagesByVolume(volumeId);
  return pages.map((p) => p.content).join('\n');
}

// =============================================================================
// 冊切替
// =============================================================================

/**
 * 現在の active Volume を completed にし、新規 Volume と Page #1 を作成。
 * トランザクションでアトミックに実行。
 */
export async function rotateVolume(
  currentActiveId: string
): Promise<Volume> {
  const db = await getDB();
  const tx = db.transaction(['volumes', 'pages'], 'readwrite');
  const vStore = tx.objectStore('volumes');
  const pStore = tx.objectStore('pages');

  const current = await vStore.get(currentActiveId);
  if (current) {
    current.status = 'completed';
    await vStore.put(current);
  }

  const allVolumes: Volume[] = await vStore.getAll();
  const ordinal =
    allVolumes.reduce((mx, v) => Math.max(mx, v.ordinal), 0) + 1;

  const newVolume: Volume = {
    id: uuid(),
    createdAt: nowIso(),
    status: 'active',
    ordinal,
  };
  await vStore.put(newVolume);

  const p1: Page = {
    id: uuid(),
    volumeId: newVolume.id,
    pageNumber: 1,
    content: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    syncStatus: 'pending',
  };
  await pStore.put(p1);

  await tx.done;
  return newVolume;
}

// =============================================================================
// 日付検索（T2.4）
// =============================================================================

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * 指定日付 (YYYY-MM-DD) に作成された最初の Page を返す。
 * 該当日が無ければ、最も近い日（同日以降→以前の順）の Page を返す。
 */
export async function findPageByDate(
  date: string
): Promise<{ volumeId: string; pageNumber: number } | null> {
  const db = await getDB();
  const pages = await db.getAll('pages');
  if (pages.length === 0) return null;
  pages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // 完全一致を優先（同日最初の Page）
  const sameDay = pages.find((p) => dateKey(p.createdAt) === date);
  if (sameDay) {
    return { volumeId: sameDay.volumeId, pageNumber: sameDay.pageNumber };
  }
  // 最も近い日
  const target = new Date(date + 'T00:00:00').getTime();
  let best = pages[0];
  let bestDiff = Math.abs(new Date(best.createdAt).getTime() - target);
  for (const p of pages) {
    const d = Math.abs(new Date(p.createdAt).getTime() - target);
    if (d < bestDiff) {
      best = p;
      bestDiff = d;
    }
  }
  return { volumeId: best.volumeId, pageNumber: best.pageNumber };
}

/**
 * ある年月 (year, month 1-12) のうち、日記が存在する日 (YYYY-MM-DD) 集合を返す。
 */
export async function getDateSetInMonth(
  year: number,
  month: number
): Promise<Set<string>> {
  const db = await getDB();
  const pages = await db.getAll('pages');
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const set = new Set<string>();
  for (const p of pages) {
    if (p.createdAt.startsWith(prefix)) {
      set.add(dateKey(p.createdAt));
    }
  }
  return set;
}

// =============================================================================
// 同期状態 (T3.1)
// =============================================================================

export async function getPendingPages(): Promise<Page[]> {
  const db = await getDB();
  return db.getAllFromIndex('pages', 'by-syncStatus', 'pending');
}

export async function markPageSynced(pageId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('pages', 'readwrite');
  const p = await tx.store.get(pageId);
  if (p) {
    p.syncStatus = 'synced';
    await tx.store.put(p);
  }
  await tx.done;
}

// =============================================================================
// meta KV
// =============================================================================

export async function getGitHubSettings(): Promise<GitHubSettings | undefined> {
  const db = await getDB();
  return (await db.get('meta', GITHUB_SETTINGS_KEY)) as
    | GitHubSettings
    | undefined;
}

export async function setGitHubSettings(s: GitHubSettings): Promise<void> {
  const db = await getDB();
  await db.put('meta', s, GITHUB_SETTINGS_KEY);
}

export async function clearGitHubSettings(): Promise<void> {
  const db = await getDB();
  await db.delete('meta', GITHUB_SETTINGS_KEY);
}

// =============================================================================
// 全件取得（export.ts 用）
// =============================================================================

export async function getAllPages(): Promise<Page[]> {
  const db = await getDB();
  return db.getAll('pages');
}
