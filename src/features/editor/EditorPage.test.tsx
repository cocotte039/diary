import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import {
  _resetDBForTests,
  ensureActiveVolume,
  getPage,
  getVolume,
  savePage,
} from '../../lib/db';
import {
  CHARS_PER_PAGE,
  DB_NAME,
  PAGES_PER_VOLUME,
  SWIPE_THRESHOLD_PX,
} from '../../lib/constants';
import EditorPage from './EditorPage';

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

  it('header contains 本棚 link to /, current page number, and 設定 link', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/7`);
    expect(await screen.findByRole('link', { name: '本棚に戻る' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText(`7 / ${PAGES_PER_VOLUME}`)).toBeInTheDocument();
  });

  it('falls back to page 1 for out-of-range page numbers', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'first');
    renderAt(`/book/${v.id}/999`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('first'));
    expect(screen.getByText(`1 / ${PAGES_PER_VOLUME}`)).toBeInTheDocument();
  });

  it('falls back to page 1 for non-numeric page numbers', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 1, 'first');
    renderAt(`/book/${v.id}/abc`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('first'));
    expect(screen.getByText(`1 / ${PAGES_PER_VOLUME}`)).toBeInTheDocument();
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
  it('composition 中は 1201 字の入力で navigate しない', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea);
    const overflowText = 'あ'.repeat(CHARS_PER_PAGE + 1);
    fireEvent.change(textarea, { target: { value: overflowText } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });

  it('compositionEnd で最新値が 1201 字なら遷移する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea);
    const overflowText = 'あ'.repeat(CHARS_PER_PAGE + 1);
    fireEvent.change(textarea, { target: { value: overflowText } });
    fireEvent.compositionEnd(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

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

  it('composition 無しで 1201 字の change は即 navigate する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText = 'あ'.repeat(CHARS_PER_PAGE + 1);
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });
});

describe('EditorPage auto next-page on overflow (M6-T3)', () => {
  it('1201 字入力で次ページへ遷移する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText = 'あ'.repeat(CHARS_PER_PAGE + 1);
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

  it('1200 字ちょうどでは遷移しない', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const justText = 'あ'.repeat(CHARS_PER_PAGE);
    fireEvent.change(textarea, { target: { value: justText } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });

  it('遷移前のページは keep (先頭 1200 字) で保存される', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText = 'あ'.repeat(CHARS_PER_PAGE) + 'い';
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    const page1 = await getPage(v.id, 1);
    expect(page1?.content.length).toBe(CHARS_PER_PAGE);
    expect(page1?.content).toBe('あ'.repeat(CHARS_PER_PAGE));
  });

  it('overflow 分が次ページ先頭に書き込まれる', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText = 'あ'.repeat(CHARS_PER_PAGE) + 'い';
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    const page2 = await getPage(v.id, 2);
    expect(page2?.content).toBe('い');
  });

  it('次ページに既存 content があれば overflow は先頭に prepend される', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 2, 'existing');
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText = 'あ'.repeat(CHARS_PER_PAGE) + 'い';
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    const page2 = await getPage(v.id, 2);
    expect(page2?.content).toBe('い\nexisting');
  });

  it('最終ページでは自動遷移が発動しない', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, PAGES_PER_VOLUME, '');
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/${PAGES_PER_VOLUME}`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    // 最終ページは onBeforeInput でロックされる設計（T6.4）。
    // onChange 経路で overflow が発生しても navigate が起きないことだけ確認する。
    const overflowText = 'あ'.repeat(CHARS_PER_PAGE + 1);
    fireEvent.change(textarea, { target: { value: overflowText } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/${PAGES_PER_VOLUME}`);
  });
});

describe('EditorPage final page lock (M6-T4)', () => {
  /**
   * React の `onBeforeInput` は native `beforeinput` ではなく
   * `compositionend`/`keypress`/`textInput`/`paste` にマップされる（React 19 実装）。
   * テストでは `textInput` 相当を dispatch することで onBeforeInput を発火する。
   *
   * jsdom には TextEvent が無いため、`CustomEvent('textInput', { detail: data })` のように
   * 代替 event 送信しても React のハンドラは動かない（data 取得経路が異なる）。
   * そのため、ここでは `keypress` を使い、`key: 'Enter'` 等で data を模擬する。
   * React の getFallbackBeforeInputChars は keypress の charCode/which から data を抽出する。
   */
  function fireBeforeInput(
    el: HTMLElement,
    data: string | null
  ): { defaultPrevented: boolean } {
    if (data == null) {
      // 削除系を模擬: keydown Backspace で onBeforeInput は発火しない想定（React 仕様）。
      // ここではそもそも cancel 対象外なので、default は常に not prevented 扱い。
      const ev = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(ev);
      return { defaultPrevented: ev.defaultPrevented };
    }
    // 改行は key='Enter' + charCode=13 で keypress を出す。
    const charCode = data === '\n' ? 13 : data.charCodeAt(0);
    const ev = new KeyboardEvent('keypress', {
      key: data === '\n' ? 'Enter' : data,
      charCode,
      keyCode: charCode,
      which: charCode,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(ev);
    return { defaultPrevented: ev.defaultPrevented };
  }

  it('最終ページ 1200 字末尾で 1 文字を beforeInput すると preventDefault される', async () => {
    const v = await ensureActiveVolume();
    const fullPage = 'あ'.repeat(CHARS_PER_PAGE);
    await savePage(v.id, PAGES_PER_VOLUME, fullPage);
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(fullPage));
    textarea.setSelectionRange(fullPage.length, fullPage.length);
    const result = fireBeforeInput(textarea, 'x');
    expect(result.defaultPrevented).toBe(true);
  });

  it('最終ページ 1200 字末尾で改行 beforeInput も preventDefault される', async () => {
    const v = await ensureActiveVolume();
    const fullPage = 'あ'.repeat(CHARS_PER_PAGE);
    await savePage(v.id, PAGES_PER_VOLUME, fullPage);
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(fullPage));
    textarea.setSelectionRange(fullPage.length, fullPage.length);
    const result = fireBeforeInput(textarea, '\n');
    expect(result.defaultPrevented).toBe(true);
  });

  it('最終 1 つ前のページでは同じ beforeInput は preventDefault されない', async () => {
    const v = await ensureActiveVolume();
    const fullPage = 'あ'.repeat(CHARS_PER_PAGE);
    await savePage(v.id, PAGES_PER_VOLUME - 1, fullPage);
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME - 1}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(fullPage));
    textarea.setSelectionRange(fullPage.length, fullPage.length);
    const result = fireBeforeInput(textarea, 'x');
    expect(result.defaultPrevented).toBe(false);
  });

  it('最終ページでも 1200 字以内の文字挿入は妨げられない', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, PAGES_PER_VOLUME, 'hello');
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('hello'));
    textarea.setSelectionRange(5, 5);
    const result = fireBeforeInput(textarea, 'x');
    expect(result.defaultPrevented).toBe(false);
  });

  it('最終ページの削除操作 (data なし) は preventDefault されない', async () => {
    const v = await ensureActiveVolume();
    const fullPage = 'あ'.repeat(CHARS_PER_PAGE);
    await savePage(v.id, PAGES_PER_VOLUME, fullPage);
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(fullPage));
    textarea.setSelectionRange(fullPage.length, fullPage.length);
    const result = fireBeforeInput(textarea, null);
    expect(result.defaultPrevented).toBe(false);
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

  it('日付挿入で 1200 字を超える場合、次ページへ自動遷移する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    // 1200 字を埋めてからスタンプを先頭に挿入 → 末尾が overflow として押し出される
    const fullPage = 'あ'.repeat(CHARS_PER_PAGE);
    fireEvent.change(textarea, { target: { value: fullPage } });
    textarea.setSelectionRange(0, 0);
    withFixedDate('2026-04-14T09:00:00', () =>
      fireEvent.click(screen.getByRole('button', { name: '今日の日付を挿入' }))
    );
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });
});
