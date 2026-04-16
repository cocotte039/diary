import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  DEFAULT_DAY_ROLLOVER_HOUR,
  GITHUB_SETTINGS_KEY,
} from './constants';
import type {
  AppSettings,
  GitHubSettings,
  Page,
  SyncStatus,
  Volume,
  VolumeStatus,
} from '../types';
import { splitIntoPages } from './pagination';

const APP_SETTINGS_KEY = 'app-settings';

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
      // v1→v2 は Volume.lastOpenedPage (optional) 追加のみでスキーマ変化は無い。
      // 既存ストアは現行方式（contains ガード）で新規ユーザー作成漏れを防ぐ。
      upgrade(db, oldVersion) {
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
        if (oldVersion < 2) {
          // v2: Volume.lastOpenedPage (optional) 追加。
          // 既存レコードの書換不要 (optional フィールドなので undefined で読める)。
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
 * 冊全文を 1 つの Page レコード（Page #1）に格納する。
 * 文字数上限は撤廃したため分割は行わず、splitIntoPages は常に 1 要素を返す。
 * - Page #1 が既存なら content/updatedAt/syncStatus=pending で更新
 * - Page #1 が未作成なら新規作成
 * - Page #2 以降の既存ページは残す（互換性維持、手動改ページした既存データの保護）
 *
 * 注意: 冊全文保存経路（DB 復元等）でのみ使用。通常の編集経路では savePage を使う。
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

  // 旧挙動（chunks.length を超える既存ページを削除）は廃止。
  // splitIntoPages は常に 1 要素を返すので、Page #2 以降の既存ページは
  // そのまま保持する（手動で作成した既存ページの保護）。

  await tx.done;
  return updated;
}

/** Volume のテキストを連結して返す（書く画面で textarea に流し込む） */
export async function loadVolumeText(volumeId: string): Promise<string> {
  const pages = await getPagesByVolume(volumeId);
  return pages.map((p) => p.content).join('\n');
}

/**
 * 単一ページのみを更新する（他ページには一切触れない）。
 * 既存: content/updatedAt/syncStatus=pending を更新。
 * 未存在: 新規 Page を作成 (createdAt=now, id=uuid)。
 * EditorPage (M4-T3) の autosave から呼ばれる前提。
 */
export async function savePage(
  volumeId: string,
  pageNumber: number,
  content: string
): Promise<Page> {
  const db = await getDB();
  const tx = db.transaction('pages', 'readwrite');
  const store = tx.objectStore('pages');
  const idx = store.index('by-volume-page');
  const existing = await idx.get([volumeId, pageNumber]);
  const now = nowIso();
  let saved: Page;
  if (existing) {
    saved = {
      ...existing,
      content,
      updatedAt: now,
      syncStatus: 'pending',
    };
  } else {
    saved = {
      id: uuid(),
      volumeId,
      pageNumber,
      content,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };
  }
  await store.put(saved);
  await tx.done;
  return saved;
}

/**
 * Volume.lastOpenedPage を更新する。
 * ページ遷移時に呼ばれ、次回本棚からの復帰で同じページに戻れるようにする。
 */
export async function updateVolumeLastOpenedPage(
  volumeId: string,
  pageNumber: number
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('volumes', 'readwrite');
  const store = tx.objectStore('volumes');
  const v = await store.get(volumeId);
  if (v) {
    v.lastOpenedPage = pageNumber;
    await store.put(v);
  }
  await tx.done;
}

/**
 * 最終更新ページ番号を返す。ページが 1 枚も無い場合は 1 を返す。
 * lastOpenedPage フォールバック（本棚カードのリンク先決定）で利用。
 */
export async function getLatestUpdatedPageNumber(
  volumeId: string
): Promise<number> {
  const pages = await getPagesByVolume(volumeId);
  if (pages.length === 0) return 1;
  let best = pages[0];
  for (const p of pages) {
    if (p.updatedAt.localeCompare(best.updatedAt) > 0) {
      best = p;
    }
  }
  return best.pageNumber;
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

/**
 * 指定 volume とその配下の全 pages をアトミックに削除する。
 * - 存在しない id の場合は no-op（throw しない）
 * - 削除対象が active だった場合、残存冊のうち最大 ordinal の冊を active に昇格させる。
 *   全削除の場合は何もしない（BookshelfPage 初期ロード時に ensureActiveVolume で復旧）。
 */
export async function deleteVolume(volumeId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['volumes', 'pages'], 'readwrite');
  const vStore = tx.objectStore('volumes');
  const pStore = tx.objectStore('pages');

  const target = await vStore.get(volumeId);
  if (!target) {
    await tx.done;
    return; // no-op
  }

  // 関連 pages を by-volume index で収集し削除
  const pagesIdx = pStore.index('by-volume');
  let cursor = await pagesIdx.openCursor(volumeId);
  while (cursor) {
    await pStore.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }

  // volume 削除
  await vStore.delete(volumeId);

  // active 削除時のリカバリ: 残存最大 ordinal を active に昇格
  if (target.status === 'active') {
    const all = await vStore.getAll();
    if (all.length > 0) {
      all.sort((a, b) => b.ordinal - a.ordinal);
      const promoted: Volume = { ...all[0], status: 'active' };
      await vStore.put(promoted);
    }
    // 全削除の場合は ensureActiveVolume が BookshelfPage 初期ロード時に復旧
  }

  await tx.done;
}

// =============================================================================
// 日付検索（T2.4）
// =============================================================================

/**
 * ISO 文字列（UTC）をローカル日付の YYYY-MM-DD に変換する。
 * 単純な `iso.slice(0, 10)` は UTC 日付なので JST 深夜〜早朝の境界で
 * 前日/翌日にズレる。Date 経由でローカル年月日を組み立てることで解消。
 */
function dateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
 * ローカルタイム基準で年月を比較する（JST 境界時刻のズレ解消）。
 */
export async function getDateSetInMonth(
  year: number,
  month: number
): Promise<Set<string>> {
  const db = await getDB();
  const pages = await db.getAll('pages');
  const set = new Set<string>();
  for (const p of pages) {
    const d = new Date(p.createdAt);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
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

/**
 * アプリ全体の個人設定を取得する。
 * 未保存の場合はデフォルト値（dayRolloverHour = 4）を返す。
 */
export async function getAppSettings(): Promise<AppSettings> {
  const db = await getDB();
  const stored = (await db.get('meta', APP_SETTINGS_KEY)) as
    | AppSettings
    | undefined;
  if (!stored) return { dayRolloverHour: DEFAULT_DAY_ROLLOVER_HOUR };
  return stored;
}

export async function setAppSettings(s: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('meta', s, APP_SETTINGS_KEY);
}

// =============================================================================
// 全件取得（export.ts 用）
// =============================================================================

export async function getAllPages(): Promise<Page[]> {
  const db = await getDB();
  return db.getAll('pages');
}

// =============================================================================
// 置換インポート用 (GitHub → ローカル復元)
// =============================================================================

/**
 * ローカルの volumes / pages を全消去し、渡された配列で置き換える。
 * 1トランザクションでアトミックに処理。meta(GitHub設定) は保持する。
 */
export async function replaceAllData(
  volumes: Volume[],
  pages: Page[]
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['volumes', 'pages'], 'readwrite');
  const vStore = tx.objectStore('volumes');
  const pStore = tx.objectStore('pages');
  await vStore.clear();
  await pStore.clear();
  for (const v of volumes) await vStore.put(v);
  for (const p of pages) await pStore.put(p);
  await tx.done;
}
