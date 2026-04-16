import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import {
  _resetDBForTests,
  ensureActiveVolume,
  getPage,
  getVolume,
  savePage,
} from '../../lib/db';
import {
  DB_NAME,
  PAGES_PER_VOLUME,
  SWIPE_THRESHOLD_PX,
} from '../../lib/constants';
import EditorPage, { formatToday } from './EditorPage';

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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/book/:volumeId/:pageNumber" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** ルーティング状態監視用 probe */
function LocationProbe({ onChange }: { onChange: (pathname: string) => void }) {
  const loc = useLocation();
  onChange(loc.pathname);
  return null;
}

function renderWithLocationProbe(
  path: string,
  onChange: (pathname: string) => void
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe onChange={onChange} />
      <Routes>
        <Route path="/book/:volumeId/:pageNumber" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditorPage (M4-T3)', () => {
  it('loads and displays content of the specified page', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 3, 'third page text');
    renderAt(`/book/${v.id}/3`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('third page text'));
  });

  it('shows empty textarea for a non-existent page number', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/20`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('allows local editing (state updates)', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'typing…' } });
    expect(textarea.value).toBe('typing…');
  });

  it('header contains 本棚 link to /, current page number (no denominator), 日付挿入ボタン', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/7`);
    expect(await screen.findByRole('link', { name: '本棚に戻る' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: '今日の日付を挿入' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '設定' })).not.toBeInTheDocument();
    const indicator = screen.getByTestId('page-indicator');
    expect(indicator).toHaveTextContent('7');
    expect(indicator.textContent).not.toContain('/');
  });

  it('falls back to page 1 for out-of-range page numbers', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'first');
    renderAt(`/book/${v.id}/999`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('first'));
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('1');
  });

  it('falls back to page 1 for non-numeric page numbers', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'first');
    renderAt(`/book/${v.id}/abc`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('first'));
    expect(screen.getByTestId('page-indicator')).toHaveTextContent('1');
  });
});

describe('EditorPage back button guard (popstate → 本棚)', () => {
  it('戻るボタン(popstate) で / に navigate する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/3`, (p) => { pathname = p; });
    await screen.findByLabelText('日記本文');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(pathname).toBe('/'));
  });

  it('ページめくり後の戻るボタンでも / に戻る', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    await screen.findByLabelText('日記本文');
    fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(pathname).toBe('/'));
  });

  it('戻るボタン発火前の編集内容が flush で保存される', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'draft-before-back' } });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(async () => {
      const saved = await getPage(v.id, 1);
      expect(saved?.content).toBe('draft-before-back');
    });
  });

  it('アンマウント後の popstate では navigate が呼ばれない', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    const { unmount } = renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    await screen.findByLabelText('日記本文');
    unmount();
    pathname = '(cleared)';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(pathname).toBe('(cleared)');
  });
});

describe('EditorPage page navigation buttons (M5-T1)', () => {
  it('「次のページ」ボタンで pageNumber+1 のページに遷移する', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'one');
    await savePage(v.id, 2, 'two');
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('one'));

    fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

  it('「前のページ」ボタンで pageNumber-1 のページに遷移する', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'one');
    await savePage(v.id, 2, 'two');
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/2`, (p) => {
      pathname = p;
    });
    await screen.findByLabelText('日記本文');
    fireEvent.click(screen.getByRole('button', { name: '前のページ' }));
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/1`));
  });

  it('1 ページ目で「前のページ」ボタンが無効', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    await screen.findByLabelText('日記本文');
    const prev = screen.getByRole('button', { name: '前のページ' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });

  it('最終ページで「次のページ」ボタンが無効', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    await screen.findByLabelText('日記本文');
    const next = screen.getByRole('button', { name: '次のページ' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('遷移前に編集中のテキストが flush で保存される（データロス防止）', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    const saved = await getPage(v.id, 1);
    expect(saved?.content).toBe('unsaved draft');
  });

  it('遷移時に Volume.lastOpenedPage が次ページ番号に更新される', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    await screen.findByLabelText('日記本文');
    fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    await waitFor(async () => {
      const after = await getVolume(v.id);
      expect(after?.lastOpenedPage).toBe(2);
    });
  });
});

describe('EditorPage fade transition (M5-T2)', () => {
  it('クリック直後に surface に fading クラスが付く', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    await screen.findByLabelText('日記本文');
    const surface = screen.getByTestId('editor-surface');
    expect(surface.className).not.toMatch(/fading/);
    fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
    expect(surface.className).toMatch(/fading/);
  });

  it('フェード中の連続クリックは無視される（多重遷移防止）', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    await screen.findByLabelText('日記本文');
    const nextBtn = screen.getByRole('button', { name: '次のページ' });
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn); // 2 度目はロックで握りつぶされる
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    expect(pathname).not.toBe(`/book/${v.id}/3`);
  });

  it('遷移後は fading クラスが外れる', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    await screen.findByLabelText('日記本文');
    fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    await waitFor(() => {
      const surface = screen.getByTestId('editor-surface');
      expect(surface.className).not.toMatch(/fading/);
    });
  });
});

