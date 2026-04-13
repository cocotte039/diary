import { useEffect, useRef } from 'react';
import { AUTOSAVE_DEBOUNCE_MS } from '../lib/constants';
import { saveVolumeText } from '../lib/db';
import { syncPendingPagesBackground } from '../lib/github';
import { useDebouncedCallback } from './useDebouncedCallback';

/**
 * textarea のテキストを IndexedDB に自動保存する。
 * - 2秒デバウンスで saveVolumeText() を呼ぶ
 * - 保存後に GitHub 同期をバックグラウンドキックする（設定が有ればの場合）
 * - UIには何も表示しない（静けさ）
 */
export function useAutoSave(volumeId: string | null, text: string) {
  const lastSavedRef = useRef<string | null>(null);

  const doSave = useDebouncedCallback(async (id: string, value: string) => {
    if (lastSavedRef.current === value) return;
    try {
      await saveVolumeText(id, value);
      lastSavedRef.current = value;
      // 同期は fire-and-forget（失敗しても UI に出さない）
      void syncPendingPagesBackground();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[autoSave] failed', err);
    }
  }, AUTOSAVE_DEBOUNCE_MS);

  useEffect(() => {
    if (!volumeId) return;
    doSave(volumeId, text);
  }, [volumeId, text, doSave]);
}
