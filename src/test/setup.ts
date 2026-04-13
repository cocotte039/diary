// Vitest セットアップ
// - jest-dom の matcher を追加
// - fake-indexeddb を jsdom 環境に注入
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// crypto.randomUUID のフォールバック（Node 18 未満の保険）
if (typeof crypto === 'undefined' || !('randomUUID' in crypto)) {
  (globalThis as unknown as { crypto: Crypto }).crypto = {
    ...(globalThis.crypto ?? ({} as Crypto)),
    randomUUID: () =>
      ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx' as string).replace(
        /[xy]/g,
        (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        }
      ) as `${string}-${string}-${string}-${string}-${string}`,
  } as Crypto;
}
