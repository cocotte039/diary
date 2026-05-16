import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetDBForTests,
  addMemo,
  getAllPages,
  getAllVolumes,
  getPendingMemos,
  setGitHubSettings,
} from './db';
import { DB_NAME } from './constants';
import {
  buildMemoFileContent,
  parseBackupPath,
  importFromGitHub,
  syncPendingMemos,
} from './github';
import type { Memo } from '../types';

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
  vi.restoreAllMocks();
});

describe('parseBackupPath', () => {
  it('parses valid page path', () => {
    const r = parseBackupPath(
      'volumes/001-abc12345-6789-4def-8000-000000000001/page-03.txt'
    );
    expect(r).toEqual({
      path: 'volumes/001-abc12345-6789-4def-8000-000000000001/page-03.txt',
      ordinal: 1,
      volumeId: 'abc12345-6789-4def-8000-000000000001',
      pageNumber: 3,
    });
  });

  it('rejects paths outside volumes/', () => {
    expect(parseBackupPath('README.md')).toBeNull();
    expect(parseBackupPath('notes/001-xxx/page-01.txt')).toBeNull();
  });

  it('rejects missing page number', () => {
    expect(parseBackupPath('volumes/001-xxx/page.txt')).toBeNull();
  });

  it('rejects non-txt extension', () => {
    expect(parseBackupPath('volumes/001-xxx/page-01.md')).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// importFromGitHub — Octokit を vi.mock で差し替える
// -----------------------------------------------------------------------------

// 全 MockOctokit インスタンス間で共有する PUT 記録（syncPendingMemos 検証用）。
// vi.mock は巻き上げられるため vi.hoisted で先に生成する。
const putRecorder = vi.hoisted(() => ({
  calls: [] as Array<{ path: string; content: string }>,
  reset() {
    this.calls = [];
  },
}));

vi.mock('@octokit/rest', () => {
  const encode = (s: string) =>
    btoa(
      Array.from(new TextEncoder().encode(s))
        .map((b) => String.fromCharCode(b))
        .join('')
    );
  const decode = (b64: string) => {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  };
  class MockOctokit {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {}
    repos = {
      get: vi.fn(async () => ({ data: { default_branch: 'main' } })),
      getContent: vi.fn(async () => {
        // memos/*.md は初回新規作成扱い（404）。
        const err = new Error('Not Found') as Error & { status: number };
        err.status = 404;
        throw err;
      }),
      createOrUpdateFileContents: vi.fn(
        async ({ path, content }: { path: string; content: string }) => {
          putRecorder.calls.push({ path, content: decode(content) });
          return { data: { content: { sha: 'newsha-' + path } } };
        }
      ),
      listCommits: vi.fn(async () => ({
        data: [
          {
            commit: {
              committer: { date: '2026-01-15T10:00:00.000Z' },
              author: { date: '2026-01-15T10:00:00.000Z' },
            },
          },
        ],
      })),
    };
    git = {
      getRef: vi.fn(async () => ({
        data: { object: { sha: 'headsha' } },
      })),
      getTree: vi.fn(async () => ({
        data: {
          tree: [
            { type: 'tree', path: 'volumes', sha: 't1' },
            { type: 'tree', path: 'volumes/001-v1', sha: 't2' },
            {
              type: 'blob',
              path: 'volumes/001-v1/page-01.txt',
              sha: 'b1',
            },
            {
              type: 'blob',
              path: 'volumes/001-v1/page-02.txt',
              sha: 'b2',
            },
            {
              type: 'blob',
              path: 'volumes/002-v2/page-01.txt',
              sha: 'b3',
            },
            { type: 'blob', path: 'README.md', sha: 'b4' },
          ],
        },
      })),
      getBlob: vi.fn(async ({ file_sha }: { file_sha: string }) => {
        const contents: Record<string, string> = {
          b1: '冊1ページ1',
          b2: '冊1ページ2',
          b3: '冊2ページ1',
        };
        return { data: { content: encode(contents[file_sha] ?? '') } };
      }),
    };
  }
  return { Octokit: MockOctokit };
});

// -----------------------------------------------------------------------------
// buildMemoFileContent (M4-T2) — 純粋関数
// -----------------------------------------------------------------------------

function mkMemo(p: Partial<Memo> & { createdAt: string }): Memo {
  return {
    id: p.id ?? crypto.randomUUID(),
    content: p.content ?? '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt ?? p.createdAt,
    syncStatus: p.syncStatus ?? 'pending',
  };
}

describe('buildMemoFileContent (M4-T2)', () => {
  it('同日複数メモを時刻昇順で `## HH:MM:SS\\n本文` 連結', () => {
    const a = mkMemo({
      content: 'ten thirty',
      createdAt: '2026-05-17T10:30:00',
    });
    const b = mkMemo({
      content: 'eight am',
      createdAt: '2026-05-17T08:05:09',
    });
    const out = buildMemoFileContent([a, b]);
    const idxEarly = out.indexOf('eight am');
    const idxLate = out.indexOf('ten thirty');
    expect(idxEarly).toBeGreaterThanOrEqual(0);
    expect(idxLate).toBeGreaterThan(idxEarly);
    expect(out).toContain('## 08:05:09\neight am');
    expect(out).toContain('## 10:30:00\nten thirty');
  });

  it('空配列は空文字', () => {
    expect(buildMemoFileContent([])).toBe('');
  });
});

// -----------------------------------------------------------------------------
// syncPendingMemos (M4-T2 / M4-T4)
// -----------------------------------------------------------------------------

describe('syncPendingMemos (M4-T2)', () => {
  beforeEach(() => {
    putRecorder.reset();
  });

  it('settings 無 → {0,0} 早期 return（PUT なし）', async () => {
    const r = await syncPendingMemos();
    expect(r).toEqual({ synced: 0, failed: 0 });
    expect(putRecorder.calls).toHaveLength(0);
  });

  it('オフライン → {0,0} 早期 return', async () => {
    await setGitHubSettings({ token: 'x', owner: 'me', repo: 'backup' });
    await addMemo('offline memo');
    const spy = vi
      .spyOn(navigator, 'onLine', 'get')
      .mockReturnValue(false);
    try {
      const r = await syncPendingMemos();
      expect(r).toEqual({ synced: 0, failed: 0 });
      expect(putRecorder.calls).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('複数日 pending → 各日 memos/YYYY-MM-DD.md に PUT、当該日メモ synced 化', async () => {
    await setGitHubSettings({ token: 'x', owner: 'me', repo: 'backup' });
    // システム時刻を制御して createdAt を確定（JST = UTC+9）。
    // 00:00:00Z → 09:00:00 JST（dateKey=同日）
    await addMemoAt('day A first', '2026-05-17T00:00:00.000Z'); // 09:00:00
    await addMemoAt('day A second', '2026-05-17T02:00:00.000Z'); // 11:00:00
    await addMemoAt('day B only', '2026-05-17T22:30:00.000Z'); // 翌日 07:30:00

    const r = await syncPendingMemos();
    expect(r.failed).toBe(0);
    const paths = putRecorder.calls.map((c) => c.path).sort();
    expect(paths).toEqual([
      'memos/2026-05-17.md',
      'memos/2026-05-18.md',
    ]);
    const dayA = putRecorder.calls.find(
      (c) => c.path === 'memos/2026-05-17.md'
    )!;
    expect(dayA.content).toContain('## 09:00:00\nday A first');
    expect(dayA.content).toContain('## 11:00:00\nday A second');
    const idxA = dayA.content.indexOf('day A first');
    const idxB = dayA.content.indexOf('day A second');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThan(idxA);

    const dayB = putRecorder.calls.find(
      (c) => c.path === 'memos/2026-05-18.md'
    )!;
    expect(dayB.content).toContain('## 07:30:00\nday B only');

    // 全件 synced 化（pending 0 件）
    expect(await getPendingMemos()).toHaveLength(0);
  });

  it('生成→PUT 間に追加された pending メモは synced 化されない（E3/C2）', async () => {
    await setGitHubSettings({ token: 'x', owner: 'me', repo: 'backup' });
    await addMemoAt('original', '2026-05-17T00:00:00.000Z'); // 09:00:00

    await syncPendingMemos();
    expect(await getPendingMemos()).toHaveLength(0);

    // 同日に新規 pending 追加 → 次回 sync で再生成され synced 化
    const m2 = await addMemoAt('added later', '2026-05-17T01:00:00.000Z');
    expect((await getPendingMemos()).map((m) => m.id)).toEqual([m2.id]);

    putRecorder.reset();
    await syncPendingMemos();
    const day = putRecorder.calls.find(
      (c) => c.path === 'memos/2026-05-17.md'
    )!;
    expect(day.content).toContain('## 09:00:00\noriginal');
    expect(day.content).toContain('## 10:00:00\nadded later');
    expect(await getPendingMemos()).toHaveLength(0);
  });
});

// テスト用: システム時刻を iso に固定して addMemo（createdAt を決定化）
async function addMemoAt(content: string, iso: string): Promise<Memo> {
  // Date のみ偽装（setTimeout は本物のまま＝idb/backoff 非干渉）。
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  try {
    return await addMemo(content);
  } finally {
    vi.useRealTimers();
  }
}

describe('importFromGitHub', () => {
  it('imports volumes and pages, marks latest ordinal as active', async () => {
    await setGitHubSettings({
      token: 'x',
      owner: 'me',
      repo: 'backup',
    });

    const progress: string[] = [];
    const res = await importFromGitHub((p) => {
      progress.push(`${p.phase}:${p.current}/${p.total}`);
    });

    expect(res).toEqual({ volumes: 2, pages: 3 });

    const vs = await getAllVolumes();
    expect(vs.map((v) => v.id).sort()).toEqual(['v1', 'v2']);
    const v1 = vs.find((v) => v.id === 'v1')!;
    const v2 = vs.find((v) => v.id === 'v2')!;
    expect(v1.ordinal).toBe(1);
    expect(v2.ordinal).toBe(2);
    expect(v1.status).toBe('completed');
    expect(v2.status).toBe('active');

    const ps = await getAllPages();
    expect(ps.length).toBe(3);
    const p1 = ps.find(
      (p) => p.volumeId === 'v1' && p.pageNumber === 1
    )!;
    expect(p1.content).toBe('冊1ページ1');
    expect(p1.syncStatus).toBe('synced');
    // commit 日時がそのまま入る
    expect(p1.createdAt).toBe('2026-01-15T10:00:00.000Z');
    expect(p1.updatedAt).toBe('2026-01-15T10:00:00.000Z');

    expect(progress.some((s) => s.startsWith('preparing'))).toBe(true);
    expect(progress.some((s) => s.startsWith('fetching'))).toBe(true);
    expect(progress.some((s) => s.startsWith('done'))).toBe(true);
  });

  it('throws when settings missing', async () => {
    await expect(importFromGitHub()).rejects.toThrow(
      /GitHub 設定が保存されていません/
    );
  });
});
