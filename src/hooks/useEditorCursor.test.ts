import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditorCursor } from './useEditorCursor';
import { CURSOR_SAVE_DEBOUNCE_MS, LS_CURSOR_KEY } from '../lib/constants';

/**
 * useEditorCursor (M5-T4) のテスト。
 *
 * - volumeId/pageNumber ごとに localStorage キーが独立すること
 * - restoreReady=true で textarea にカーソルが復元されること
 * - ページ切替時に再復元が走ること
 * - onSelectionChange が debounce で localStorage に書き込むこと
 */

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function createTextarea(value: string): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.value = value;
  document.body.appendChild(ta);
  return ta;
}

describe('useEditorCursor (M5-T4)', () => {
  it('onSelectionChange で volumeId:pageNumber スコープのキーに保存する', () => {
    const ta = createTextarea('hello world');
    const ref = { current: ta };
    const { result } = renderHook(() =>
      useEditorCursor(ref, 'hello world', true, 'v1', 3)
    );
    act(() => {
      result.current.onSelectionChange(5);
      vi.advanceTimersByTime(CURSOR_SAVE_DEBOUNCE_MS);
    });
    expect(localStorage.getItem(`${LS_CURSOR_KEY}:v1:3`)).toBe('5');
    expect(localStorage.getItem(LS_CURSOR_KEY)).toBeNull();
  });

  it('volumeId/pageNumber が異なれば独立したキーに保存する', () => {
    const ta = createTextarea('abc');
    const ref = { current: ta };
    // v1:1 に 1 を保存
    const hook1 = renderHook(({ page }: { page: number }) =>
      useEditorCursor(ref, 'abc', true, 'v1', page),
      { initialProps: { page: 1 } }
    );
    act(() => {
      hook1.result.current.onSelectionChange(1);
      vi.advanceTimersByTime(CURSOR_SAVE_DEBOUNCE_MS);
    });
    // 同じフックでページ 2 に切替 → v1:2 に 2 を保存
    hook1.rerender({ page: 2 });
    act(() => {
      hook1.result.current.onSelectionChange(2);
      vi.advanceTimersByTime(CURSOR_SAVE_DEBOUNCE_MS);
    });
    expect(localStorage.getItem(`${LS_CURSOR_KEY}:v1:1`)).toBe('1');
    expect(localStorage.getItem(`${LS_CURSOR_KEY}:v1:2`)).toBe('2');
  });

  it('異なる volumeId でも干渉しない', () => {
    const ta = createTextarea('abc');
    const ref = { current: ta };
    const h1 = renderHook(() => useEditorCursor(ref, 'abc', true, 'v1', 1));
    act(() => {
      h1.result.current.onSelectionChange(1);
      vi.advanceTimersByTime(CURSOR_SAVE_DEBOUNCE_MS);
    });
    const h2 = renderHook(() => useEditorCursor(ref, 'abc', true, 'v2', 1));
    act(() => {
      h2.result.current.onSelectionChange(3);
      vi.advanceTimersByTime(CURSOR_SAVE_DEBOUNCE_MS);
    });
    expect(localStorage.getItem(`${LS_CURSOR_KEY}:v1:1`)).toBe('1');
    expect(localStorage.getItem(`${LS_CURSOR_KEY}:v2:1`)).toBe('3');
  });

  it('restoreReady 時に保存済み位置へ復元される', () => {
    localStorage.setItem(`${LS_CURSOR_KEY}:v1:1`, '4');
    const ta = createTextarea('hello');
    const ref = { current: ta };
    renderHook(() => useEditorCursor(ref, 'hello', true, 'v1', 1));
    expect(ta.selectionStart).toBe(4);
    expect(ta.selectionEnd).toBe(4);
  });

  it('ページ切替時に再復元が走る（異なるページのキーを読み直す）', () => {
    localStorage.setItem(`${LS_CURSOR_KEY}:v1:1`, '1');
    localStorage.setItem(`${LS_CURSOR_KEY}:v1:2`, '3');
    const ta = createTextarea('hello');
    const ref = { current: ta };
    const h = renderHook(
      ({ page }: { page: number }) =>
        useEditorCursor(ref, 'hello', true, 'v1', page),
      { initialProps: { page: 1 } }
    );
    expect(ta.selectionStart).toBe(1);
    h.rerender({ page: 2 });
    expect(ta.selectionStart).toBe(3);
  });

  it('従来の単独キー LS_CURSOR_KEY が残っていても無視される', () => {
    // 旧形式キーに何か残っているが、scope キーは空
    localStorage.setItem(LS_CURSOR_KEY, '999');
    const ta = createTextarea('hello');
    const ref = { current: ta };
    renderHook(() => useEditorCursor(ref, 'hello', true, 'v1', 1));
    // v1:1 キーが無い → fallback='end'（デフォルト）で text.length (5) に置く
    expect(ta.selectionStart).toBe(5);
  });

  it('fallback="start" 指定時は scope キーが無ければ先頭に置かれる (M9-M4)', () => {
    const ta = createTextarea('hello');
    const ref = { current: ta };
    renderHook(() =>
      useEditorCursor(ref, 'hello', true, 'v1', 1, 'start')
    );
    expect(ta.selectionStart).toBe(0);
  });

  it('fallback="end" 指定時は scope キーが無ければ末尾に置かれる (M9-M4)', () => {
    const ta = createTextarea('hello');
    const ref = { current: ta };
    renderHook(() =>
      useEditorCursor(ref, 'hello', true, 'v1', 1, 'end')
    );
    expect(ta.selectionStart).toBe(5);
  });

  it('fallback="start" でも localStorage に値があれば優先される (M9-M4)', () => {
    localStorage.setItem(`${LS_CURSOR_KEY}:v1:1`, '3');
    const ta = createTextarea('hello');
    const ref = { current: ta };
    renderHook(() =>
      useEditorCursor(ref, 'hello', true, 'v1', 1, 'start')
    );
    expect(ta.selectionStart).toBe(3);
  });

  it('restoreReady=false の間は復元されない', () => {
    localStorage.setItem(`${LS_CURSOR_KEY}:v1:1`, '2');
    const ta = createTextarea('hello');
    ta.selectionStart = 0;
    ta.selectionEnd = 0;
    const ref = { current: ta };
    renderHook(() => useEditorCursor(ref, 'hello', false, 'v1', 1));
    expect(ta.selectionStart).toBe(0);
  });
});
