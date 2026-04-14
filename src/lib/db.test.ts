import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetDBForTests,
  deleteVolume,
  ensureActiveVolume,
  getActiveVolume,
  getAllPages,
  getAllVolumes,
  getLatestUpdatedPageNumber,
  getPage,
  getPagesByVolume,
  getVolume,
  loadVolumeText,
  replaceAllData,
  rotateVolume,
  savePage,
  saveVolumeText,
  findPageByDate,
  getDateSetInMonth,
  updateVolumeLastOpenedPage,
} from './db';
import { DB_NAME } from './constants';
import type { Page, Volume } from '../types';

// 各テスト前に DB を捨てる
async function wipeDB() {
  await _resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await wipeDB();
});
afterEach(async () => {
  await wipeDB();
});

describe('db.ensureActiveVolume', () => {
  it('creates a new active volume when none exists', async () => {
    const v = await ensureActiveVolume();
    expect(v.status).toBe('active');
    expect(v.ordinal).toBe(1);

    const pages = await getPagesByVolume(v.id);
    expect(pages.length).toBe(1);
    expect(pages[0].pageNumber).toBe(1);
  });

  it('is idempotent', async () => {
    const a = await ensureActiveVolume();
    const b = await ensureActiveVolume();
    expect(a.id).toBe(b.id);
  });
});

describe('db.saveVolumeText / loadVolumeText', () => {
  it('round-trip preserves text', async () => {
    const v = await ensureActiveVolume();
    const text = Array.from({ length: 75 }, (_, i) => `line-${i}`).join('\n');
    await saveVolumeText(v.id, text);
    const loaded = await loadVolumeText(v.id);
    expect(loaded).toBe(text);
  });

  it('creates additional pages when text grows past LINES_PER_PAGE lines', async () => {
    const v = await ensureActiveVolume();
    const { LINES_PER_PAGE } = await import('./constants');
    const text = Array.from(
      { length: LINES_PER_PAGE + 1 },
      (_, i) => `L${i}`
    ).join('\n');
    await saveVolumeText(v.id, text);
    const pages = await getPagesByVolume(v.id);
    expect(pages.length).toBe(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[1].pageNumber).toBe(2);
  });

  it('marks updated page as pending for sync', async () => {
    const v = await ensureActiveVolume();
    await saveVolumeText(v.id, 'hello');
    const pages = await getPagesByVolume(v.id);
    expect(pages[0].syncStatus).toBe('pending');
  });

  it('deletes surplus pages when text shrinks (but keeps page 1)', async () => {
    const v = await ensureActiveVolume();
    const { LINES_PER_PAGE } = await import('./constants');
    // LINES_PER_PAGE * 2.5 行 → 3 ページ相当
    const lines = Math.floor(LINES_PER_PAGE * 2.5);
    const big = Array.from({ length: lines }, (_, i) => `line-${i}`).join('\n');
    await saveVolumeText(v.id, big);
    let pages = await getPagesByVolume(v.id);
    expect(pages.length).toBe(3);

    await saveVolumeText(v.id, 'short');
    pages = await getPagesByVolume(v.id);
    expect(pages.length).toBe(1);
    expect(pages[0].content).toBe('short');
  });
});

describe('db.rotateVolume', () => {
  it('marks current as completed and creates new active volume', async () => {
    const a = await ensureActiveVolume();
    const b = await rotateVolume(a.id);
    expect(b.id).not.toBe(a.id);
    expect(b.status).toBe('active');
    expect(b.ordinal).toBe(a.ordinal + 1);

    const all = await getAllVolumes();
    expect(all.length).toBe(2);
    const oldOne = all.find((v) => v.id === a.id)!;
    expect(oldOne.status).toBe('completed');

    const newPages = await getPagesByVolume(b.id);
    expect(newPages.length).toBe(1);
    expect(newPages[0].pageNumber).toBe(1);
  });
});

