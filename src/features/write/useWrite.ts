import { useCallback, useEffect, useState } from 'react';
import {
  ensureActiveVolume,
  loadVolumeText,
  rotateVolume,
  saveVolumeText,
} from '../../lib/db';
import { countLogicalLines } from '../../lib/pagination';
import { LINES_PER_VOLUME } from '../../lib/constants';
import type { Volume } from '../../types';

/**
 * 書く画面のルート状態管理フック。
 * - 起動時にアクティブな Volume を ensure
 * - 既存テキストをロード
 * - 1500 行に達したら自動で新冊に切替（切替時は旧冊テキストは保持）
 * - 手動切替 API を提供
 */
export function useWrite() {
  const [volume, setVolume] = useState<Volume | null>(null);
  const [text, setText] = useState<string>('');
  const [ready, setReady] = useState(false);

  // 初期ロード
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await ensureActiveVolume();
      const t = await loadVolumeText(v.id);
      if (cancelled) return;
      setVolume(v);
      setText(t);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** テキスト更新 + 1500行到達で自動切替 */
  const updateText = useCallback(
    (next: string) => {
      setText(next);
      if (!volume) return;
      const lines = countLogicalLines(next);
      if (lines > LINES_PER_VOLUME) {
        // 超過分を新冊に持ち越す（丁寧なUXのため、切替時は空から再開する方針も検討できるが
        // ここでは超過分を新冊の1ページ目に移す）
        const linesArr = next.split('\n');
        const keep = linesArr.slice(0, LINES_PER_VOLUME).join('\n');
        const overflow = linesArr.slice(LINES_PER_VOLUME).join('\n');
        void (async () => {
          // 旧冊の内容を保存するのは呼び出し側 useAutoSave に任せる。
          // ここでは旧テキストを keep にしてから rotate する。
          setText(keep);
          const newVol = await rotateVolume(volume.id);
          setVolume(newVol);
          setText(overflow);
        })();
      }
    },
    [volume]
  );

  /** 手動切替: 現在のテキストを確実に保存してから新冊へ切り替える */
  const rotateNow = useCallback(async () => {
    if (!volume) return;
    // debounce を待たず即保存して安全に切替える
    await saveVolumeText(volume.id, text);
    const newVol = await rotateVolume(volume.id);
    setVolume(newVol);
    setText('');
  }, [volume, text]);

  /**
   * 現在のページ番号（カーソル位置から計算される）を親に取得させるためのヘルパ。
   * ここでは text と volume のみ返し、カーソル依存の計算はコンポーネント側で行う。
   */
  return {
    volume,
    text,
    setText: updateText,
    rotateNow,
    ready,
  };
}
