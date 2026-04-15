# diary — PWA日記アプリ「ノート」

B5大学ノートに万年筆で書いていた手書き日記の体験を、布団の中でスマホから書ける PWA で再現する日記アプリ。

デザイン原則は **「静けさ」**。通知・バッジ・ストリークといった「続けさせる UX」を排除し、
保存は暗黙、エラーは控えめ、色数は4色、トランジションは 200ms まで。

---

## 主要機能

- 本棚が起点: メイン画面が本棚。ノート（冊）タップでその冊の「最後に開いたページ」から編集再開
- ページ単位 UI: 1 ページ = 1 textarea の独立画面。左右ボタン / スワイプ / PageUp・PageDown でめくる（180ms フェード）
- textarea 上でも水平スワイプでページめくり可能（`|dx| > |dy|*2` かつ 50px 超で発火、IME 中はガード）
- ノート風 UI: 罫線背景 + Klee One + ダークモード。1 ページ = 1200 文字（`CHARS_PER_PAGE`）で、紙高さは 60 行分の罫線（`LINES_PER_PAPER`）。罫線は 1 行ごとに通常罫線で統一
- ヘッダー直下に高さ 3px・10 分割目盛りのモノクロプログレスバー。text.length / CHARS_PER_PAGE の塗り幅でページ残量を静かに可視化（色変化・数値表示・満量アニメーションなし、`role="progressbar"` + aria-valuenow/min/max/label）
- 3 画面（本棚 / エディタ / 設定）のヘッダーは `.app-header` 共通クラスで統一。flex 子要素として配置し、Android の仮想キーボード時もヘッダーは画面上部に残る
- エディタのヘッダーはページ数クラスタを画面真中央に置く 3 列 grid レイアウト
- エディタは `.surface` が外側スクロールコンテナ。非フォーカス時でもページ（紙）を上下にスクロール可能、スクロール中もヘッダー・プログレスバーは画面上部に固定表示
- 1200 文字到達で次ページへ自動遷移（IME 変換中はガード）、60 ページ（`PAGES_PER_VOLUME`）で冊終了（静かに入力ロック、削除は通す）
- 新ノート作成は本棚ヘッダーのメニュー（ハンバーガー）から「新しいノート」を選択（確認ダイアログ付き）
- ノートの削除は本棚カードを 500ms 長押し → 2 段階 confirm（ページ 0 枚は 1 段階）。active ノート削除時は最大 ordinal のノートが自動昇格
- IndexedDB によるローカル永続化（ページ単位 savePage、2 秒 debounce、遷移時 flush）
- ノートごとに「最後に開いたページ」を記憶。カーソル位置はページ単位 localStorage 保存、未保存時は書きかけ（active）は末尾・完了済みは先頭にフォールバック
- 本棚ヘッダーのメニューから「カレンダー」を選択すると全画面モーダルで日付ジャンプ（ローカル日付基準で印が付く）/ 旧 `/read` URL は `/book` へリダイレクト互換
- 本棚のノートカードは `YYYY/MM/DD 〜 YYYY/MM/DD` 表記（書きかけは `〜` 終わり）で期間を表示。並び順は作成日時の降順（新しいノートが先頭、active ノートは常に先頭）
- エディタのヘッダー右端は「日付挿入」ボタン（📅 アイコン / `YYYY年M月D日(曜)\n` をカーソル位置に挿入）のみ。設定へは本棚ハンバーガーメニューから辿る導線に一本化
- エディタ表示中に Android 端末の戻るボタンを押すと、直前履歴ではなく本棚 (`/`) に戻る（`popstate` ガード / 遷移前に自動保存を flush）
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
│  ├─ lib/          # constants (CHARS_PER_PAGE=1200, LINES_PER_PAPER=60, PAGES_PER_VOLUME=60), pagination (splitAtCharLimit), db (idb v2), github, export, pwa
│  ├─ hooks/        # useEditorCursor, useDebouncedCallback
│  ├─ features/
│  │  ├─ editor/    # EditorPage, useEditorAutoSave, DateIcon
│  │  ├─ bookshelf/ # BookshelfPage, VolumeCard, BookshelfMenu(+ .module.css), Calendar
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
- [`.claude/loop/IMPLEMENTATION_PLAN.md`](./.claude/loop/IMPLEMENTATION_PLAN.md) — 実装計画（M1-M3 初期リリース、M4-M7 UX 刷新、M8 UX 追加改善、M9 Android 実機由来の UX 改善、M10 ページ単位を文字数基準へ / 外側スクロール / プログレスバー）
- [`.whiteboard/plan.md`](./.whiteboard/plan.md) — 直近フェーズ（M10 page-char-basis）の詳細設計。過去フェーズは `.whiteboard/archive/`
- [`.claude/loop/AGENTS.md`](./.claude/loop/AGENTS.md) — アーキテクチャ方針と設計判断
- [`.claude/loop/STATE.md`](./.claude/loop/STATE.md) — 現在のプロジェクト状態
- [`.claude/loop/specs/`](./.claude/loop/specs/) — 各タスクの仕様と完了サマリー

---

## ライセンス

Private（個人利用）。
