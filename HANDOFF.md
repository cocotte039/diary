# HANDOFF.md — 別PC（開発機）への引き継ぎ

このリポジトリは「依存をインストールしない、git を初期化しない、curl/wget を使わない」制約下の
PC で実装された（`.claude/loop/STATE.md` 参照）。以下を別の開発機で必ず実施すること。

---

## 0. 前提

| 項目 | 推奨 |
|---|---|
| Node.js | **20.x LTS** 以上（Vite 6 は Node 18.x 以上必須） |
| npm | 10.x 以上（Node.js 20 に同梱） |
| OS | macOS / Linux / Windows (WSL 推奨) |
| ブラウザ | Chrome/Edge（開発）、iOS Safari（実機 PWA 確認） |
| ネットワーク | 初回のみ npm registry と Google Fonts CDN にアクセス可能であること |

---

## 1. 初回セットアップ（必須・順序依存あり）

### 1.1 依存のインストール（lockfile 生成）

```bash
cd diary
npm install
```

- これで `package-lock.json` が生成される。本PCでは生成していないため、
  **別PCでの最初の `npm install` がプロジェクトの正式な lockfile になる**。
- 生成後、`git add package-lock.json` してコミットする（手順 5 参照）。

### 1.2 `.env` の作成（任意）

`diary/.env.example` をコピーして `diary/.env.local` を作る。
GitHub Pages のサブディレクトリ配置を行う場合のみ必要。

```bash
cp .env.example .env.local
# .env.local を編集:
#   VITE_BASE_PATH=/diary/        # 例: https://<user>.github.io/diary/
```

紐付くファイル: `vite.config.ts:8` の `const base = process.env.VITE_BASE_PATH ?? '/'`

---

## 2. 開発サーバ起動

```bash
npm run dev
```

- デフォルト `http://localhost:5173/`
- スマホ実機で確認する場合は `npm run dev -- --host` で LAN 公開、もしくは ngrok / Cloudflare Tunnel を利用。
- PWA の ServiceWorker は dev では基本無効。PWA 動作は `npm run build && npm run preview` で確認。

紐付くファイル: `package.json` の `"scripts"` セクション（`diary/package.json:9-14`）。

---

## 3. テスト・ビルド

### 3.1 Vitest（ユニットテスト）

```bash
npm test         # watch モード
npm run test:run # 1回実行（CI向け）
```

テスト対象:
- `src/lib/pagination.test.ts` — ページ分割/行数計算/カーソル位置
- `src/lib/db.test.ts` — IndexedDB CRUD（fake-indexeddb 使用）
- `src/lib/export.test.ts` — JSON エクスポート payload
- `src/lib/pwa.test.ts` — バナー表示判定

### 3.2 型チェック

```bash
npm run lint  # tsc --noEmit
```

### 3.3 本番ビルドとプレビュー

```bash
npm run build    # 出力 dist/
npm run preview  # ビルド結果をローカルサーブ（ServiceWorker も有効）
```

---

## 4. アイコン/スプラッシュの実PNG生成手順（必須）

現在 `public/icon.svg` のみ存在する。PWA に必要な PNG 群を ImageMagick 等で生成する。

### 必要なファイル（全て `public/` 配下）

| ファイル | サイズ | 用途 |
|---|---|---|
| `icon-192x192.png` | 192×192 | PWA アイコン（Android） |
| `icon-512x512.png` | 512×512 | PWA アイコン（splash 用） |
| `icon-512x512-maskable.png` | 512×512 | Android maskable（safe area 12% 内側） |
| `apple-touch-icon.png` | 180×180 | iOS ホーム画面アイコン |
| `favicon.ico` | 32×32 | ブラウザタブ |

### ImageMagick でのワンライナー例

```bash
cd diary/public
magick convert -background '#1c1c20' icon.svg -resize 192x192 icon-192x192.png
magick convert -background '#1c1c20' icon.svg -resize 512x512 icon-512x512.png
magick convert -background '#1c1c20' icon.svg -resize 512x512 -gravity center -extent 640x640 -resize 512x512 icon-512x512-maskable.png
magick convert -background '#1c1c20' icon.svg -resize 180x180 apple-touch-icon.png
magick convert -background '#1c1c20' icon.svg -resize 32x32 favicon.ico
```

生成後、`public/ICONS_README.txt` は削除してよい。

紐付くファイル:
- `public/manifest.json:14-30` が PNG ファイル名を参照
- `index.html:14` の `<link rel="apple-touch-icon">` が apple-touch-icon.png を参照
- `index.html:5` の favicon 参照

---

## 5. Git 初期化と GitHub Pages デプロイ

### 5.1 初回コミット

本PCでは `git init` していない。別PCで以下を実施:

```bash
cd diary
git init
git add .
git commit -m "Initial import of diary PWA (14 tasks implemented)"

# GitHub で空のリポジトリ (例: <user>/diary) を作成してから:
git branch -M main
git remote add origin https://github.com/<user>/diary.git
git push -u origin main
```

### 5.2 GitHub Pages デプロイ（手動ビルド push 方式）

最も簡単な方法:

