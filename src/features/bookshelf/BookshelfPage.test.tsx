import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  _resetDBForTests,
  ensureActiveVolume,
  replaceAllData,
  rotateVolume,
  savePage,
  updateVolumeLastOpenedPage,
} from '../../lib/db';
import {
  DB_NAME,
  LONG_PRESS_MS,
  PAGES_PER_VOLUME,
} from '../../lib/constants';
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
      name: new RegExp(`ノート ${v.ordinal}`),
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
      name: new RegExp(`ノート ${v.ordinal}`),
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
    const link = await screen.findByRole('link', { name: /ノート 1/ });
    await waitFor(() => expect(link).toHaveAttribute('href', '/book/vx/1'));
  });

  it('link href begins with /book/ (no /read/)', async () => {
    const v = await ensureActiveVolume();
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`ノート ${v.ordinal}`),
    });
    await waitFor(() =>
      expect(link.getAttribute('href')).toMatch(/^\/book\//)
    );
  });
});

describe('BookshelfPage new volume card (M6-T5)', () => {
  it('冊が 1 件以上あると「新しいノート」ボタンが表示される', async () => {
    await ensureActiveVolume();
    renderPage();
    await screen.findByRole('link', { name: /ノート 1/ });
    expect(
      screen.getByRole('button', { name: '新しいノートを作る' })
    ).toBeInTheDocument();
  });

  it('冊 0 件 → 自動作成後に「新しいノート」ボタンが表示される（1 件以上になったため）', async () => {
    // DB は wipe 済み。自動作成ロジックが走り、1 冊目ができた後にカードが出る。
    renderPage();
    await screen.findByRole('link', { name: /ノート 1/ });
    expect(
      screen.getByRole('button', { name: '新しいノートを作る' })
    ).toBeInTheDocument();
  });

  it('confirm で OK すると rotateVolume が実行され、冊が 2 件になる', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    await savePage(v.id, 2, 'b');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByRole('link', { name: /ノート 1/ });
    const btn = screen.getByRole('button', { name: '新しいノートを作る' });
    btn.click();
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /ノート \d+/ }).length).toBe(2);
    });
    // confirm メッセージにページ数が含まれる
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`2 \\/ ${PAGES_PER_VOLUME}`))
    );
    confirmSpy.mockRestore();
  });

  it('confirm で Cancel すると rotateVolume は実行されない', async () => {
    const v = await ensureActiveVolume();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByRole('link', { name: new RegExp(`ノート ${v.ordinal}`) });
    const btn = screen.getByRole('button', { name: '新しいノートを作る' });
    btn.click();
    // 十分待っても冊は増えない
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getAllByRole('link', { name: /ノート \d+/ }).length).toBe(1);
    confirmSpy.mockRestore();
  });

  it('confirm のメッセージに「現在のノートは X / PAGES_PER_VOLUME ページです」と含まれる', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    await savePage(v.id, 2, 'b');
    await savePage(v.id, 3, 'c');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByRole('link', { name: new RegExp(`ノート ${v.ordinal}`) });
    screen.getByRole('button', { name: '新しいノートを作る' }).click();
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `現在のノートは 3 / ${PAGES_PER_VOLUME} ページです`
      )
    );
    confirmSpy.mockRestore();
  });
});

/**
 * M8-4-T8-4.2 / T8-4.3: 長押し削除の統合テスト。
 * fake-indexeddb と vi.useFakeTimers は干渉するので実時間で待つ。
 * LONG_PRESS_MS (500ms) + 余裕 100ms = 600ms 待機を目安とする。
 */
