import { useCallback, useEffect, useRef } from 'react';
import { addMemo, updateMemo } from '../../lib/db';
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
 */
export function useMemoAutoSave(
  memoId: string | null,
  content: string,
  onCreated: (id: string) => void
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
      // M4-T3: syncPendingMemosBackground() をここで呼ぶ
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
    // M4-T3: syncPendingMemosBackground() をここで呼ぶ
  }, []);

  // content / memoId の変化で pending を更新し debounce タイマーを張り直す
  useEffect(() => {
    pendingRef.current = { memoId, content };
    // 未作成かつ空入力はタイマーすら張らない（静止）
    if ((memoId ?? createdIdRef.current) === null && content.trim() === '') {
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void doSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [memoId, content, doSave]);

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