describe('EditorPage swipe navigation (M5-T3)', () => {
  function swipe(
    el: Element,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    fireEvent.touchStart(el, {
      touches: [{ clientX: from.x, clientY: from.y }],
    });
    fireEvent.touchEnd(el, {
      changedTouches: [{ clientX: to.x, clientY: to.y }],
    });
  }

  it('root 余白を左にスワイプすると次ページへ進む', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    await screen.findByLabelText('日記本文');
    const root = screen.getByTestId('editor-page');
    swipe(root, { x: 200, y: 100 }, { x: 120, y: 105 });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

  it('root 余白を右にスワイプすると前ページに戻る', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/2`, (p) => {
      pathname = p;
    });
    await screen.findByLabelText('日記本文');
    const root = screen.getByTestId('editor-page');
    swipe(root, { x: 80, y: 100 }, { x: 160, y: 95 });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/1`));
  });

  it('textarea 上の水平スワイプで navigate する (M8-2 B 案)', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = await screen.findByLabelText('日記本文');
    // |dx|=100, |dy|=5 → |dx| > |dy|*2 を満たす水平優位スワイプ
    swipe(textarea, { x: 200, y: 100 }, { x: 100, y: 105 });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

  it('textarea 上 |dx|=60 / |dy|=20 の水平優位スワイプで navigate する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = await screen.findByLabelText('日記本文');
    // |dx|=60, |dy|=20 → |dy|*2=40 < |dx|=60 で発火する
    swipe(textarea, { x: 200, y: 100 }, { x: 140, y: 120 });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

  it('textarea 上 |dx|=30 / |dy|=60 は navigate しない（縦優位）', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = await screen.findByLabelText('日記本文');
    // |dx|=30 < 閾値 50 でも弾かれるが、2:1 判定も満たさないため navigate されない
    swipe(textarea, { x: 100, y: 50 }, { x: 70, y: 110 });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });

  it('composition 中の textarea 上スワイプは navigate しない (IME ガード)', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea);
    swipe(textarea, { x: 200, y: 100 }, { x: 100, y: 105 });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });

  it('縦方向のスクロール操作は誤判定されない (|dy| > |dx|)', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    await screen.findByLabelText('日記本文');
    const root = screen.getByTestId('editor-page');
    swipe(root, { x: 100, y: 50 }, { x: 70, y: 130 });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });

  it(`閾値 ${SWIPE_THRESHOLD_PX}px 未満では発火しない`, async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    await screen.findByLabelText('日記本文');
    const root = screen.getByTestId('editor-page');
    swipe(root, { x: 200, y: 100 }, { x: 170, y: 102 });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });
});

describe('EditorPage IME composition guard (M6-T2)', () => {
  it('composition 中の PageDown は遷移しない', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: 'PageDown' });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });
});

describe('EditorPage keyboard navigation (M5-T5)', () => {
  it('PageDown で次ページに遷移する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = await screen.findByLabelText('日記本文');
    fireEvent.keyDown(textarea, { key: 'PageDown' });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

  it('PageUp で前ページに遷移する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/3`, (p) => {
      pathname = p;
    });
    const textarea = await screen.findByLabelText('日記本文');
    fireEvent.keyDown(textarea, { key: 'PageUp' });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

  it('1 ページ目で PageUp は no-op（preventDefault のみ）', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = await screen.findByLabelText('日記本文');
    fireEvent.keyDown(textarea, { key: 'PageUp' });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });

  it('PageUp/PageDown はブラウザのデフォルトスクロール動作を抑止する (preventDefault)', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/2`);
    const textarea = await screen.findByLabelText('日記本文');
    // fireEvent.keyDown は preventDefault されていれば false を返す
    const down = fireEvent.keyDown(textarea, { key: 'PageDown' });
    expect(down).toBe(false);
    const up = fireEvent.keyDown(textarea, { key: 'PageUp' });
    expect(up).toBe(false);
  });

  it('PageUp/PageDown 以外のキーは preventDefault しない', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/2`);
    const textarea = await screen.findByLabelText('日記本文');
    const other = fireEvent.keyDown(textarea, { key: 'a' });
    expect(other).toBe(true);
  });
});

