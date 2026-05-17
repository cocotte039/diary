import { useRef } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { SWIPE_THRESHOLD_PX } from '../lib/constants';

interface SwipeNavOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  disabled?: boolean;
}

interface SwipeHandlers {
  onTouchStart: (e: ReactTouchEvent) => void;
  onTouchEnd: (e: ReactTouchEvent) => void;
}

/**
 * 親指の水平スワイプで画面遷移するためのハンドラを返す純粋フック。
 *
 * 判定構造は EditorPage.tsx（日記 side）の onTouchStart/onTouchEnd を
 * コピー流用したもの。EditorPage を import せずコピーしている理由:
 * 日記 side は不変制約があり、そちらのスワイプ実装に手を入れたくないため
 * （共通化のための抽出リファクタは別マイルストーン判断）。
 *
 * IME composition は扱わない。EditorPage の textarea 固有事情であり、
 * 一覧（本棚/メモ一覧）には入力欄がないためフック責務外。流用は判定構造のみ。
 *
 * state を持たず ref のみ（再レンダを誘発しない）。preventDefault しない
 * （click/長押し/縦スクロール非干渉）。
 */
export function useSwipeNavigation(opts: SwipeNavOptions): SwipeHandlers {
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const onTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0];
    if (!t) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (startX == null || startY == null) return;
    if (opts.disabled) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) <= Math.abs(dy) * 2) return; // 水平優位 2:1
    if (dx < 0) opts.onSwipeLeft?.(); // 左スワイプ
    else opts.onSwipeRight?.(); // 右スワイプ
  };

  return { onTouchStart, onTouchEnd };
}
