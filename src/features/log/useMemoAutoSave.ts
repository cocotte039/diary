import { useCallback, useEffect, useRef } from 'react';
import { addMemo, updateMemo } from '../../lib/db';
import { syncPendingMemosBackground } from '../../lib/github';
import { AUTOSAVE_DEBOUNCE_MS } from '../../lib/constants';

/**
 * MemoEditorPage 用の autosave フック。
 *
 * useEditorAutoSave の構造（pendingRef/lastSavedRef/timer/flush/unmount 解除/
 * 保存後 background sync fire-and-forget）を踏襲。savePage 密結合のため流用せず
 * memo 用に新規実装する。
 *
 * - content が変化してから AUTOSAVE_DEBOUNCE_MS (2 秒) 静止後に保存。
 * - memoId===null かつ content.trim()!=='' の初回保存: addMemo → onCreated(id)。
 *   呼び側（MemoEditorPage）が onCreated 内で navigate('/log/'+id,{replace:true})。
 *   作成後は createdIdRef 経由で以後の保存を updateMemo に切り替える
 *   （URL replace で memoId が反映されるまでの間も二重 addMemo しない）。
 * - memoId!==null: updateMemo(memoId, content)。
 * - content.trim()==='' かつ未作成: 保存しない（空メモ不生成, U3/E8）。
 * - lastSavedRef で同一内容の冗長保存を抑止（冪等）。
 * - flush() を await すると debounce を待たず即時保存する（戻る/popstate から）。
 * - unmount でタイマー解除（pending は破棄）。
 *
 * データロス防止（backup 不具合修正・日記と同型）:
 * - enabled=false（ロード前）は保存予約・ベースライン化・背面 flush を一切行わない
 *   （ロード中の空 content で既存メモを上書き＝ワイプしないため）。日記が volumeId の
 *   null ゲートで実現しているのと等価の制御を、メモは enabled 引数で行う。
 * - 既存メモ読込（enabled かつ memoId 変化）時の content を「保存済み」ベースラインとして
 *   lastSavedRef に焼き付け、読むだけ離脱で無変更 updateMemo（GitHub 無駄同期）を防ぐ。
 * - visibilitychange(hidden)/pagehide（背面化・ロック・タブ破棄）で doSave を発火し、
 *   debounce 未発火分の末尾入力をロストしない（enabled ガード付き）。
 */
export function useMemoAutoSave(
  memoId: string | null,
  content: string,
  onCreated: (id: string) => void,
  enabled: boolean = true
): { flush: () => Promise<void> } {
  const lastSavedRef = useRef<{ id: string | null; content: string }>({
    id: null,
    content: '',
  });
  const pendingRef = useRef<{ memoId: string | null; content: string }>({
    memoId: null,
    content: '',
  });
  // 初回 addMemo で得た id を保持。URL replace で memoId prop に反映されるまでの
  // 間に再保存が走っても updateMemo に切り替え、二重 addMemo を防ぐ。
  const createdIdRef = useRef<string | null>(null);
  // 初回 addMemo の in-flight Promise。連続 doSave が addMemo を await 完了前に
  // 重ねて呼ぶと二重作成になるため、進行中はそれを待ってから id を再評価する。
  const creatingRef = useRef<Promise<string> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  // 背面 flush から参照する最新 enabled。ロード前(false)の発火を弾く。
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // ベースライン化済みの memoId（sentinel=undefined で初回 effect を必ず通す）。
  const baselineKeyRef = useRef<string | null | undefined>(undefined);

  const doSave = useCallback(async (): Promise<void> => {
    // 初回 addMemo 進行中なら完了を待ち、id 確定後に updateMemo 経路へ。
    if (creatingRef.current) {
      await creatingRef.current;
    }
    const p = pendingRef.current;
    // 有効な保存先 id（prop の memoId か、初回作成済み id）
    const effectiveId = p.memoId ?? createdIdRef.current;

    if (effectiveId === null) {
      // 未作成: 空/空白のみは保存しない（空メモ不生成 U3）
      if (p.content.trim() === '') return;
      // 同一内容の冗長 addMemo 抑止（冪等）
      if (
        lastSavedRef.current.id === null &&
        lastSavedRef.current.content === p.content
      ) {
        return;
      }
      const createPromise = addMemo(p.content).then((m) => m.id);
      creatingRef.current = createPromise;
      let newId: string;
      try {
        newId = await createPromise;
      } finally {
        if (creatingRef.current === createPromise) creatingRef.current = null;
      }
      createdIdRef.current = newId;
      lastSavedRef.current = { id: newId, content: p.content };
      // 保存成功直後に fire-and-forget で GitHub バックアップ（静けさ厳守）
      syncPendingMemosBackground();
      onCreatedRef.current(newId);
      return;
    }

    // 既存メモ更新: 同一内容の冗長保存抑止（冪等）
    if (
      lastSavedRef.current.id === effectiveId &&
      lastSavedRef.current.content === p.content
    ) {
      return;
    }
    await updateMemo(effectiveId, p.content);
    lastSavedRef.current = { id: effectiveId, content: p.content };
    // 保存成功直後に fire-and-forget で GitHub バックアップ（静けさ厳守）
    syncPendingMemosBackground();
  }, []);

  // content / memoId の変化で pending を更新し debounce タイマーを張り直す
  useEffect(() => {
    pendingRef.current = { memoId, content };
    // ロード前(enabled=false)は何もしない（空 content で既存メモを上書きしない）。
    if (!enabled) return;
    const key = memoId; // null=新規
    if (baselineKeyRef.current !== key) {
      baselineKeyRef.current = key;
      if (memoId !== null) {
        // 既存メモ読込: 表示中内容を保存済みベースライン化（読むだけ離脱で
        // 無変更 updateMemo＝GitHub 無駄同期を防ぐ）。タイマーは下で通常どおり
        // 張るが、debounce 発火時 doSave は同値ガードで no-op になる
        // （日記 useEditorAutoSave と同型のタイミング中立化）。
        lastSavedRef.current = { id: memoId, content };
      }
      // 新規(memoId=null): 初期ベースライン {id:null,content:''} を維持。
    }
    // 未作成かつ空入力はタイマーすら張らない（静止）
    if ((memoId ?? createdIdRef.current) === null && content.trim() === '') {
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void doSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [memoId, content, enabled, doSave]);

  // unmount でタイマー解除（pending は破棄; flush はユーザー側で呼ぶ設計）
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 背面化・画面ロック・タブ破棄で未保存末尾をロストしないよう保存する（日記と同型）。
  // enabled=false（ロード前）は発火しない＝ワイプ防止。doSave は同値ガードで無変更 no-op。
  useEffect(() => {
    const run = () => {
      if (!enabledRef.current) return;
      void doSave();
    };
    const onHide = () => run();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') run();
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
