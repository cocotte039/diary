# STATE.md — diary プロジェクト状態

## プロジェクト状態

diary（PWA日記アプリ「ノート」）は 2026-04-13 に全14タスクの**静的実装**を完了した。
本PCの制約（`npm install` / ビルド / git / 外部通信コマンド禁止）のため、依存のインストール、ビルド、
テスト実行、コミット、フォントダウンロード、アイコンPNG生成は**別PC（開発機）**で実施する必要がある。
引き継ぎ手順は `diary/HANDOFF.md` に網羅されている。

### 全体アーキテクチャの現状

- フレームワーク: React 19 + Vite 6 + TypeScript (strict + `noUnusedLocals/Parameters`)
- ルーティング: HashRouter (GitHub Pages のサブディレクトリ配置と 404 フォールバック無し環境のため)
- 状態管理: ローカル state + カスタムフック（Redux 等は不要）
- 永続化: IndexedDB (idb v8) + localStorage（カーソル位置のみ）
- データモデル: `Volume { id, createdAt, status, ordinal }` / `Page { id, volumeId, pageNumber, content, createdAt, updatedAt, syncStatus }`
- オフライン: vite-plugin-pwa (Workbox) + Google Fonts runtime CacheFirst
- バックアップ: @octokit/rest で Private リポジトリに Page 単位 PUT、オフラインキュー

### ファイル構成（実装済み）

```
diary/
├─ package.json, tsconfig.json, tsconfig.node.json, vite.config.ts, vitest.config.ts
├─ index.html, .gitignore, .env.example
├─ HANDOFF.md, README.md
├─ public/
│  ├─ manifest.json, icon.svg, ICONS_README.txt
│  └─ (PNG群は別PCで生成予定)
├─ src/
│  ├─ main.tsx, App.tsx
│  ├─ styles/ (global.css, notebook.css)
│  ├─ lib/ (constants, pagination[+test], db[+test], export[+test], github, pwa[+test], storage)
│  ├─ hooks/ (useAutoSave, useCursorRestore, useDebouncedCallback)
│  ├─ features/
│  │  ├─ write/ (WritePage + module.css, useWrite)
│  │  ├─ bookshelf/ (BookshelfPage + module.css, VolumeCard, Calendar + module.css)
│  │  ├─ reader/ (ReaderPage + module.css)
│  │  └─ settings/ (SettingsPage + module.css)
│  ├─ types/ (index.ts, css.d.ts, vite-env.d.ts)
│  └─ test/setup.ts (fake-indexeddb + jest-dom)
└─ .claude/loop/ (IMPLEMENTATION_PLAN.md, AGENTS.md, STATE.md, specs/*.md)
```

### 品質ゲート（npm 禁止下での代替）

- 型整合: 手動レビュー済み。`import` パスは全て相対で解決可。CSS Modules 型宣言 (`src/types/css.d.ts`) あり。
- spec 整合: 全14 spec の受入条件（Truths / Artifacts / Key Links）を実装と突き合わせ済み。
  🟡 項目（iOS Safari 判定、冊終わり余白、configurable PWA base）は spec 推奨のまま実装、
  判断理由は各 spec の「完了サマリー」と AGENTS.md に記載。
- テストコード: Vitest 準拠の `.test.ts` が `pagination / db / export / pwa` に存在。
  実行は別PCで `npm test`。
- ビルド成功可能性: `tsc --noEmit` と `vite build` が別PCで通る前提の静的構造。

### 別PCで最初に行うこと（TL;DR）

```bash
cd diary
npm install              # 依存取得 + lockfile 生成
npm test                 # Vitest 実行（全テスト通過を確認）
npm run dev              # 開発サーバ起動（スマホ実機で https トンネル経由確認）
```
詳細は `HANDOFF.md` の「開発PCでの初回セットアップ」節を参照。

### 残課題・TODO

- 実機（スマホ）での罫線とテキストの位置合わせ検証 → T3.4 で微調整予定（別PC）
- アイコン PNG 4種（192/512/512-maskable/apple-touch/favicon）の生成（別PC + ImageMagick）
- GitHub Pages 向け `VITE_BASE_PATH` 確定（デフォルト `/`、サブディレクトリ配備時に `/diary/` 等へ）
- Lighthouse PWA 監査（別PCでビルド後）
- カレンダーの日付判定のタイムゾーン考慮（v1 は ISO UTC 前提）

---

## M1 サマリー

### スコープ
コア体験のプロトタイプ（スマホで書いて閉じて再度開いたら続きから書ける）を静的実装。

