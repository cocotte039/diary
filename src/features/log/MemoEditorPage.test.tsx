import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  createEvent,
  act,
} from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import {
  _resetDBForTests,
  addMemo,
  getAllMemos,
  getMemo,
} from '../../lib/db';
import { DB_NAME, AUTOSAVE_DEBOUNCE_MS } from '../../lib/constants';
import MemoEditorPage from './MemoEditorPage';

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

function LocationProbe({ onChange }: { onChange: (pathname: string) => void }) {
  const loc = useLocation();
  onChange(loc.pathname);
  return null;
}

function renderAt(path: string, onChange?: (p: string) => void) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {onChange && <LocationProbe onChange={onChange} />}
      <Routes>
        <Route path="/log/new" element={<MemoEditorPage />} />
        <Route path="/log/:memoId" element={<MemoEditorPage />} />
        <Route path="/log" element={<div data-testid="log-list" />} />
        <Route path="/" element={<div data-testid="bookshelf" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MemoEditorPage (M2-T3)', () => {
  it('/log/new で textarea 入力→debounce 後 addMemo 1件・URL が /log/:id に replace', async () => {
    let path = '';
    renderAt('/log/new', (p) => (path = p));
    const ta = await screen.findByRole('textbox');
    fireEvent.change(ta, { target: { value: 'はじめてのメモ' } });
    await waitFor(
      async () => {
        const memos = await getAllMemos();
        expect(memos).toHaveLength(1);
      },
      { timeout: AUTOSAVE_DEBOUNCE_MS + 3000 }
    );
    const memos = await getAllMemos();
    expect(memos[0].content).toBe('はじめてのメモ');
    await waitFor(() => expect(path).toBe(`/log/${memos[0].id}`));
  });

  it('/log/new で未入力のまま戻る→ getAllMemos 0件（U3 空メモ不生成）', async () => {
    let path = '';
    renderAt('/log/new', (p) => (path = p));
    await screen.findByRole('textbox');
    const back = screen.getByRole('link', { name: /戻る|本棚/ });
    fireEvent.click(back);
    await waitFor(() => expect(path).toBe('/'));
    expect(await getAllMemos()).toHaveLength(0);
  });

  it('/log/:memoId（既存）で content ロード表示、編集→ updateMemo・updatedAt 更新', async () => {
    const m = await addMemo('元の本文');
    renderAt(`/log/${m.id}`);
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toBe('元の本文'));
    fireEvent.change(ta, { target: { value: '編集後の本文' } });
    await waitFor(
      async () => {
        const updated = await getMemo(m.id);
        expect(updated?.content).toBe('編集後の本文');
      },
      { timeout: AUTOSAVE_DEBOUNCE_MS + 3000 }
    );
    const updated = await getMemo(m.id);
    expect(updated?.updatedAt).not.toBe(m.updatedAt);
    expect(await getAllMemos()).toHaveLength(1);
  });

  it('/log/不正id → /log に replace 遷移', async () => {
    let path = '';
    renderAt('/log/nonexistent-id', (p) => (path = p));
    await waitFor(() => expect(path).toBe('/log'));
  });

  it('戻るリンクで flush 後に遷移（直近入力が保存される）', async () => {
    renderAt('/log/new');
    const ta = await screen.findByRole('textbox');
    fireEvent.change(ta, { target: { value: '保存して戻る' } });
    const back = screen.getByRole('link', { name: /戻る|本棚/ });
    await act(async () => {
      fireEvent.click(back);
    });
    await waitFor(async () => {
      const memos = await getAllMemos();
      expect(memos).toHaveLength(1);
      expect(memos[0].content).toBe('保存して戻る');
    });
  });

  it('/log/new で ready 後 textarea が自動フォーカスされる', async () => {
    renderAt('/log/new');
    const ta = await screen.findByRole('textbox');
    await waitFor(() => expect(document.activeElement).toBe(ta));
  });

  it('/log/:id（既存）で ready 後 textarea がフォーカスされカーソルが content 末尾', async () => {
    const m = await addMemo('既存メモ本文');
    renderAt(`/log/${m.id}`);
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toBe('既存メモ本文'));
    await waitFor(() => expect(document.activeElement).toBe(ta));
    expect(ta.selectionStart).toBe(ta.value.length);
    expect(ta.selectionEnd).toBe(ta.value.length);
  });

  it('編集時はヘッダーに createdAt が控えめ表示される', async () => {
    const m = await addMemo('時刻あり');
    renderAt(`/log/${m.id}`);
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toBe('時刻あり'));
    expect(screen.getByTestId('memo-created-at')).toBeTruthy();
  });

  it('新規（未保存）時はヘッダーに createdAt を表示しない', async () => {
    renderAt('/log/new');
    await screen.findByRole('textbox');
    expect(screen.queryByTestId('memo-created-at')).toBeNull();
  });

  it('罫線 notebook クラスを textarea に付けない（メモは素の紙）', async () => {
    renderAt('/log/new');
    const ta = await screen.findByRole('textbox');
    expect(ta.className).not.toMatch(/notebook-textarea|notebook-surface/);
  });
});