describe('BookshelfPage long-press delete (M8-4)', () => {
  async function fireLongPress(el: Element) {
    firePointer(el, 'pointerDown', 0, 0);
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 100));
    firePointer(el, 'pointerUp', 0, 0);
  }

  /**
   * JSDOM の fireEvent.pointerXxx では init の clientX/clientY が渡らない
   * 既知の問題があるため、createEvent でイベントを作って defineProperty で
   * 強制的に clientX/clientY を設定してから dispatch する。
   */
  function firePointer(
    el: Element,
    kind: 'pointerDown' | 'pointerMove' | 'pointerUp',
    clientX: number,
    clientY: number
  ) {
    const ev = createEvent[kind](el, { clientX, clientY });
    Object.defineProperty(ev, 'clientX', { get: () => clientX });
    Object.defineProperty(ev, 'clientY', { get: () => clientY });
    fireEvent(el, ev);
  }

  it('短いタップでは Link 遷移を妨げない（長押し不成立）', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`ノート ${v.ordinal}`),
    });
    firePointer(link, 'pointerDown', 0, 0);
    firePointer(link, 'pointerUp', 0, 0);
    // 短いタップでは confirm は呼ばれない
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('500ms 長押しで confirm が 1 回目に呼ばれる', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`ノート ${v.ordinal}`),
    });
    await fireLongPress(link);
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    // 1 段階目の文言: 全 N ページを…
    expect(confirmSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('全 1 ページ')
    );
    confirmSpy.mockRestore();
  });

  it('pointerMove で 15px 超えると confirm は呼ばれない（キャンセル）', async () => {
    const v = await ensureActiveVolume();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`ノート ${v.ordinal}`),
    });
    firePointer(link, 'pointerDown', 0, 0);
    firePointer(link, 'pointerMove', 15, 0);
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 100));
    firePointer(link, 'pointerUp', 15, 0);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('1 回目キャンセルで削除されない', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`ノート ${v.ordinal}`),
    });
    await fireLongPress(link);
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    // 削除されていないのでまだ同じ冊がある
    await new Promise((r) => setTimeout(r, 200));
    expect(
      screen.getByRole('link', { name: new RegExp(`ノート ${v.ordinal}`) })
    ).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('1 回目 OK → 2 回目キャンセルで削除されない', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'a');
    // 1 回目 true, 2 回目 false
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    renderPage();
    const link = await screen.findByRole('link', {
      name: new RegExp(`ノート ${v.ordinal}`),
    });
    await fireLongPress(link);
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(2));
    // まだ残っている
    await new Promise((r) => setTimeout(r, 200));
    expect(
      screen.getByRole('link', { name: new RegExp(`ノート ${v.ordinal}`) })
    ).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('ページ 0 枚の冊は 1 段階 confirm で削除（2 冊 → 1 冊になる E2E）', async () => {
    // replaceAllData で直接 0 ページ冊を含む状態を作る
    // (ensureActiveVolume / rotateVolume は page 1 を自動生成するため使えない)
    const volumes: Volume[] = [
      {
        id: 'v-keep',
        ordinal: 1,
        status: 'completed',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'v-empty',
        ordinal: 2,
        status: 'active',
        createdAt: '2025-02-01T00:00:00.000Z',
      },
    ];
    const pages: Page[] = [
      {
        id: 'p1',
        volumeId: 'v-keep',
        pageNumber: 1,
        content: 'keep',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        syncStatus: 'pending',
      },
    ];
    await replaceAllData(volumes, pages);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /ノート \d+/ }).length).toBe(2);
    });
    // 第2冊（active・0 ページ）を長押し削除
    const link2 = screen.getByRole('link', { name: /ノート 2/ });
    await fireLongPress(link2);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /ノート \d+/ }).length).toBe(1)
    );
    // 1 段階のみ
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      'このノートを削除します。よろしいですか？'
    );
    confirmSpy.mockRestore();
  });

  it('2 冊 → 1 冊長押し削除 → 残 1 冊 (E2E)', async () => {
    const first = await ensureActiveVolume();
    await savePage(first.id, 1, 'keep');
    await savePage(first.id, 2, 'keep2');
    await rotateVolume(first.id); // 第2冊（active）
    // 第2冊にもページを足す
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /ノート \d+/ }).length).toBe(2);
    });
    // 第1冊を削除（2 ページある → 2 段階 confirm）
    const link1 = screen.getByRole('link', { name: /ノート 1/ });
    await fireLongPress(link1);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /ノート \d+/ }).length).toBe(1)
    );
    expect(
      screen.queryByRole('link', { name: /ノート 1/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ノート 2/ })).toBeInTheDocument();
    // 2 段階呼ばれている
    expect(confirmSpy).toHaveBeenCalledTimes(2);
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
    const link = await screen.findByRole('link', { name: /ノート 1/ });
    expect(link).toBeInTheDocument();
    // Also ensure "まだ冊がありません" empty state is not shown
    expect(screen.queryByText('まだノートがありません')).toBeNull();
  });

  it('does not add a new volume when one already exists (idempotent)', async () => {
    const v = await ensureActiveVolume();
    renderPage();
    await screen.findByRole('link', { name: new RegExp(`ノート ${v.ordinal}`) });
    // Only one card should be rendered
    const cards = screen.getAllByRole('link', { name: /ノート \d+/ });
    expect(cards.length).toBe(1);
  });
});
