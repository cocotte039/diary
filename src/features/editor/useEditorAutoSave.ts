import { useCallback, useEffect, useRef } from 'react';
import { savePage } from '../../lib/db';
import { syncPendingPagesBackground } from '../../lib/github';
import { AUTOSAVE_DEBOUNCE_MS } from '../../lib/constants';

/**
 * EditorPage 用の autosave フック。
 *
 * - text が変化してから AUTOSAVE_DEBOUNCE_MS (2 秒) 静止後に savePage を呼ぶ。
 * - lastSavedRef と比較して同値なら no-op（冪等）。
 * - flush() を await すると debounce を待たず即時保存する。
 *   T5.1 のページ遷移ボタン・T6.3 の自動次ページ遷移から呼ばれる。
 * - 保存成功後は syncPendingPagesBackground を fire-and-forget。
 *
 * pendingRef はペイロード一式（volumeId/pageNumber/text）を覆い、
 * flush が呼ばれた時点の値で save する。debounce 中タイマーは flush 時に cancel する。
 */
export function useEditorAutoSave(
  volumeId: string | null,
  pageNumber: number,
  text: string
): { flush: () => Promise<void> } {
  const lastSavedRef = useRef<{
    volumeId: string | null;
    pageNumber: number;
    text: string;
  }>({ volumeId: null, pageNumber: 0, text: '' });
  const pendingRef = useRef<{
    volumeId: string | null;
    pageNumber: number;
    text: string;
  }>({ volumeId: null, pageNumber: 0, text: '' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async (): Promise<void> => {
    const p = pendingRef.current;
    if (!p.volumeId) return;
    // 同じ値の重複保存は no-op
    if (
      lastSavedRef.current.volumeId === p.volumeId &&
      lastSavedRef.current.pageNumber === p.pageNumber &&
      lastSavedRef.current.text === p.text
    ) {
      return;
    }
    await savePage(p.volumeId, p.pageNumber, p.text);
    lastSavedRef.current = { ...p };
    // fire-and-forget
    void syncPendingPagesBackground();
  }, []);

  // text / volumeId / pageNumber の変化で pending を更新し、debounce タイマーを張り直す
  useEffect(() => {
    pendingRef.current = { volumeId, pageNumber, text };
    if (!volumeId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void doSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [volumeId, pageNumber, text, doSave]);

  // unmount でタイマー解除（pending は破棄; flush はユーザー側で呼ぶ設計）
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }, [doSave]);

  return { flush };
}
