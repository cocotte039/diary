import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { _resetDBForTests, getAllMemos, addMemo, getMemo } from '../../lib/db';
import { DB_NAME, AUTOSAVE_DEBOUNCE_MS } from '../../lib/constants';
import { useMemoAutoSave } from './useMemoAutoSave';

// GitHub バックグラウンド同期は副作用なのでモック（呼出のみ検証）
vi.mock('../../lib/github', () => ({
  syncPendingMemosBackground: vi.fn(),
}));
import { syncPendingMemosBackground } from '../../lib/github';

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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(async () => {
  vi.useRealTimers();
  await wipeDB();
});

describe('useMemoAutoSave (M2-T2)', () => {
  it('memoId=null + 非空入力 → debounce 後 addMemo 1件 + onCreated(id)', async () => {
    const onCreated = vi.fn();
    const { rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(null, content, onCreated),
      { initialProps: { content: '' } }
    );
    rerender({ content: 'hello memo' });

    // debounce 経過前は保存されない
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 100);
    });
    expect(await getAllMemos()).toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();

    // debounce 経過で addMemo + onCreated
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    const memos = await getAllMemos();
    expect(memos).toHaveLength(1);
    expect(memos[0].content).toBe('hello memo');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(memos[0].id);
  });

  it('memoId=null + 空/空白のみ → 保存されない（空メモ不生成 U3）', async () => {
    const onCreated = vi.fn();
    const { rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(null, content, onCreated),
      { initialProps: { content: '' } }
    );
    rerender({ content: '   \n  ' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 200);
    });
    expect(await getAllMemos()).toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('memoId 指定 + 編集 → debounce 後 updateMemo、updatedAt 更新', async () => {
    const m = await addMemo('original');
    const onCreated = vi.fn();
    const { rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(m.id, content, onCreated),
      { initialProps: { content: 'original' } }
    );
    rerender({ content: 'edited body' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 200);
    });
    const updated = await getMemo(m.id);
    expect(updated?.content).toBe('edited body');
    expect(updated?.updatedAt).not.toBe(m.updatedAt);
    expect(onCreated).not.toHaveBeenCalled();
    expect(await getAllMemos()).toHaveLength(1);
  });

  it('初回作成後は addMemo を再呼出せず onCreated 1回（連続入力 flush）', async () => {
    // fake timers と fake-indexeddb の干渉回避のため flush() で決定的に検証
    // （AGENTS.md 既存知見: idb の async は setTimeout fake では完全に進まない）。
    const onCreated = vi.fn();
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(null, content, onCreated),
      { initialProps: { content: '' } }
    );
    rerender({ content: 'first' });
    await act(async () => {
      await result.current.flush();
    });
    rerender({ content: 'first second' });
    await act(async () => {
      await result.current.flush();
    });
    const memos = await getAllMemos();
    expect(memos).toHaveLength(1);
    expect(memos[0].content).toBe('first second');
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('同一内容連続 → 二重保存しない（lastSavedRef 冪等）', async () => {
    const m = await addMemo('seed');
    const onCreated = vi.fn();
    const { rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(m.id, content, onCreated),
      { initialProps: { content: 'seed' } }
    );
    // 1 回目の編集 → 保存（フック経由で lastSavedRef に記録される）
    rerender({ content: 'edited once' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 100);
    });
    const firstUpdatedAt = (await getMemo(m.id))?.updatedAt;
    // 同一内容を再投入 → debounce 後の保存は no-op（updatedAt 不変）
    rerender({ content: 'edited once' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 100);
    });
    const secondUpdatedAt = (await getMemo(m.id))?.updatedAt;
    expect(secondUpdatedAt).toBe(firstUpdatedAt);
  });

  it('flush() で即保存（debounce 待たず）', async () => {
    const onCreated = vi.fn();
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(null, content, onCreated),
      { initialProps: { content: '' } }
    );
    rerender({ content: 'flushed memo' });
    await act(async () => {
      await result.current.flush();
    });
    const memos = await getAllMemos();
    expect(memos).toHaveLength(1);
    expect(memos[0].content).toBe('flushed memo');
    expect(onCreated).toHaveBeenCalledWith(memos[0].id);
  });

  it('保存成功後に syncPendingMemosBackground が呼ばれる（新規作成・M4-T3）', async () => {
    const onCreated = vi.fn();
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(null, content, onCreated),
      { initialProps: { content: '' } }
    );
    rerender({ content: 'sync me' });
    await act(async () => {
      await result.current.flush();
    });
    expect(syncPendingMemosBackground).toHaveBeenCalled();
  });

  it('保存成功後に syncPendingMemosBackground が呼ばれる（更新・M4-T3）', async () => {
    const m = await addMemo('seed');
    vi.mocked(syncPendingMemosBackground).mockClear();
    const onCreated = vi.fn();
    const { result, rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(m.id, content, onCreated),
      { initialProps: { content: 'seed' } }
    );
    rerender({ content: 'seed updated' });
    await act(async () => {
      await result.current.flush();
    });
    expect(syncPendingMemosBackground).toHaveBeenCalled();
  });

  it('既存メモ読込はベースライン化し、無変更 flush で updateMemo しない（updatedAt 不変）', async () => {
    const m = await addMemo('seed');
    const onCreated = vi.fn();
    const { result } = renderHook(() =>
      useMemoAutoSave(m.id, 'seed', onCreated)
    );
    await act(async () => {
      await result.current.flush();
    });
    const after = await getMemo(m.id);
    expect(after?.updatedAt).toBe(m.updatedAt);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('pagehide で pending の末尾入力を保存する（メモ更新・背面化データロス防止）', async () => {
    const m = await addMemo('seed');
    const onCreated = vi.fn();
    const { rerender } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(m.id, content, onCreated),
      { initialProps: { content: 'seed' } }
    );
    rerender({ content: 'seed + tail' });
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect((await getMemo(m.id))?.content).toBe('seed + tail');
  });

  it('enabled=false の間は背面化 flush で保存しない（ロード中ワイプ防止）', async () => {
    const m = await addMemo('seed');
    const onCreated = vi.fn();
    // ロード前を模擬: enabled=false, content='' で背面化
    renderHook(() => useMemoAutoSave(m.id, '', onCreated, false));
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect((await getMemo(m.id))?.content).toBe('seed');
  });

  it('unmount で timer 解除（保存予約が発火しない）', async () => {
    const onCreated = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ content }: { content: string }) =>
        useMemoAutoSave(null, content, onCreated),
      { initialProps: { content: '' } }
    );
    rerender({ content: 'never saved' });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 500);
    });
    expect(await getAllMemos()).toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();
  });
});