```bash
# 1) サブディレクトリ配置なら base を指定してビルド
VITE_BASE_PATH=/diary/ npm run build

# 2) dist/ の内容を gh-pages ブランチに push
#    （gh-pages パッケージを使う場合は npm i -D gh-pages して
#     package.json scripts に "deploy": "gh-pages -d dist" を追加）
```

GitHub リポジトリ設定で Pages のソースを `gh-pages` ブランチ `/` に指定。

紐付くファイル:
- `vite.config.ts:8` の base 設定
- `public/manifest.json` の `start_url: "./"` / `scope: "./"`

### 5.3 GitHub Actions 自動デプロイ（オプション）

```yaml
# .github/workflows/deploy.yml （別PCで追加）
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
        env:
          VITE_BASE_PATH: /diary/
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

---

## 6. GitHub API バックアップ用トークン発行

アプリ内「設定」画面から入力するため、環境変数には入れない。

### fine-grained PAT の作成手順

1. https://github.com/settings/tokens?type=beta → **Generate new token**
2. Token name: `diary-backup`
3. Expiration: 1 year（更新を忘れないよう）
4. Resource owner: 自分
5. Repository access: **Only select repositories** → バックアップ先リポジトリを選択
6. Repository permissions:
   - **Contents**: **Read and write**（必須）
   - Metadata: Read-only（自動付与）
7. Generate し、表示されたトークン（`github_pat_...`）をコピー

### アプリへの設定

1. アプリを起動 → 右上「設定」
2. Personal Access Token: 上記のトークンを貼り付け
3. リポジトリ: `<user>/diary-backup` の形式で入力
4. 「保存」→「接続テスト」でグリーン応答を確認
5. 「今すぐ同期」で既存のページをまとめて push

紐付くファイル: `src/features/settings/SettingsPage.tsx`, `src/lib/github.ts`

---

## 7. PWA インストール確認手順

### iOS Safari

1. 開発機で `npm run build && npm run preview -- --host` を実行し、同じ Wi-Fi の iPhone からアクセス（HTTPS 必須のため ngrok 推奨）
2. 共有メニュー → **ホーム画面に追加**
3. ホーム画面のアイコンからアプリを起動 → スタンドアロンモードで開くことを確認
4. 機内モードに切り替え、アプリを再度開く → オフラインでも動くことを確認

### Android Chrome

1. 同上で https アクセス
2. アドレスバーに **アプリをインストール** が出るのでタップ
3. ホーム画面からアプリを起動

### Lighthouse 監査

Chrome DevTools → Lighthouse → PWA カテゴリ → 生成。
赤い項目があれば `manifest.json` / icon 不足 / SW 問題を確認。

---

## 8. トラブルシュート

| 症状 | 対処 |
|---|---|
| `npm install` で 404 | インターネット接続 / npm registry 確認。プロキシ環境なら `npm config set registry` |
| `tsc` エラー `Cannot find module '*.module.css'` | `src/types/css.d.ts` が tsconfig の `include` に入っているか確認（`"include": ["src", ...]`） |
| iOS でフォーカス時に画面が拡大する | `index.html` の viewport に `maximum-scale=1, user-scalable=no` があるか確認。input/textarea の font-size が 16px 以上か確認（`SettingsPage.module.css` の `.input` で 16px 固定） |
| 罫線がテキストに対してズレる | `src/styles/global.css` の `--line-height` と `--font-size` を調整。Klee One 読み込み失敗時の FOUT も疑う。DevTools でフォント適用確認 |
| GitHub sync で 401 | PAT の期限切れ / スコープ不足。手順 6 でトークン再発行 |
| GitHub sync で 404 | リポジトリ名の typo、または private リポジトリへのアクセス権無し |
| GitHub sync で 422 (conflict) | 別環境から同じファイルを更新。`src/lib/github.ts` が SHA 再取得してリトライするので数回でおさまるはず |
| ServiceWorker が古いまま更新されない | DevTools → Application → Service Workers → Update on reload。`VitePWA({ registerType: 'autoUpdate' })` は自動更新だが既存 SW は一度手動で unregister が必要な場合あり |
| Windows で改行が CRLF になる | `.gitattributes` で `* text=auto eol=lf` を指定推奨 |
| fake-indexeddb のテストで hang | `vi.setConfig({ testTimeout: 10000 })` で延長、またはテストの beforeEach での wipeDB 失敗を確認 |

---

## 9. チェックリスト（作業漏れ防止）

- [ ] `npm install` 実行 → `package-lock.json` が生成された
- [ ] `npm test` が全 pass
- [ ] `npm run lint` が pass
- [ ] `npm run build` が成功
- [ ] `public/icon-*.png`, `public/apple-touch-icon.png`, `public/favicon.ico` を生成
- [ ] `git init` → 初回コミット → GitHub push
- [ ] GitHub Pages 設定で `/diary/` 等のサブパスを確認、`VITE_BASE_PATH` を合致させる
- [ ] 実機（iOS）でホーム画面追加、オフライン動作、罫線位置を確認
- [ ] PAT 発行 → アプリ設定画面 → 接続テスト グリーン
- [ ] 一度「今すぐ同期」して GitHub にファイルが push されたことを確認