describe('db.deleteVolume (M8-3-T8-3.1)', () => {
  it('deleteVolume 後に getVolume(id) が undefined を返す', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'p1');
    await savePage(v.id, 2, 'p2');
    await savePage(v.id, 3, 'p3');

    await deleteVolume(v.id);

    expect(await getVolume(v.id)).toBeUndefined();
  });

  it('deleteVolume 後に getPagesByVolume(id) が [] を返す', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'p1');
    await savePage(v.id, 2, 'p2');
    await savePage(v.id, 3, 'p3');
    expect((await getPagesByVolume(v.id)).length).toBe(3);

    await deleteVolume(v.id);

    expect(await getPagesByVolume(v.id)).toEqual([]);
  });

  it('他 volume のデータに影響しない', async () => {
    // 冊 A: active
    const a = await ensureActiveVolume();
    await savePage(a.id, 1, 'a1');
    await savePage(a.id, 2, 'a2');
    // 冊 B: rotateVolume で新しい active を作成、A は completed になる
    const b = await rotateVolume(a.id);
    await savePage(b.id, 1, 'b1');
    await savePage(b.id, 2, 'b2');

    await deleteVolume(a.id);

    expect(await getVolume(a.id)).toBeUndefined();
    expect((await getPagesByVolume(a.id)).length).toBe(0);

    // 冊 B は残る
    const bv = await getVolume(b.id);
    expect(bv).toBeTruthy();
    const bPages = await getPagesByVolume(b.id);
    expect(bPages.length).toBe(2);
    expect(bPages.find((p) => p.pageNumber === 1)?.content).toBe('b1');
    expect(bPages.find((p) => p.pageNumber === 2)?.content).toBe('b2');
  });

  it('存在しない id は no-op', async () => {
    await expect(deleteVolume('nonexistent-id')).resolves.toBeUndefined();
  });

  it('active 冊削除時は最大 ordinal の completed が active に昇格', async () => {
    // 冊1: active → rotate で completed になり、冊2: active が新規作成
    const v1 = await ensureActiveVolume();
    const v2 = await rotateVolume(v1.id);
    expect(v1.ordinal).toBe(1);
    expect(v2.ordinal).toBe(2);

    // この時点で v1=completed(ord=1), v2=active(ord=2)
    const before1 = await getVolume(v1.id);
    const before2 = await getVolume(v2.id);
    expect(before1?.status).toBe('completed');
    expect(before2?.status).toBe('active');

    // active (v2) を削除 → v1 が active に昇格
    await deleteVolume(v2.id);

    const promoted = await getActiveVolume();
    expect(promoted?.id).toBe(v1.id);
    expect(promoted?.status).toBe('active');

    const all = await getAllVolumes();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(v1.id);
    expect(all[0].status).toBe('active');
  });

  it('最後の 1 冊削除で volumes が空になる', async () => {
    const v = await ensureActiveVolume();
    await deleteVolume(v.id);
    expect(await getAllVolumes()).toEqual([]);
    expect(await getAllPages()).toEqual([]);
  });
});

describe('db.findPageByDate', () => {
  it('returns null when no pages', async () => {
    expect(await findPageByDate('2026-04-13')).toBeNull();
  });

  it('finds page on same day', async () => {
    const v = await ensureActiveVolume();
    await saveVolumeText(v.id, 'hello');
    const today = new Date().toISOString().slice(0, 10);
    const hit = await findPageByDate(today);
    expect(hit).not.toBeNull();
    expect(hit!.volumeId).toBe(v.id);
  });
});

describe('db.getDateSetInMonth (M9-M3 ローカル日付ベース)', () => {
  it('ローカル時刻で同じ日の UTC ISO をローカル日付で集約する', async () => {
    // JST で 2026-04-15 00:30 に書いた想定 = UTC では 2026-04-14T15:30:00Z
    // 以前の実装 (iso.slice(0,10)) では 2026-04-14 に分類され、2026-04-15 に印が付かなかった
    const v = await ensureActiveVolume();
    const localDate = new Date(2026, 3, 15, 0, 30); // month は 0-indexed
    await replaceAllData(
      [
        {
          id: v.id,
          ordinal: v.ordinal,
          status: 'active',
          createdAt: v.createdAt,
        },
      ],
      [
        {
          id: 'p1',
          volumeId: v.id,
          pageNumber: 1,
          content: 'hello',
          createdAt: localDate.toISOString(),
          updatedAt: localDate.toISOString(),
          syncStatus: 'pending',
        },
      ]
    );
    const set = await getDateSetInMonth(2026, 4);
    expect(set.has('2026-04-15')).toBe(true);
  });

  it('別月のページは含まれない', async () => {
    const v = await ensureActiveVolume();
    const d = new Date(2026, 2, 20, 10, 0); // 2026-03-20
    await replaceAllData(
      [
        {
          id: v.id,
          ordinal: v.ordinal,
          status: 'active',
          createdAt: v.createdAt,
        },
      ],
      [
        {
          id: 'p1',
          volumeId: v.id,
          pageNumber: 1,
          content: 'hello',
          createdAt: d.toISOString(),
          updatedAt: d.toISOString(),
          syncStatus: 'pending',
        },
      ]
    );
    const aprSet = await getDateSetInMonth(2026, 4);
    expect(aprSet.size).toBe(0);
    const marSet = await getDateSetInMonth(2026, 3);
    expect(marSet.has('2026-03-20')).toBe(true);
  });
});

