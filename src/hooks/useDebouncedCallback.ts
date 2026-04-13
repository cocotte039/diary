import { useCallback, useEffect, useRef } from 'react';

/**
 * debounce ユーティリティ fn を React フックでラップ。
 * 返り値の呼び出し関数を呼ぶたびにタイマーをリセットし、
 * 指定ミリ秒の静止後に fn を実行する。
 * unmount 時は pending を破棄する。
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number
): (...args: TArgs) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return useCallback(
    (...args: TArgs) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs]
  );
}
