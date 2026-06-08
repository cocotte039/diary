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
 *
 * データロス防止（backup 不具合修正）:
 * - ページ読込（volumeId/pageNumber 変化）時の text を「保存済みベースライン」として
 *   lastSavedRef に記録する。これにより読むだけで離脱した場合に無変更保存（＝
 *   GitHub への無駄コミット）が走らず、「静けさ」を保ちつつ flush を安全に多用できる。
 * - visibilitychange(hidden)/pagehide（アプリ背面化・画面ロック・タブ破棄）で doSave を
 *   発火し、debounce 未発火分の末尾入力をロストしない。doSave は volumeId/同値ガードで
 *   読込前・無変更時は no-op。
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
  // 現在ベースライン化済みのページキー（`${volumeId} ${pageNumber}`）。
  // これが変わった最初の effect 実行を「読込」とみなし、表示中 text を
  // lastSavedRef に焼き付ける（＝無変更扱い）。
  const baselineKeyRef = useRef<string | null>(null);

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
    const key = `${volumeId} ${pageNumber}`;
    if (baselineKeyRef.current !== key) {
      // ページ読込（初回）: 表示中の内容を「保存済み」とみなしベースライン化する。
      // これにより読むだけで離脱した場合に無変更保存（＝GitHub への無駄コミット）が
      // 走らない。タイマー自体は通常どおり張る（早期 return すると既存テストの
      // fake-timer/microtask 進行順序が変わり load 完了タイミングがズレるため）。
      // debounce が発火しても doSave は同値ガードで no-op になる。
      baselineKeyRef.current = key;
      lastSavedRef.current = { volumeId, pageNumber, text };
    }
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

  // アプリ背面化・画面ロック・タブ破棄時に未保存の末尾をロストしないよう保存する。
  // visibilitychange は hidden のときのみ、pagehide は常に doSave を発火。
  // doSave は volumeId 無し（読込前）・同値（無変更）を内部ガードで no-op 化するため
  // 読むだけの離脱では書き込まない。
  useEffect(() => {
    const onHide = () => {
      void doSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void doSave();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [doSave]);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }, [doSave]);

  return { flush };
}