/**
 * M1-T5 右エッジスワイプで戻る。
 * JSDOM の fireEvent.touchStart/End は touches/changedTouches を渡さないため
 * createEvent + defineProperty で強制してから dispatch する
 * （LogListPage.test の firePointer 作法を touch 用に応用）。
 */
describe('MemoEditorPage 右スワイプで戻る (M1-T5)', () => {
  function fireTouch(
    el: Element,
    kind: 'touchStart' | 'touchEnd',
    clientX: number,
    clientY: number
  ) {
    const ev = createEvent[kind](el);
    const point = { clientX, clientY } as Touch;
    const list = [point] as unknown as TouchList;
    Object.defineProperty(ev, 'touches', { get: () => list });
    Object.defineProperty(ev, 'changedTouches', { get: () => list });
    fireEvent(el, ev);
  }

  function swipe(
    el: Element,
    from: [number, number],
    to: [number, number]
  ) {
    fireTouch(el, 'touchStart', from[0], from[1]);
    fireTouch(el, 'touchEnd', to[0], to[1]);
  }

  it('右スワイプ（水平優位）で flush 後 backTo へ遷移し入力が保存される', async () => {
    let path = '';
    renderAt('/log/new', (p) => (path = p));
    const ta = await screen.findByRole('textbox');
    fireEvent.change(ta, { target: { value: 'スワイプ前の入力' } });
    const root = screen.getByTestId('memo-editor-page');
    await act(async () => {
      swipe(root, [10, 100], [120, 110]); // dx=110, dy=10 → 水平優位 2:1
    });
    await waitFor(() => expect(path).toBe('/'));
    await waitFor(async () => {
      const memos = await getAllMemos();
      expect(memos).toHaveLength(1);
      expect(memos[0].content).toBe('スワイプ前の入力');
    });
  });

  it('縦優位スワイプは無反応（遷移しない）', async () => {
    let path = '';
    renderAt('/log/new', (p) => (path = p));
    await screen.findByRole('textbox');
    const root = screen.getByTestId('memo-editor-page');
    swipe(root, [10, 10], [40, 120]); // dx=30, dy=110 → 縦優位
    await new Promise((r) => setTimeout(r, 100));
    expect(path).toBe('/log/new');
  });

  it('IME 変換中の右スワイプは無反応', async () => {
    let path = '';
    renderAt('/log/new', (p) => (path = p));
    const ta = await screen.findByRole('textbox');
    fireEvent.compositionStart(ta);
    const root = screen.getByTestId('memo-editor-page');
    swipe(root, [10, 100], [120, 110]); // 水平優位だが IME 中
    await new Promise((r) => setTimeout(r, 100));
    expect(path).toBe('/log/new');
  });

  it('戻るリンク click は従来通り flush→navigate（goBack 委譲・回帰維持）', async () => {
    let path = '';
    renderAt('/log/new', (p) => (path = p));
    const ta = await screen.findByRole('textbox');
    fireEvent.change(ta, { target: { value: 'リンクで戻る' } });
    fireEvent.click(screen.getByRole('link', { name: '戻る' }));
    await waitFor(() => expect(path).toBe('/'));
    await waitFor(async () => {
      const memos = await getAllMemos();
      expect(memos).toHaveLength(1);
      expect(memos[0].content).toBe('リンクで戻る');
    });
  });
});