describe('db.replaceAllData', () => {
  it('clears existing volumes/pages and inserts new ones atomically', async () => {
    // 既存データを作成
    const v = await ensureActiveVolume();
    await saveVolumeText(v.id, 'old content');
    expect((await getAllVolumes()).length).toBe(1);
    expect((await getAllPages()).length).toBeGreaterThan(0);

    const newVolumes: Volume[] = [
      {
        id: 'vol-1',
        ordinal: 1,
        status: 'completed',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'vol-2',
        ordinal: 2,
        status: 'active',
        createdAt: '2025-02-01T00:00:00.000Z',
      },
    ];
    const newPages: Page[] = [
      {
        id: 'p-1',
        volumeId: 'vol-1',
        pageNumber: 1,
        content: 'imported-1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        syncStatus: 'synced',
      },
      {
        id: 'p-2',
        volumeId: 'vol-2',
        pageNumber: 1,
        content: 'imported-2',
        createdAt: '2025-02-01T00:00:00.000Z',
        updatedAt: '2025-02-01T00:00:00.000Z',
        syncStatus: 'synced',
      },
    ];

    await replaceAllData(newVolumes, newPages);

    const vs = await getAllVolumes();
    expect(vs.length).toBe(2);
    expect(vs.map((v) => v.id).sort()).toEqual(['vol-1', 'vol-2']);
    const ps = await getAllPages();
    expect(ps.length).toBe(2);
    expect(ps.find((p) => p.id === 'p-1')?.content).toBe('imported-1');
  });

  it('handles empty arrays (clears everything)', async () => {
    const v = await ensureActiveVolume();
    await saveVolumeText(v.id, 'some');
    await replaceAllData([], []);
    expect((await getAllVolumes()).length).toBe(0);
    expect((await getAllPages()).length).toBe(0);
  });
});

describe('db.savePage (M4-T2)', () => {
  it('creates a new page when none exists', async () => {
    const v = await ensureActiveVolume();
    const saved = await savePage(v.id, 3, 'page 3 content');
    expect(saved.volumeId).toBe(v.id);
    expect(saved.pageNumber).toBe(3);
    expect(saved.content).toBe('page 3 content');
    expect(saved.syncStatus).toBe('pending');
    expect(typeof saved.id).toBe('string');
    expect(saved.id.length).toBeGreaterThan(0);
  });

  it('updates existing page content / updatedAt / syncStatus', async () => {
    const v = await ensureActiveVolume();
    const first = await savePage(v.id, 2, 'first');
    // tick to ensure updatedAt differs
    await new Promise((r) => setTimeout(r, 5));
    const second = await savePage(v.id, 2, 'second');
    expect(second.id).toBe(first.id);
    expect(second.content).toBe('second');
    expect(second.syncStatus).toBe('pending');
    expect(second.updatedAt >= first.updatedAt).toBe(true);
  });

  it('does not touch other pages (updatedAt / content unchanged)', async () => {
    const v = await ensureActiveVolume();
    // seed pages 1,2,3,4,5 via saveVolumeText (fills page 1 only via savePage for determinism)
    await savePage(v.id, 1, 'p1');
    await savePage(v.id, 2, 'p2');
    await savePage(v.id, 3, 'p3');
    await savePage(v.id, 4, 'p4');
    await savePage(v.id, 5, 'p5');
    const before = await getPagesByVolume(v.id);
    const byN = new Map(before.map((p) => [p.pageNumber, p]));
    await new Promise((r) => setTimeout(r, 5));
    await savePage(v.id, 3, 'p3-updated');
    const after = await getPagesByVolume(v.id);
    const afterByN = new Map(after.map((p) => [p.pageNumber, p]));
    for (const n of [1, 2, 4, 5]) {
      expect(afterByN.get(n)!.updatedAt).toBe(byN.get(n)!.updatedAt);
      expect(afterByN.get(n)!.content).toBe(byN.get(n)!.content);
    }
    expect(afterByN.get(3)!.content).toBe('p3-updated');
  });
});

describe('db.updateVolumeLastOpenedPage (M4-T2)', () => {
  it('persists lastOpenedPage on the volume', async () => {
    const v = await ensureActiveVolume();
    await updateVolumeLastOpenedPage(v.id, 7);
    const got = await getVolume(v.id);
    expect(got?.lastOpenedPage).toBe(7);
  });

  it('is a no-op when volume does not exist', async () => {
    await updateVolumeLastOpenedPage('missing-id', 3);
    // no throw
    expect(true).toBe(true);
  });
});

