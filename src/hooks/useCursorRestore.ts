import { useEffect, useRef } from 'react';
import {
  CURSOR_SAVE_DEBOUNCE_MS,
  LS_CURSOR_KEY,
} from '../lib/constants';
import { getScrollTopForCursor } from '../lib/pagination';
import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * textarea のカーソル位置とスクロールを localStorage に保存・復元するフック。
 * beforeunload はモバイル Safari で不確実なので使わず、input イベントベース。
 */
export function useCursorRestore(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  text: string,
  restoreReady: boolean
) {
  const restoredRef = useRef(false);

  const save = useDebouncedCallback((pos: number) => {
    try {
      localStorage.setItem(LS_CURSOR_KEY, String(pos));
    } catch {
      /* private mode 等では無視 */
    }
  }, CURSOR_SAVE_DEBOUNCE_MS);

  // 復元
  useEffect(() => {
    if (restoredRef.current) return;
    if (!restoreReady) return;
    const el = textareaRef.current;
    if (!el) return;

    const raw = (() => {
      try {
        return localStorage.getItem(LS_CURSOR_KEY);
      } catch {
        return null;
      }
    })();
    const parsed = raw == null ? 0 : Number(raw);
    const pos =
      Number.isFinite(parsed) && parsed >= 0 && parsed <= text.length
        ? parsed
        : text.length;

    // フォーカス & 選択 & スクロール
    el.focus();
    el.setSelectionRange(pos, pos);
    el.scrollTop = getScrollTopForCursor(text, pos);
    restoredRef.current = true;
  }, [restoreReady, text, textareaRef]);

  // 保存トリガ（呼び出し元が selection 変更時に呼ぶ）
  const onSelectionChange = (pos: number) => save(pos);

  return { onSelectionChange };
}
