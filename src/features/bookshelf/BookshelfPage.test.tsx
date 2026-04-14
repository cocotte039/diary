import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  _resetDBForTests,
  ensureActiveVolume,
  replaceAllData,
  savePage,
  updateVolumeLastOpenedPage,
} from '../../lib/db';
import { DB_NAME } from '../../lib/constants';
import BookshelfPage from './BookshelfPage';
import type { Page, Volume } from '../../types';

vi.mock('../../lib/github', () => ({
  syncPendingPagesBackground: vi.fn(),
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

beforeEach(async () => {
  await wipeDB();
});
afterEach(async () => {
  await wipeDB();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <BookshelfPage />
    </MemoryRouter>
  );
}

describe('BookshelfPage link targets (M4-T5)', () => {
  it('links to /book/{id}/{lastOpenedPage} when lastOpenedPage is set', async () => {
    const v = await ensureActiveVolume();
    await updateVolumeLastOpenedPage(v.id, 4);
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`第${v.ordinal}冊`),
    });
    await waitFor(() =>
      expect(link).toHaveAttribute('href', `/book/${v.id}/4`)
    );
  });

  it('falls back to latest-updated page when lastOpenedPage is missing', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    // small gap so updatedAt differs
    await new Promise((r) => setTimeout(r, 5));
    await savePage(v.id, 3, 'c');
    await new Promise((r) => setTimeout(r, 5));
    await savePage(v.id, 2, 'b-latest'); // page 2 has latest updatedAt
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`第${v.ordinal}冊`),
    });
    await waitFor(() =>
      expect(link).toHaveAttribute('href', `/book/${v.id}/2`)
    );
  });

  it('uses page 1 for a brand-new volume with no pages', async () => {
    const volumes: Volume[] = [
      {
        id: 'vx',
        ordinal: 1,
        status: 'active',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    const pages: Page[] = [];
    await replaceAllData(volumes, pages);
    renderPage();
    const link = await screen.findByRole('link', { name: /第1冊/ });
    await waitFor(() => expect(link).toHaveAttribute('href', '/book/vx/1'));
  });

  it('link href begins with /book/ (no /read/)', async () => {
    const v = await ensureActiveVolume();
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`第${v.ordinal}冊`),
    });
    await waitFor(() =>
      expect(link.getAttribute('href')).toMatch(/^\/book\//)
    );
  });
});

describe('BookshelfPage new volume card (M6-T5)', () => {
  it('冊が 1 件以上あると「新しい冊」ボタンが表示される', async () => {
    await ensureActiveVolume();
    renderPage();
    await screen.findByRole('link', { name: /第1冊/ });
    expect(
      screen.getByRole('button', { name: '新しい冊を作る' })
    ).toBeInTheDocument();
  });

  it('冊 0 件 → 自動作成後に「新しい冊」ボタンが表示される（1 件以上になったため）', async () => {
    // DB は wipe 済み。自動作成ロジックが走り、1 冊目ができた後にカードが出る。
    renderPage();
    await screen.findByRole('link', { name: /第1冊/ });
    expect(
      screen.getByRole('button', { name: '新しい冊を作る' })
    ).toBeInTheDocument();
  });

  it('confirm で OK すると rotateVolume が実行され、冊が 2 件になる', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    await savePage(v.id, 2, 'b');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByRole('link', { name: /第1冊/ });
    const btn = screen.getByRole('button', { name: '新しい冊を作る' });
    btn.click();
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /第\d+冊/ }).length).toBe(2);
    });
    // confirm メッセージにページ数が含まれる
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringMatching(/2 \/ 50/)
    );
    confirmSpy.mockRestore();
  });

  it('confirm で Cancel すると rotateVolume は実行されない', async () => {
    const v = await ensureActiveVolume();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByRole('link', { name: new RegExp(`第${v.ordinal}冊`) });
    const btn = screen.getByRole('button', { name: '新しい冊を作る' });
    btn.click();
    // 十分待っても冊は増えない
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getAllByRole('link', { name: /第\d+冊/ }).length).toBe(1);
    confirmSpy.mockRestore();
  });

  it('confirm のメッセージに「現在の冊は X / 50 ページです」と含まれる', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    await savePage(v.id, 2, 'b');
    await savePage(v.id, 3, 'c');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByRole('link', { name: new RegExp(`第${v.ordinal}冊`) });
    screen.getByRole('button', { name: '新しい冊を作る' }).click();
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('現在の冊は 3 / 50 ページです')
    );
    confirmSpy.mockRestore();
  });
});

describe('BookshelfPage auto-create & header (M4-T6)', () => {
  it('does not render the old 書く header link', async () => {
    await ensureActiveVolume();
    renderPage();
    await screen.findByRole('heading', { name: '本棚' });
    expect(screen.queryByRole('link', { name: '書く' })).toBeNull();
  });

  it('auto-creates an initial volume when DB is empty', async () => {
    // DB is wiped in beforeEach; no ensureActiveVolume call here
    renderPage();
    const link = await screen.findByRole('link', { name: /第1冊/ });
    expect(link).toBeInTheDocument();
    // Also ensure "まだ冊がありません" empty state is not shown
    expect(screen.queryByText('まだ冊がありません')).toBeNull();
  });

  it('does not add a new volume when one already exists (idempotent)', async () => {
    const v = await ensureActiveVolume();
    renderPage();
    await screen.findByRole('link', { name: new RegExp(`第${v.ordinal}冊`) });
    // Only one card should be rendered
    const cards = screen.getAllByRole('link', { name: /第\d+冊/ });
    expect(cards.length).toBe(1);
  });
});