describe('db.getLatestUpdatedPageNumber (M4-T2)', () => {
  it('returns 1 for a volume with no pages', async () => {
    // Create a volume without Page #1 by using replaceAllData
    await replaceAllData(
      [
        {
          id: 'v-empty',
          ordinal: 1,
          status: 'active',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      []
    );
    expect(await getLatestUpdatedPageNumber('v-empty')).toBe(1);
  });

  it('returns the page number of the page with latest updatedAt', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    await new Promise((r) => setTimeout(r, 5));
    await savePage(v.id, 2, 'b');
    await new Promise((r) => setTimeout(r, 5));
    await savePage(v.id, 3, 'c');
    // update page 2 last
    await new Promise((r) => setTimeout(r, 5));
    await savePage(v.id, 2, 'b-latest');
    expect(await getLatestUpdatedPageNumber(v.id)).toBe(2);
  });
});

describe('db v2: Volume.lastOpenedPage roundtrip', () => {
  it('getPage still works after DB v2 migration', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 4, 'hello');
    const p = await getPage(v.id, 4);
    expect(p?.content).toBe('hello');
  });
});

/**
 * M7-T7: v1 スキーマで書いたデータを v2 で open して読めることを保証する。
 * 本テストでは「素の IndexedDB」で v1 のストア構成を作り、そこにレコードを入れてから
 * `getDB()` (DB_VERSION=2) で再 open することで upgrade パスを通過させる。
 *
 * 重要な既存データ:
 *  - Volume は lastOpenedPage が undefined のまま読める（optional フィールド）
 *  - Page は id/content/updatedAt 等すべて保持される
 */
describe('db v2 migration from v1 (M7-T7)', () => {
  it('opens a pre-existing v1 DB and reads existing records without loss', async () => {
    // 1) 素の IndexedDB で v1 スキーマを構築しレコードを入れる
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const vs = db.createObjectStore('volumes', { keyPath: 'id' });
        vs.createIndex('by-status', 'status');
        vs.createIndex('by-ordinal', 'ordinal');
        const ps = db.createObjectStore('pages', { keyPath: 'id' });
        ps.createIndex('by-volume-page', ['volumeId', 'pageNumber']);
        ps.createIndex('by-volume', 'volumeId');
        ps.createIndex('by-createdAt', 'createdAt');
        ps.createIndex('by-syncStatus', 'syncStatus');
        db.createObjectStore('meta');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['volumes', 'pages'], 'readwrite');
        tx.objectStore('volumes').put({
          id: 'v-old',
          ordinal: 1,
          status: 'active',
          createdAt: '2025-01-01T00:00:00.000Z',
        } as Volume);
        tx.objectStore('pages').put({
          id: 'p-old',
          volumeId: 'v-old',
          pageNumber: 1,
          content: 'legacy body',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          syncStatus: 'synced',
        } as Page);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // 2) 新バージョンで open（upgrade パスを通過）→ 既存レコードが読める
    const v = await getVolume('v-old');
    expect(v).toBeTruthy();
    expect(v?.id).toBe('v-old');
    // v1 データには lastOpenedPage が無い。undefined のまま読めること。
    expect(v?.lastOpenedPage).toBeUndefined();

    const p = await getPage('v-old', 1);
    expect(p?.content).toBe('legacy body');
    expect(p?.syncStatus).toBe('synced');
  });

  it('can write lastOpenedPage on a v1-origin volume after v2 upgrade', async () => {
    // v1 レコードを作成
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const vs = db.createObjectStore('volumes', { keyPath: 'id' });
        vs.createIndex('by-status', 'status');
        vs.createIndex('by-ordinal', 'ordinal');
        const ps = db.createObjectStore('pages', { keyPath: 'id' });
        ps.createIndex('by-volume-page', ['volumeId', 'pageNumber']);
        ps.createIndex('by-volume', 'volumeId');
        ps.createIndex('by-createdAt', 'createdAt');
        ps.createIndex('by-syncStatus', 'syncStatus');
        db.createObjectStore('meta');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('volumes', 'readwrite');
        tx.objectStore('volumes').put({
          id: 'v-legacy',
          ordinal: 2,
          status: 'active',
          createdAt: '2025-02-01T00:00:00.000Z',
        } as Volume);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    await updateVolumeLastOpenedPage('v-legacy', 5);
    const got = await getVolume('v-legacy');
    expect(got?.lastOpenedPage).toBe(5);
  });
});
