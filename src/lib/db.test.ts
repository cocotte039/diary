import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetDBForTests,
  ensureActiveVolume,
  getAllPages,
  getAllVolumes,
  getPagesByVolume,
  loadVolumeText,
  replaceAllData,
  rotateVolume,
  saveVolumeText,
  findPageByDate,
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

  it('creates additional pages when text grows past 30 lines', async () => {
    const v = await ensureActiveVolume();
    const text = Array.from({ length: 31 }, (_, i) => `L${i}`).join('\n');
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
    const big = Array.from({ length: 75 }, (_, i) => `line-${i}`).join('\n');
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
