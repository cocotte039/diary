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
