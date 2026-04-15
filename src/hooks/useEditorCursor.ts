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
  pageNumber: number,
  /**
   * localStorage に位置が保存されていないときのフォールバック位置 (M9-M4-T4.1)。
   * - 'end': 末尾（書きかけの冊の続きを書く想定）
   * - 'start': 先頭（完了済みの冊を読み返す想定）
   * デフォルトは 'end'（既存挙動と同じ）。
   */
  fallback: 'end' | 'start' = 'end',
  /**
   * M3: スクロールコンテナ (`.surface`) への参照。
   * カーソル復元時に scrollTop を書く宛先。textarea が内部スクロールを
   * 持たなくなったため、外側スクロールコンテナ側でカーソル行を可視範囲に
   * 入れる必要がある。未指定時は scrollTop を書かない（safety）。
   */
  surfaceRef?: React.RefObject<HTMLElement | null>
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
    const fallbackPos = fallback === 'end' ? text.length : 0;
    const parsed = raw == null ? null : Number(raw);
    const pos =
      parsed != null && Number.isFinite(parsed) && parsed >= 0 && parsed <= text.length
        ? parsed
        : fallbackPos;

    el.focus();
    el.setSelectionRange(pos, pos);
    // M3: scrollTop 宛先は textarea ではなく .surface（外側スクロールコンテナ）。
    // surfaceRef 未指定時は NOP（呼び出し側の意思で scroll 制御を省略可能）。
    const surface = surfaceRef?.current ?? null;
    if (surface) {
      surface.scrollTop = getScrollTopForCursor(text, pos);
    }
    restoredRef.current = true;
  }, [restoreReady, text, textareaRef, storageKey, fallback, surfaceRef]);

  // 保存トリガ（呼び出し元が selection 変更時に呼ぶ）
  const onSelectionChange = (pos: number) => save(pos);

  return { onSelectionChange };
}
