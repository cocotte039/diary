# AGENTS.md — Build Agent 向けプロジェクト情報

## プロジェクト概要

- **名前**: diary（PWA日記アプリ「ノート」）
- **配置**: `C:\Users\kawaih\MyFolder\software\python\dev\diary\`
- **言語**: TypeScript
- **パッケージ管理**: npm
- **テスト**: Vitest（ユニットテスト）+ 実機目視確認（UI）

## 技術スタック

| 用途 | ツール |
|------|--------|
| フレームワーク | React 19 + Vite |
| 言語 | TypeScript |
| ルーティング | React Router (HashRouter) |
| CSS | CSS Modules |
| データ保存 | IndexedDB (idb) |
| フォント | Klee One (Google Fonts CDN) |
| PWA | vite-plugin-pwa (Workbox) |
| バックアップ | @octokit/rest (GitHub API) |
| デプロイ | GitHub Pages |

## デザイン原則: 静けさ

全ての機能・UIの判断基準: **「静けさを壊さないか？」**

- 通知・バッジ・ストリーク・華美なアニメーションは排除
- 保存は暗黙的に実行（インジケータなし）
- エラーは控えめなインライン表示（モーダルなし）
- トランジションは 200ms ease, opacity変化程度
- 色数は最小限（背景・テキスト・罫線・アクセント1色の計4色）

## プロジェクト構造

```
diary/
  src/
    components/           # 共通UIコンポーネント
    features/
      write/              # 書く画面
        WritePage.tsx
        WritePage.module.css
        useWrite.ts
      bookshelf/          # 本棚画面
        BookshelfPage.tsx
        BookshelfPage.module.css
        VolumeCard.tsx
        Calendar.tsx
        Calendar.module.css
      reader/             # 読み返し画面
        ReaderPage.tsx
        ReaderPage.module.css
      settings/           # 設定画面
        SettingsPage.tsx
    hooks/
      useAutoSave.ts
      useCursorRestore.ts
    lib/
      db.ts               # IndexedDB操作 (idb)
      github.ts           # GitHub API (@octokit/rest)
      constants.ts        # 定数
      export.ts           # 簡易エクスポート
    types/
      index.ts            # Volume, Page 型定義
    styles/
      global.css          # CSS変数（配色・フォント・行間）
      notebook.css        # ノート風共通スタイル（罫線・区切り線）
    App.tsx
    main.tsx
  public/
    manifest.json
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

## コーディング規約

- CSS変数でデザイントークンを一元管理（`src/styles/global.css`）
- 罫線の位置合わせは `line-height` と `background-size` の同期が必須
- データモデルの型は `src/types/index.ts` に集約
- IndexedDBの操作は `src/lib/db.ts` に集約
- 定数は `src/lib/constants.ts` に集約
- フォントサイズ 16px 固定（iOS ズーム防止）

## 実行方法

```bash
cd diary
npm install
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド
npm run preview      # ビルド結果のプレビュー
```

## 実装計画

`.claude/loop/IMPLEMENTATION_PLAN.md` を参照。
各タスクの詳細仕様は `.claude/loop/specs/` 内のファイルを参照。

## 重要な設計判断

1. **単一textarea方式**: 1冊 = 1つのtextarea。ページ区切りはCSS背景パターンで視覚的にのみ表現
2. **論理行ベースのページ管理**: `\n`区切りで30行=1ページ。表示上の折り返しはカウントしない
3. **データモデルの簡素化**: Volume の startDate/endDate は Page の createdAt から導出
4. **Google Fonts CDN + SW キャッシュ**: サブセット配信の恩恵 + オフライン対応

## 実装時に追加した判断（2026-04-13）

5. **Volume に `ordinal` を追加**: spec の型には無かったが、本棚で「第N冊」を表示するために必須。
   v1 スキーマに最初から含めるためマイグレーション不要。`ensureActiveVolume` 時に既存の最大値+1 を採番。
6. **🟡 iOS Safari の PWA 促しは UA 判定**: `/iPad|iPhone|iPod/` かつ `Safari/` を含み `CriOS|FxiOS|EdgiOS` を含まない。
   UA は将来変わる可能性があるが、現行 Safari でのみホーム画面追加が意味を持つため許容。
7. **🟡 冊終わりの余白縮小は v1 で見送り**: 区切り線の色味変化（page >= 46 で暖色）のみ実装。
   余白変更は background-size と line-height の同期を崩すリスクが高く、実機検証後に再検討。
8. **PWA `base` は `VITE_BASE_PATH` 環境変数で切替**: デフォルト `/`、GitHub Pages サブディレクトリに置く場合は `/diary/` 等。
   `start_url`/`scope` は `./` 相対にして base に追随。
9. **GitHub トークンは IndexedDB の meta ストアに保存**: localStorage は iOS Safari で eviction されやすいため。
   これにより永続化要請（`navigator.storage.persist`）の恩恵を受ける。
10. **UTF-8 → base64 は TextEncoder 経由**: `btoa` は Latin-1 のみのため日本語を含む本文では失敗する。
11. **GitHub ファイルパス命名**: `volumes/{ordinal(3桁0詰め)}-{volumeId}/page-{NN}.txt`。
    ordinal を先頭に置くことで GitHub UI で自然に冊順に並ぶ。
12. **手動切替は確認ダイアログ無し + 事前保存**: 実ノートの感覚に合わせ確認なしだが、
    debounce を待たず即 `saveVolumeText` を呼んでから `rotateVolume` する（データ損失防止）。
13. **pagination と DB の分離**: `splitIntoPages`/`joinPages` は純関数にして Vitest で単体テスト可能に。
    DB 層は idb を使うが、fake-indexeddb でノード環境でもテスト可。
14. **CSS 変数 `--line-height-px` を派生値として global.css で定義**: 罫線の `background-size` と
    line-height 同期の「単一情報源」を確保。別所で再計算しないこと。

## 本PCで実施できなかった作業（HANDOFF.md に委譲）

- `npm install`（依存取得、lockfile 生成）
- `npm run build` / `npm test` の実行（実ビルドと実テスト実行）
- `git init`、初回コミット、GitHub リモート設定、push
- アイコン PNG 生成（ImageMagick 等が必要）
- 実機確認（iOS Safari での PWA 追加、罫線の位置合わせ、スワイプ動作）
- Lighthouse PWA 監査
