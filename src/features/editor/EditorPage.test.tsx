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
import { DB_NAME, PAGES_PER_VOLUME, SWIPE_THRESHOLD_PX } from '../../lib/constants';
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

  it('textarea 上のスワイプは navigate しない（編集操作を妨げない）', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = await screen.findByLabelText('日記本文');
    swipe(textarea, { x: 200, y: 100 }, { x: 100, y: 105 });
    // 十分待っても遷移しないこと
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
  it('composition 中は 30 行超の入力で navigate しない', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea);
    const overflowText =
      Array.from({ length: 31 }, (_, i) => `l${i}`).join('\n');
    fireEvent.change(textarea, { target: { value: overflowText } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
  });

  it('compositionEnd で最新値が 30 行超なら遷移する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea);
    const overflowText =
      Array.from({ length: 31 }, (_, i) => `l${i}`).join('\n');
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

  it('composition 無しで 30 行超の change は即 navigate する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText =
      Array.from({ length: 31 }, (_, i) => `l${i}`).join('\n');
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });
});

describe('EditorPage auto next-page on overflow (M6-T3)', () => {
  it('30 行を越えると次ページへ遷移する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText =
      Array.from({ length: 31 }, (_, i) => `line-${i}`).join('\n');
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
  });

  it('遷移前のページは keep (30 行) で保存される', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText =
      Array.from({ length: 31 }, (_, i) => `l${i}`).join('\n');
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    const page1 = await getPage(v.id, 1);
    expect(page1?.content.split('\n').length).toBe(30);
  });

  it('overflow 分が次ページ先頭に書き込まれる', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText =
      Array.from({ length: 31 }, (_, i) => `l${i}`).join('\n');
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    const page2 = await getPage(v.id, 2);
    expect(page2?.content).toBe('l30');
  });

  it('次ページに既存 content があれば overflow は先頭に prepend される', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, 2, 'existing');
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    const overflowText =
      Array.from({ length: 31 }, (_, i) => `l${i}`).join('\n');
    fireEvent.change(textarea, { target: { value: overflowText } });
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    const page2 = await getPage(v.id, 2);
    expect(page2?.content).toBe('l30\nexisting');
  });

  it('50 ページ目では自動遷移が発動しない', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, PAGES_PER_VOLUME, '');
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/${PAGES_PER_VOLUME}`, (p) => {
      pathname = p;
    });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    // NOTE: 50 ページ目は onBeforeInput でロックされる設計（T6.4）。
    // ここでは onChange 経路で overflow が発生しても navigate が起きないことだけ確認する。
    const overflowText =
      Array.from({ length: 31 }, (_, i) => `l${i}`).join('\n');
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

  it('50 ページ目 30 行末尾で改行を beforeInput すると preventDefault される', async () => {
    const v = await ensureActiveVolume();
    const thirtyLines = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n');
    await savePage(v.id, PAGES_PER_VOLUME, thirtyLines);
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(thirtyLines));
    textarea.setSelectionRange(thirtyLines.length, thirtyLines.length);
    const result = fireBeforeInput(textarea, '\n');
    expect(result.defaultPrevented).toBe(true);
  });

  it('49 ページ目では同じ beforeInput は preventDefault されない', async () => {
    const v = await ensureActiveVolume();
    const thirtyLines = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n');
    await savePage(v.id, 49, thirtyLines);
    renderAt(`/book/${v.id}/49`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(thirtyLines));
    textarea.setSelectionRange(thirtyLines.length, thirtyLines.length);
    const result = fireBeforeInput(textarea, '\n');
    expect(result.defaultPrevented).toBe(false);
  });

  it('50 ページ目でも 30 行以内の文字挿入は妨げられない', async () => {
    const v = await ensureActiveVolume();
    await savePage(v.id, PAGES_PER_VOLUME, 'hello');
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('hello'));
    textarea.setSelectionRange(5, 5);
    const result = fireBeforeInput(textarea, 'x');
    expect(result.defaultPrevented).toBe(false);
  });

  it('50 ページ目の削除操作 (data なし) は preventDefault されない', async () => {
    const v = await ensureActiveVolume();
    const thirtyLines = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n');
    await savePage(v.id, PAGES_PER_VOLUME, thirtyLines);
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(thirtyLines));
    textarea.setSelectionRange(thirtyLines.length, thirtyLines.length);
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
