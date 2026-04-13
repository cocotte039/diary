/**
 * navigator.storage.persist() を呼び、IndexedDB/LocalStorage が
 * ブラウザの自動削除（Eviction）対象にならないよう要請する。
 * 結果はコンソールにのみログを残し、UIには一切出さない（静けさ方針）。
 */
export async function initStoragePersistence(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return;
    }
    const already = await navigator.storage.persisted?.();
    if (already) {
      return;
    }
    const granted = await navigator.storage.persist();
    // eslint-disable-next-line no-console
    console.info(`[storage] persist(): granted=${granted}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[storage] persist() failed', err);
  }
}
