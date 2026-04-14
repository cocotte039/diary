import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetDBForTests,
  getAllPages,
  getAllVolumes,
  setGitHubSettings,
} from './db';
import { DB_NAME } from './constants';
import { parseBackupPath, importFromGitHub } from './github';

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

vi.mock('@octokit/rest', () => {
  const encode = (s: string) =>
    btoa(
      Array.from(new TextEncoder().encode(s))
        .map((b) => String.fromCharCode(b))
        .join('')
    );
  class MockOctokit {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {}
    repos = {
      get: vi.fn(async () => ({ data: { default_branch: 'main' } })),
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
