import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { useSwipeNavigation } from './useSwipeNavigation';

/**
 * MemoEditorPage.test.tsx の fireTouch 作法（touches/changedTouches を
 * 手で組む）を renderHook 用に応用。フックは React.TouchEvent を受け取る
 * ので、必要最小限の touches/changedTouches を持つ合成オブジェクトを渡す。
 */
function touchEvent(clientX: number, clientY: number): ReactTouchEvent {
  const point = { clientX, clientY };
  const list = [point];
  return {
    touches: list,
    changedTouches: list,
  } as unknown as ReactTouchEvent;
}

function swipe(
  handlers: ReturnType<typeof useSwipeNavigation>,
  from: [number, number],
  to: [number, number]
) {
  handlers.onTouchStart(touchEvent(from[0], from[1]));
  handlers.onTouchEnd(touchEvent(to[0], to[1]));
}

describe('useSwipeNavigation (M4-T1)', () => {
  it('左スワイプ（dx=-80, dy=0）→ onSwipeLeft のみ呼ばれる', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeNavigation({ onSwipeLeft, onSwipeRight })
    );
    swipe(result.current, [100, 100], [20, 100]);
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('右スワイプ（dx=+80, dy=0）→ onSwipeRight のみ呼ばれる', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeNavigation({ onSwipeLeft, onSwipeRight })
    );
    swipe(result.current, [20, 100], [100, 100]);
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('閾値未満（dx=-30）→ どちらも呼ばれない', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeNavigation({ onSwipeLeft, onSwipeRight })
    );
    swipe(result.current, [100, 100], [70, 100]);
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('縦優位（dx=-80, dy=-200）→ 呼ばれない', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeNavigation({ onSwipeLeft, onSwipeRight })
    );
    swipe(result.current, [100, 300], [20, 100]);
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('disabled=true → 呼ばれない', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeNavigation({ onSwipeLeft, onSwipeRight, disabled: true })
    );
    swipe(result.current, [100, 100], [20, 100]);
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
