import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

  it('マウント時 textarea が document.activeElement でない（自動フォーカスなし）', async () => {
    renderAt('/log/new');
    const ta = await screen.findByRole('textbox');
    expect(document.activeElement).not.toBe(ta);
  });

  it('編集時はヘッダーに createdAt 控えめ表示・新規未保存時はなし', async () => {
    const m = await addMemo('時刻あり');
    const { unmount } = renderAt(`/log/${m.id}`);
    await screen.findByRole('textbox');
    expect(screen.getByTestId('memo-created-at')).toBeTruthy();
    unmount();
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
