import { useEffect, useRef } from 'react';
import {
  CURSOR_SAVE_DEBOUNCE_MS,
  LS_CURSOR_KEY,
} from '../lib/constants';
import { getScrollTopForCursor } from '../lib/pagination';
import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * EditorPage 用のカーソル復元フック (M5-T4)。
 *
 * localStorage キーを `${LS_CURSOR_KEY}:${volumeId}:${pageNumber}` にスコープし、
 * 冊/ページごとに独立したカーソル位置を保存・復元する。
 *
 * 仕様:
 * - `restoreReady === true` かつ textarea が DOM に乗ったタイミングで 1 回だけ復元する。
 * - volumeId / pageNumber が変わるたびに復元状態をリセットし、再度復元を試みる。
 * - onSelectionChange(pos) は呼び出し元（textarea の onSelect/onChange）から
 *   呼ばれ、CURSOR_SAVE_DEBOUNCE_MS (1秒) 待機後に localStorage へ書き込む。
 *
 * 既存の `useCursorRestore` は WritePage 専用で残す（M7 で WritePage 削除時に同時除去）。
 * 従来の単独キー (`LS_CURSOR_KEY`) が残っていても、本フックはそれを読まない。
 */
export function useEditorCursor(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  text: string,
  restoreReady: boolean,
  volumeId: string | null,
  pageNumber: number
) {
  const restoredRef = useRef(false);

  const storageKey =
    volumeId != null
      ? `${LS_CURSOR_KEY}:${volumeId}:${pageNumber}`
      : null;

  const save = useDebouncedCallback((pos: number) => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, String(pos));
    } catch {
      /* private mode 等では無視 */
    }
  }, CURSOR_SAVE_DEBOUNCE_MS);

  // volumeId / pageNumber 変化で再復元するためのリセット
  useEffect(() => {
    restoredRef.current = false;
  }, [volumeId, pageNumber]);

  // 復元
  useEffect(() => {
    if (restoredRef.current) return;
    if (!restoreReady) return;
    if (!storageKey) return;
    const el = textareaRef.current;
    if (!el) return;

    const raw = (() => {
      try {
        return localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    })();
    const parsed = raw == null ? 0 : Number(raw);
    const pos =
      Number.isFinite(parsed) && parsed >= 0 && parsed <= text.length
        ? parsed
        : text.length;

    el.focus();
    el.setSelectionRange(pos, pos);
    el.scrollTop = getScrollTopForCursor(text, pos);
    restoredRef.current = true;
  }, [restoreReady, text, textareaRef, storageKey]);

  // 保存トリガ（呼び出し元が selection 変更時に呼ぶ）
  const onSelectionChange = (pos: number) => save(pos);

  return { onSelectionChange };
}
