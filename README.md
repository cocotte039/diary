# diary — PWA日記アプリ「ノート」

B5大学ノートに万年筆で書いていた手書き日記の体験を、布団の中でスマホから書ける PWA で再現する日記アプリ。

デザイン原則は **「静けさ」**。通知・バッジ・ストリークといった「続けさせる UX」を排除し、
保存は暗黙、エラーは控えめ、色数は4色、トランジションは 200ms まで。

---

## 主要機能

- 本棚が起点: メイン画面が本棚。冊タップでその冊の「最後に開いたページ」から編集再開
- ページ単位 UI: 1 ページ = 1 textarea の独立画面。左右ボタン / スワイプ / PageUp・PageDown でめくる（180ms フェード）
- textarea 上でも水平スワイプでページめくり可能（`|dx| > |dy|*2` かつ 50px 超で発火、IME 中はガード）
- ノート風 UI: 罫線背景 + Klee One + ダークモード、ヘッダーと本文 1 行目が重ならない罫線整合
- 3 画面（本棚 / エディタ / 設定）のヘッダーは `.app-header` 共通クラスで上部固定・左右 `max(1rem, safe-area)` 統一
- 30 行到達で次ページへ自動遷移（IME 変換中はガード）、50 ページで冊終了（静かに入力ロック）
- 新冊作成は本棚の「＋ 新しい冊」カードからのみ（確認ダイアログ付き）
- 冊の削除は本棚カードを 500ms 長押し → 2 段階 confirm（ページ 0 枚は 1 段階）。active 冊削除時は最大 ordinal の冊が自動昇格
- IndexedDB によるローカル永続化（ページ単位 savePage、2 秒 debounce、遷移時 flush）
- 冊ごとに「最後に開いたページ」「カーソル位置」を記憶して復元
- カレンダー日付ジャンプ / 旧 `/read` URL は `/book` へリダイレクト互換
- ヘッダー右端にモノクロ SVG の日付挿入アイコン（`YYYY年M月D日(曜)\n` を挿入）
- GitHub Private リポジトリへの自動バックアップ（オフラインキュー + online 復帰時再同期）
- PWA 対応（vite-plugin-pwa / Workbox / Google Fonts の runtime cache）
- JSON エクスポート（データ消失リスク緩和）/ iOS Safari の A2HS バナー

---

## ディレクトリ構成（抜粋）

```
diary/
├─ public/          # manifest.json / icon.svg / (PNG は別PCで生成)
├─ src/
│  ├─ styles/       # global.css (CSS変数 / --header-height / .app-header / .app-header-link), notebook.css (罫線共通)
│  ├─ lib/          # constants, pagination (splitAtLine30), db (idb v2), github, export, pwa
│  ├─ hooks/        # useEditorCursor, useDebouncedCallback
│  ├─ features/
│  │  ├─ editor/    # EditorPage, useEditorAutoSave, DateIcon
│  │  ├─ bookshelf/ # BookshelfPage, VolumeCard, NewVolumeCard, Calendar
│  │  └─ settings/  # SettingsPage
│  ├─ types/        # 型定義 (Volume/Page/ExportPayload 他)
│  └─ test/         # Vitest セットアップ (fake-indexeddb)
├─ index.html, vite.config.ts, tsconfig.json, package.json
└─ .claude/loop/    # 実装計画 & エージェント向けドキュメント
```

### ルーティング

| パス | 画面 |
|---|---|
| `/` | 本棚（メイン） |
| `/book/:volumeId/:pageNumber` | エディタ（ページ単位） |
| `/settings` | 設定 |
| `/read/:volumeId/:pageNumber` | 旧 URL → `/book/...` へリダイレクト |

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
- [`.claude/loop/IMPLEMENTATION_PLAN.md`](./.claude/loop/IMPLEMENTATION_PLAN.md) — 実装計画（M1-M8。M1-M3 は初期リリース、M4-M7 は UX 刷新、M8 は UX 追加改善）
- [`.whiteboard/plan.md`](./.whiteboard/plan.md) — 直近フェーズ（M8 UX 改善）の詳細設計。過去フェーズは `.whiteboard/archive/`
- [`.claude/loop/AGENTS.md`](./.claude/loop/AGENTS.md) — アーキテクチャ方針と設計判断
- [`.claude/loop/STATE.md`](./.claude/loop/STATE.md) — 現在のプロジェクト状態
- [`.claude/loop/specs/`](./.claude/loop/specs/) — 各タスクの仕様と完了サマリー

---

## ライセンス

Private（個人利用）。