describe('EditorPage date insertion (M7-T4)', () => {
  /**
   * Date を決定論的にするためのスパイヘルパ。
   * vi.useFakeTimers は fake-indexeddb の microtask と干渉しハングするため
   * (AGENTS.md #27)、ここでは Date 自体を stub する軽量実装を使う。
   */
  function withFixedDate<T>(iso: string, fn: () => T): T {
    const RealDate = globalThis.Date;
    const fixed = new RealDate(iso);
    class StubDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixed.getTime());
          return;
        }
        // @ts-expect-error: passthrough to RealDate constructor signatures
        super(...args);
      }
      static now(): number {
        return fixed.getTime();
      }
    }
    // @ts-expect-error: temporary override
    globalThis.Date = StubDate;
    try {
      return fn();
    } finally {
      globalThis.Date = RealDate;
    }
  }

  it('ヘッダー右の「今日の日付を挿入」ボタンで本文にスタンプが挿入される', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'before-' } });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    const btn = screen.getByRole('button', { name: '今日の日付を挿入' });
    withFixedDate('2026-04-14T09:00:00', () => fireEvent.click(btn));
    expect(textarea.value).toBe('before-2026年4月14日(火)\n');
  });

  it('挿入後にカーソルがスタンプ末尾に移動する', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    const btn = screen.getByRole('button', { name: '今日の日付を挿入' });
    withFixedDate('2026-04-14T09:00:00', () => fireEvent.click(btn));
    // rAF で setSelectionRange が反映されるのを待つ
    await waitFor(() =>
      expect(textarea.selectionStart).toBe('2026年4月14日(火)\n'.length)
    );
  });

  it('ヘッダー日付ボタンは styles.headerDateButton で 44x44 を確保する', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    await screen.findByLabelText('日記本文');
    const btn = screen.getByRole('button', { name: '今日の日付を挿入' });
    // CSS Module 由来のクラスで styles.headerDateButton が適用されていること
    expect(btn.className).toMatch(/headerDateButton/);
  });

  it('日付挿入後、surface の scrollTop が保持される', async () => {
    // 本番環境では textarea.focus() / setSelectionRange() が .surface の
    // scrollTop をリセットする副作用を持つ（ブラウザ仕様）。jsdom ではこの
    // 副作用が再現されないため、focus() をスパイして scrollTop=0 に戻す
    // 副作用を注入し、本実装の「保存→復元」ロジックが確かに動いているか検証する。
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'あ'.repeat(200) } });
    });
    const surface = document.querySelector('[data-testid="editor-surface"]') as HTMLElement;
    surface.scrollTop = 200;
    textarea.setSelectionRange(10, 10);

    // focus() をスパイして、ブラウザの副作用（スクロールコンテナの scrollTop リセット）を模擬
    const originalFocus = HTMLTextAreaElement.prototype.focus;
    const focusSpy = vi
      .spyOn(HTMLTextAreaElement.prototype, 'focus')
      .mockImplementation(function (this: HTMLTextAreaElement) {
        surface.scrollTop = 0; // ブラウザの副作用を模擬
        return originalFocus.call(this);
      });

    try {
      const btn = screen.getByRole('button', { name: '今日の日付を挿入' });
      await act(async () => {
        fireEvent.click(btn);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      });
      expect(surface.scrollTop).toBe(200);
    } finally {
      focusSpy.mockRestore();
    }
  });

});

describe('EditorPage: no progress bar', () => {
  it('page-progress 要素は DOM に存在しない', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    await screen.findByLabelText('日記本文');
    expect(screen.queryByTestId('page-progress')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('EditorPage: no auto-navigation nor final-page lock (char-limit-removal)', () => {
  it('1201 字入力しても遷移せず、text はそのまま保持される', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(1201) } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
    expect(textarea.value.length).toBe(1201);
  });

  it('5000 字を一気に入力しても遷移しない', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(5000) } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
    expect(textarea.value.length).toBe(5000);
  });

  it('最終ページで長文を入力しても preventDefault されない', async () => {
    const v = await ensureActiveVolume();
    const fullPage = 'あ'.repeat(1200);
    await savePage(v.id, PAGES_PER_VOLUME, fullPage);
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(fullPage));
    fireEvent.change(textarea, { target: { value: fullPage + 'x' } });
    expect(textarea.value).toBe(fullPage + 'x');
  });

  it('日付挿入で長文になっても現ページに留まる', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(1200) } });
    textarea.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole('button', { name: '今日の日付を挿入' }));
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
    expect(textarea.value.length).toBeGreaterThan(1200);
  });
});

describe('formatToday (day rollover)', () => {
  // 2026-04-16 (Thu) を基準日として使う
  it('カットオフ時刻（4 時）以降は当日日付を返す', () => {
    const now = new Date(2026, 3, 16, 4, 0, 0); // 04:00 ちょうど
    expect(formatToday(4, now)).toBe('2026年4月16日(木)\n');
  });

  it('カットオフ時刻（4 時）未満は前日日付を返す', () => {
    const now = new Date(2026, 3, 16, 3, 59, 59); // 03:59:59
    expect(formatToday(4, now)).toBe('2026年4月15日(水)\n');
  });

  it('カットオフ 0 時なら前日に送られない', () => {
    const now = new Date(2026, 3, 16, 0, 0, 0); // 00:00 ちょうど、rollover=0
    expect(formatToday(0, now)).toBe('2026年4月16日(木)\n');
  });

  it('月初 (4/1) の深夜は前月末日付になる', () => {
    const now = new Date(2026, 3, 1, 2, 0, 0); // 4/1 02:00、rollover=4
    expect(formatToday(4, now)).toBe('2026年3月31日(火)\n');
  });

  it('年初 (1/1) の深夜は前年末日付になる', () => {
    const now = new Date(2026, 0, 1, 2, 0, 0); // 2026/1/1 02:00
    expect(formatToday(4, now)).toBe('2025年12月31日(水)\n');
  });

  it('デフォルト引数なしで呼べる', () => {
    const s = formatToday();
    expect(s).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日\([日月火水木金土]\)\n$/);
  });
});