### 主な成果物
- プロジェクト骨格 (T1.1): React 19 + Vite 6 + vite-plugin-pwa + HashRouter + CSS変数 + Klee One CDN
- ノート風書く画面 (T1.2): notebook-surface で罫線、`--line-height-px` で background-size を同期
- ページ区切り (T1.3): 30行ごとの CSS オーバーレイ、page indicator、日付挿入ボタン
- IndexedDB 永続化 (T1.4): volumes/pages/meta の3ストア、ensureActiveVolume でリカバリ対応
- カーソル復元 (T1.5): input ベースで 1秒 debounce、localStorage 保存、restoreReady 初回のみ復元
- エクスポート/A2HS バナー (T1.6): JSON v1 フォーマット、iOS Safari UA 検出

### 設計判断
- Volume に `ordinal` フィールドを追加（spec には無かったが表示用途に必須）。v1 スキーマに含めマイグレーション不要。
- 保存ロジックは差分検知付き（content 同一なら pending フラグを立てない）。
- textarea は単一。ページは CSS 表現のみ（AGENTS.md の設計判断 ①②を踏襲）。

### テスト
- pagination: 境界値（30 / 31 / 1500 / 1501 行）、round-trip（splitIntoPages → joinPages）、スクロール位置計算
- db: ensureActiveVolume 冪等性、saveVolumeText の増減、rotate の atomicity、findPageByDate
- export: version=1、volumes/pages 含有

### 注意/引き継ぎ
- A2HS バナーは jsdom では常に非表示（UA 判定）。実機確認は別PC。
- navigator.storage.persist() は起動時 1回、UI には出さない（静けさ）。

---

## M2 サマリー

### スコープ
冊の切替、本棚、読み返し、カレンダージャンプ。

### 主な成果物
- 冊切替 (T2.1): 1500 行で自動（超過分は新冊1ページへ持ち越し）、手動ボタン（確認なし、事前保存）、
  ending フラグで区切り線を暖色化（page >= 46）
- 本棚 (T2.2): createdAt 降順 2列グリッド、VolumeCard で「第N冊 / YYYY.M - YYYY.M」、active カードは浮上
- 読み返し (T2.3): 読み取り専用 div + notebook-surface 共有、touch swipe 50px 閾値、180ms opacity fade
- カレンダー (T2.4): 自作実装（ライブラリ無し）、月切替、日記のある日にドット、findPageByDate で遷移

### 設計判断
- 期間は Page から導出（Volume に startDate/endDate を持たない）。
- カレンダーの日付キーは `YYYY-MM-DD`（ISO UTC 先頭10文字）。v1 は許容、将来 localized に。
- 冊終わり 2ページの余白縮小（🟡）は v1 で見送り。区切り線の色味変化のみ。

### テスト
- db.findPageByDate（同日一致、無い場合は最近日）

### 注意
- カレンダーは現在月の全 Page を走査。冊数が多い場合のパフォーマンスは将来最適化。
- iOS Safari の戻る操作との衝突は別PC実機で確認、必要なら `touch-action: pan-y` 追加。

---

## M3 サマリー

### スコープ
GitHub バックアップ、PWA オフライン、アイコン/スプラッシュ、フォント/配色の微調整。

### 主な成果物
- GitHub 同期 (T3.1): Octokit、`volumes/{ordinal}-{volumeId}/page-{NN}.txt`、SHA in-memory cache、
  exponential backoff (1/2/4s × 3)、422 は SHA 再取得、online イベントで再開
- PWA オフライン (T3.2): vite.config.ts の runtimeCaching で Google Fonts CacheFirst × 2、manifest 手動管理
- アイコン (T3.3): `public/icon.svg` を置き、PNG 4種は HANDOFF.md 記載の手順で別PC生成
- 配色/罫線微調整 (T3.4): CSS 変数に `--line-height-px` 集約、全画面で `notebook.css` を共有

### 設計判断
- トークン保存先は IndexedDB meta ストア（localStorage より eviction 耐性）。
- UTF-8 → base64 は TextEncoder 経由（btoa は Latin-1 のみ）。
- manifest は `manifest: false` で public/manifest.json を直接配置（spec 指示通り）。

### 注意
- PNG 未生成状態でも `npm run build` は通る（includeAssets の不在は警告のみ）。実運用前に生成必須。
- Lighthouse PWA 監査は別PC ビルド後に実施。
- GitHub Pages サブディレクトリ配置時は `VITE_BASE_PATH=/diary/` を設定して build。manifest の start_url/scope は `./` 相対なので追随する。
