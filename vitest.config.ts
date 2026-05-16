import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // fake-indexeddb はプロセス共有のグローバル in-memory ストア。
      // 複数テストファイルを並列実行すると各ファイルの wipeDB()
      // (indexedDB.deleteDatabase) が互いの DB を巻き込んで削除し、稀に
      // 1〜2 件が落ちる cross-file 競合が発生する（AGENTS.md 既知知見）。
      // ファイル単位の並列を無効化して DB 競合を根絶する（テスト内容は不変・
      // 直列実行では従来から 178/178 安定を確認済み）。
      fileParallelism: false,
    },
  }),
);
