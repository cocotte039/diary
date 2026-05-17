import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { _resetDBForTests, getAllMemos, replaceAllData } from '../../lib/db';
import { DB_NAME, LONG_PRESS_MS } from '../../lib/constants';
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

/**
 * M3-T5: MemoListItem タップ編集・長押し削除。
 * VolumeCard / BookshelfPage.test の長押し作法を踏襲。
 * fake-indexeddb と vi.useFakeTimers は干渉するので実時間で待つ
 * （LONG_PRESS_MS + 100ms）。
 */
describe('LogListPage MemoListItem (M3-T5)', () => {
  /**
   * JSDOM の fireEvent.pointerXxx は init の clientX/clientY を渡さない既知問題が
   * あるため createEvent + defineProperty で強制してから dispatch する。
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

  async function fireLongPress(el: Element) {
    firePointer(el, 'pointerDown', 0, 0);
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 100));
    firePointer(el, 'pointerUp', 0, 0);
  }

  function LocationProbe({ onChange }: { onChange: (p: string) => void }) {
    const loc = useLocation();
    onChange(loc.pathname);
    return null;
  }

  function renderWithRoutes(initial = '/log') {
    let path = '';
    const utils = render(
      <MemoryRouter initialEntries={[initial]}>
        <LocationProbe onChange={(p) => (path = p)} />
        <Routes>
          <Route path="/log" element={<LogListPage />} />
          <Route
            path="/log/:memoId"
            element={<div data-testid="memo-editor" />}
          />
        </Routes>
      </MemoryRouter>
    );
    return { ...utils, getPath: () => path };
  }

  it('行タップで /log/:id 編集へ遷移する', async () => {
    await replaceAllData([], [], [
      {
        id: 'm1',
        content: 'tap me',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    const { getPath } = renderWithRoutes();
    const row = await screen.findByText('tap me');
    firePointer(row, 'pointerDown', 0, 0);
    firePointer(row, 'pointerUp', 0, 0);
    fireEvent.click(row);
    await waitFor(() => expect(getPath()).toBe('/log/m1'));
    expect(screen.getByTestId('memo-editor')).toBeInTheDocument();
  });

  it('長押し→confirm→deleteMemo→一覧から消える（再ロード反映）', async () => {
    await replaceAllData([], [], [
      {
        id: 'd1',
        content: 'delete me',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
      {
        id: 'd2',
        content: 'keep me',
        createdAt: '2026-05-16T06:00:00.000Z',
        updatedAt: '2026-05-16T06:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithRoutes();
    const row = await screen.findByText('delete me');
    await fireLongPress(row);
    await waitFor(() =>
      expect(screen.queryByText('delete me')).not.toBeInTheDocument()
    );
    expect(screen.getByText('keep me')).toBeInTheDocument();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('長押し発火後の click は遷移しない（longPressFiredRef guard）', async () => {
    await replaceAllData([], [], [
      {
        id: 'g1',
        content: 'guarded',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { getPath } = renderWithRoutes();
    const row = await screen.findByText('guarded');
    await fireLongPress(row);
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    fireEvent.click(row);
    // 長押し成立後の click は遷移を抑止
    await new Promise((r) => setTimeout(r, 100));
    expect(getPath()).toBe('/log');
    confirmSpy.mockRestore();
  });

  it('move tolerance 超で動いたら長押しキャンセル（誤削除防止）', async () => {
    await replaceAllData([], [], [
      {
        id: 'mv1',
        content: 'moved',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithRoutes();
    const row = await screen.findByText('moved');
    firePointer(row, 'pointerDown', 0, 0);
    firePointer(row, 'pointerMove', 30, 0);
    await new Promise((r) => setTimeout(r, LONG_PRESS_MS + 100));
    firePointer(row, 'pointerUp', 30, 0);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('空メモ行は「（空のメモ）」プレースホルダ（タップは編集へ）', async () => {
    await replaceAllData([], [], [
      {
        id: 'e1',
        content: '   ',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    const { getPath } = renderWithRoutes();
    const row = await screen.findByText('（空のメモ）');
    firePointer(row, 'pointerDown', 0, 0);
    firePointer(row, 'pointerUp', 0, 0);
    fireEvent.click(row);
    await waitFor(() => expect(getPath()).toBe('/log/e1'));
  });

  it('最後の1件を削除→空状態へ（クラッシュなし, E11）', async () => {
    await replaceAllData([], [], [
      {
        id: 'last',
        content: 'last one',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithRoutes();
    const row = await screen.findByText('last one');
    await fireLongPress(row);
    expect(
      await screen.findByText('まだメモがありません')
    ).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});

/**
 * M1-T3-1: MemoMenu / ペン FAB / MemoCalendar モーダル / 日付スクロール。
 * 既存テストは無変更（本 describe を追記のみ）。
 * scrollIntoView は jsdom 未実装のため vi.fn() モック。requestAnimationFrame は
 * 二重 rAF を同期実行させて scrollToDate の getElementById 経路を検証。
 */
describe('LogListPage MemoMenu/FAB/Calendar (M1)', () => {
  let scrollSpy: ReturnType<typeof vi.fn>;
  const origRaf = window.requestAnimationFrame;

  beforeEach(() => {
    scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    // 二重 rAF を同期的にフラッシュ（state 反映後フレーム相当をテストで再現）。
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof window.requestAnimationFrame;
  });
  afterEach(() => {
    window.requestAnimationFrame = origRaf;
  });

  function LocationProbe({
    onChange,
  }: {
    onChange: (p: string, s: unknown) => void;
  }) {
    const loc = useLocation();
    onChange(loc.pathname, loc.state);
    return null;
  }

  function renderApp(initial = '/log') {
    let path = '';
    let state: unknown = null;
    const utils = render(
      <MemoryRouter initialEntries={[initial]}>
        <LocationProbe
          onChange={(p, s) => {
            path = p;
            state = s;
          }}
        />
        <Routes>
          <Route path="/log" element={<LogListPage />} />
          <Route path="/log/new" element={<div data-testid="memo-new" />} />
          <Route path="/settings" element={<div data-testid="settings" />} />
        </Routes>
      </MemoryRouter>
    );
    return { ...utils, getPath: () => path, getState: () => state };
  }

  it('MemoMenu trigger click で開き、外部 pointerdown / Escape で閉じる', async () => {
    renderApp();
    await screen.findByText('まだメモがありません');
    const trigger = screen.getByRole('button', { name: 'メニューを開く' });

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // 外部 pointerdown で閉じる
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    // 再度開いて Escape で閉じる
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('メニュー「設定」で /settings へ遷移しメニューが閉じる', async () => {
    const { getPath } = renderApp();
    await screen.findByText('まだメモがありません');
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '設定' }));
    await waitFor(() => expect(getPath()).toBe('/settings'));
    expect(screen.getByTestId('settings')).toBeInTheDocument();
  });

  it('ペン FAB タップで /log/new へ state.from="/log"', async () => {
    const { getPath, getState } = renderApp();
    await screen.findByText('まだメモがありません');
    fireEvent.click(screen.getByRole('button', { name: 'メモを書く' }));
    await waitFor(() => expect(getPath()).toBe('/log/new'));
    expect((getState() as { from?: string } | null)?.from).toBe('/log');
    expect(screen.getByTestId('memo-new')).toBeInTheDocument();
  });

  it('カレンダー項目→モーダル open、背景 click / × / Escape で閉じる', async () => {
    renderApp();
    await screen.findByText('まだメモがありません');

    // 背景クリックで閉じる
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'カレンダー' }));
    const overlay = await screen.findByRole('dialog', { name: 'カレンダー' });
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // × ボタンで閉じる
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'カレンダー' }));
    await screen.findByRole('dialog', { name: 'カレンダー' });
    fireEvent.click(
      screen.getByRole('button', { name: 'カレンダーを閉じる' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Escape で閉じる
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'カレンダー' }));
    await screen.findByRole('dialog', { name: 'カレンダー' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('ドット日 click → モーダル閉 + scrollIntoView が該当 section で呼出（JST境界）', async () => {
    // UTC 深夜だが JST(+9) ローカルでは 2026-05-16。dateKey と section id 一致を確認。
    await seedMemos([
      {
        id: 's1',
        content: 'boundary memo',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    renderApp();
    await screen.findByText('boundary memo');

    const d = new Date('2026-05-16T00:00:00.000Z');
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    const dk = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // section id がローカル日付ベースで付与されている
    const section = document.getElementById(`memo-date-${dk}`);
    expect(section).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'カレンダー' }));
    await screen.findByRole('dialog', { name: 'カレンダー' });

    // カレンダーの該当日セル（ドットあり）をクリック
    const cell = await screen.findByRole('button', {
      name: `${y}年${mo}月${day}日`,
    });
    fireEvent.click(cell);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.instances[0]).toBe(section);
  });

  it('ドット無し日 click → scrollIntoView 未呼出・モーダル開維持（無反応）', async () => {
    // 5/16 にのみメモ。5/16 以外（例: 1日）はドット無し。
    await seedMemos([
      {
        id: 's2',
        content: 'only one day',
        createdAt: '2026-05-16T05:00:00.000Z',
        updatedAt: '2026-05-16T05:00:00.000Z',
        syncStatus: 'pending',
      },
    ]);
    renderApp();
    await screen.findByText('only one day');

    const d = new Date('2026-05-16T05:00:00.000Z');
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'カレンダー' }));
    await screen.findByRole('dialog', { name: 'カレンダー' });

    // 1 日（メモ無し）をクリック → 無反応
    const emptyCell = await screen.findByRole('button', {
      name: `${y}年${mo}月1日`,
    });
    fireEvent.click(emptyCell);

    await new Promise((r) => setTimeout(r, 50));
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'カレンダー' })).toBeInTheDocument();
  });
});
