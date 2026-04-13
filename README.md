# diary — PWA日記アプリ「ノート」

B5大学ノートに万年筆で書いていた手書き日記の体験を、布団の中でスマホから書ける PWA で再現する日記アプリ。

デザイン原則は **「静けさ」**。通知・バッジ・ストリークといった「続けさせる UX」を排除し、
保存は暗黙、エラーは控えめ、色数は4色、トランジションは 200ms まで。

---

## 主要機能

- ノート風 UI: フルスクリーン textarea + 罫線背景 + Klee One フォント + ダークモード
- 30 行ごとのページ区切り線 / 50 ページで 1 冊 → 自動切替 / 手動切替
- IndexedDB によるローカル永続化（自動保存 2 秒 debounce）
- 前回のカーソル位置・スクロールを復元（localStorage）
- 本棚（冊一覧カード）/ 読み返し（スワイプでページめくり）/ カレンダー日付ジャンプ
- GitHub Private リポジトリへの自動バックアップ（オフラインキュー + online 復帰時再同期）
- PWA 対応（vite-plugin-pwa / Workbox / Google Fonts の runtime cache）
- JSON エクスポート（データ消失リスク緩和）/ iOS Safari の A2HS バナー

---

## ディレクトリ構成（抜粋）

```
diary/
├─ public/          # manifest.json / icon.svg / (PNG は別PCで生成)
├─ src/
│  ├─ styles/       # global.css (CSS変数), notebook.css (罫線共通)
│  ├─ lib/          # constants, pagination, db (idb), github, export, pwa
│  ├─ hooks/        # useAutoSave, useCursorRestore, useDebouncedCallback
│  ├─ features/
│  │  ├─ write/     # WritePage, useWrite
│  │  ├─ bookshelf/ # BookshelfPage, VolumeCard, Calendar
│  │  ├─ reader/    # ReaderPage
│  │  └─ settings/  # SettingsPage
│  ├─ types/        # 型定義 (Volume/Page/ExportPayload 他)
│  └─ test/         # Vitest セットアップ (fake-indexeddb)
├─ index.html, vite.config.ts, tsconfig.json, package.json
└─ .claude/loop/    # 実装計画 & エージェント向けドキュメント
```

---

## 最小コマンド早見表

```bash
npm install           # 初回のみ（別PCで実施）
npm run dev           # 開発サーバ
npm test              # Vitest (watch)
npm run test:run      # Vitest (1回実行)
npm run lint          # tsc --noEmit
npm run build         # 本番ビルド → dist/
npm run preview       # dist をローカルサーブ（ServiceWorker 有効）
```

環境変数:
- `VITE_BASE_PATH` — GitHub Pages サブディレクトリ配置時に `/diary/` 等を指定。デフォルト `/`。

---

## 初回セットアップ / デプロイ / 実機確認

**このリポジトリは依存をインストールしない制約のある PC で作成されたため、
別の開発機で `npm install` と `git init` を行う必要がある**。
詳細手順、アイコン PNG 生成、GitHub Pages デプロイ、GitHub PAT 発行、
iOS PWA インストール確認、トラブルシュートは:

→ [`HANDOFF.md`](./HANDOFF.md)

---

## 技術スタック

| 用途 | 選択 |
|---|---|
| フレームワーク | React 19 + Vite 6 + TypeScript (strict) |
| ルーティング | React Router (HashRouter) |
| CSS | CSS Modules + CSS 変数（`global.css`） |
| 永続化 | IndexedDB (idb v8) + localStorage（カーソル位置のみ） |
| フォント | Klee One (Google Fonts CDN, SW でキャッシュ) |
| PWA | vite-plugin-pwa (Workbox) |
| バックアップ | @octokit/rest (GitHub API) |
| テスト | Vitest + jsdom + fake-indexeddb + @testing-library/react |

---

## ドキュメント

- [`HANDOFF.md`](./HANDOFF.md) — 別PCでの初回セットアップ・デプロイ手順
- [`.claude/loop/IMPLEMENTATION_PLAN.md`](./.claude/loop/IMPLEMENTATION_PLAN.md) — 実装計画（14タスク）
- [`.claude/loop/AGENTS.md`](./.claude/loop/AGENTS.md) — アーキテクチャ方針と設計判断
- [`.claude/loop/STATE.md`](./.claude/loop/STATE.md) — 現在のプロジェクト状態
- [`.claude/loop/specs/`](./.claude/loop/specs/) — 各タスクの仕様と完了サマリー

---

## ライセンス

Private（個人利用）。
