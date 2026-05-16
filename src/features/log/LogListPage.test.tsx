import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { _resetDBForTests, getAllMemos, replaceAllData } from '../../lib/db';
import { DB_NAME } from '../../lib/constants';
import LogListPage from './LogListPage';
import type { Memo } from '../../types';

vi.mock('../../lib/github', () => ({
  syncPendingPagesBackground: vi.fn(),
  syncPendingMemosBackground: vi.fn(),
}));

async function wipeDB() {
  await _resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/**
 * memos ストアに任意 createdAt の Memo 群を投入する。
 * replaceAllData(volumes, pages, memos) で memos を明示すると memos ストアが
 * 置換される（addMemo は createdAt=now 固定のため日付境界テストに使えない）。
 */
async function seedMemos(memos: Memo[]) {
  await replaceAllData([], [], memos);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/log']}>
      <LogListPage />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await wipeDB();
});
afterEach(async () => {
  await wipeDB();
});

describe('LogListPage (M3-T4)', () => {
  it('メモ0件 → 「まだメモがありません」', async () => {
    renderPage();
    expect(await screen.findByText('まだメモがありません')).toBeInTheDocument();
  });

  it('HeaderTabs が表示され「メモ」が選択状態', async () => {
    renderPage();
    await screen.findByText('まだメモがありません');
    expect(screen.getByRole('link', { name: 'メモ' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: '本棚' })).toBeInTheDocument();
  });

  it('日付降順グループ・各日内 createdAt 降順で表示', async () => {
    await seedMemos([
      {
        id: 'a',
        content: 'old day morning',
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:00:00.000Z',
        syncStatus: 'pending',
      },
      {
        id: 'b',
        content: 'old day evening',
        createdAt: '2026-05-15T10:00:00.000Z',
        updatedAt: '2026-05-15T10:00:00.000Z',
        syncStatus: 'pending',
      },
      {
        id: 'c',
        content: 'new day note',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    renderPage();
    await screen.findByText('new day note');

    // 日付見出し（ローカル日付基準）。新しい日が上。
    const headings = screen
      .getAllByRole('heading')
      .map((h) => h.textContent);
    const d16 = headings.findIndex((t) => t === '2026/05/16');
    const d15 = headings.findIndex((t) => t === '2026/05/15');
    expect(d16).toBeGreaterThanOrEqual(0);
    expect(d15).toBeGreaterThan(d16); // 16 が 15 より上

    // 同日内は createdAt 降順 → evening が morning より上
    const body = document.body.textContent ?? '';
    expect(body.indexOf('old day evening')).toBeLessThan(
      body.indexOf('old day morning')
    );
    // 新しい日のメモが古い日より上
    expect(body.indexOf('new day note')).toBeLessThan(
      body.indexOf('old day evening')
    );
  });

  it('日付見出しはローカル日付基準（dateKey）でズレない', async () => {
    // UTC では 2026-05-16 だが、JST(+9) ローカルでは 2026-05-16 09:00。
    // dateKey はローカル日付を使うので getAllMemos の整形と一致する想定。
    await seedMemos([
      {
        id: 'x',
        content: 'boundary note',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    renderPage();
    await screen.findByText('boundary note');
    const d = new Date('2026-05-16T00:00:00.000Z');
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    expect(
      screen.getByRole('heading', { name: `${y}/${m}/${day}` })
    ).toBeInTheDocument();
  });

  it('getAllMemos が本番呼出される（死蓄関数防止の配線確認）', async () => {
    // getAllMemos が実際に呼ばれることを投入データの表示で間接確認
    await seedMemos([
      {
        id: 'wired',
        content: 'wired check',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('wired check')).toBeInTheDocument()
    );
    // getAllMemos が空でないことの追加確認
    expect((await getAllMemos()).length).toBe(1);
  });
});
