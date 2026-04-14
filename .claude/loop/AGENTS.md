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

## 実装時に追加した判断（2026-04-14 UX改修 M4-M7）

15. **🟡 トランジション時間の併存**: 要件の 180ms（編集ページ）と既存の 200ms（他UI）を別CSS変数として併存。
    `--transition-page: 180ms ease`（EditorPage）、`--transition-soft: 200ms ease`（既存）。統一より使い分けを優先。
16. **🟡 スワイプ競合回避は領域限定方式(A案)**: textarea外（ヘッダー下余白・ページ番号周辺）のみでスワイプ判定。
    実機検証後に横移動>縦移動×2方式(B案)への切替余地あり。
17. **🟡 50ページロック時の視覚フィードバック無し**: 静けさ原則に従いトースト・点滅等は出さない。
    冊終わりの暖色ラインで視覚的に「最後」が伝わる。
18. **🟡 新冊作成UIは破線境界カード(A案)**: ヘッダーボタンではなく、本棚グリッド末尾に「＋ 新しい冊」の破線カード。
    誤タップが起きにくく視覚連続性が保てる。
19. **🟡 PageUp/PageDownでの遷移**: PC/タブレット配慮として追加。scroll標準動作はpreventDefault。
20. **🟡 ReaderPage は EditorPage に統合して削除**: 編集と閲覧を一体化する方針。
    読み取り専用モードが必要になれば別タスクで対応。
21. **🟡 /read → /book の redirect で既存ブックマーク互換**: `<Route path="/read/:id/:page" element={<Navigate to="/book/:id/:page" />}`
22. **🟡 savePage / updateVolumeLastOpenedPage / getLatestUpdatedPageNumber を db.ts に追加**:
    既存の saveVolumeText は冊全文を分割保存するため、EditorPage では使わず単一ページ put の savePage を使う（他ページ破壊防止）。
23. **🟡 splitAtLine30 の仕様**: `text.split('\n').length <= 30` なら overflow は空文字。
    30行目の末尾改行まで keep に含める。純関数として pagination.ts に配置。
24. **🟡 30行超過時のカーソル位置**: 次ページ先頭から `overflow.length` の位置に置く（直感的な「続きから書く」感覚）。
25. **🟡 DB v2 マイグレーションは optional フィールドのみ**: `Volume.lastOpenedPage?: number` を追加。
    既存レコードの書換不要で後方互換。v2→v1 ダウングレードは考慮外。
26. **🟡 updateVolumeLastOpenedPage の M4 時点での呼び出し点は EditorPage**: T5.1 でページ遷移ボタン側に
    正式配線する予定だが、M4 段階で「dead function」になるのを避けるため、EditorPage の初期ロード時に
    fire-and-forget で呼ぶ。これにより「最後に開いたページを記憶」要件を M4 単体でも満たす。
27. **🟡 useEditorAutoSave のテストで vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })**:
    fake-indexeddb は microtask (queueMicrotask/Promise) で動作するため、デフォルトの fake timers で
    全部を偽装すると IDB 操作がハングする。setTimeout/clearTimeout のみ偽装してマイクロタスクは実時間に保つ。

## 実装時に追加した判断（2026-04-14 M5）

28. **🟡 goPage は単一経路にまとめる**: T5.1 のボタン / T5.3 のスワイプ / T5.5 のキー / T6.3 の
    自動遷移すべてから同じ `goPage(delta)` を呼ぶ。flush → lastOpenedPage 更新 → 180ms フェード →
    navigate の流れを配線統一することで、経路ごとの差分バグを防ぐ。
29. **🟡 フェード完了は transitionLockRef + useEffect のリセットで制御**: setState(fading=false) を
    タイマー完了で呼ぶと unmount race に陥るため、遷移先ページの初回レンダ useEffect で
    `[volumeId, current]` 依存として `setFading(false)` / `transitionLockRef.current = false` を実行。
30. **🟡 EditorPage テストで fake timers を使わない方針**: M5 テストは jsdom の実 setTimeout + waitFor で
    書く。`findByLabelText` が内部で setTimeout に依存するため、fake timers を有効にすると
    レンダ自体が止まる。全体で ~1〜3 秒程度で収束するのでテスト時間も許容範囲。
31. **🟡 useEditorCursor は新規フック路線**: 既存 `useCursorRestore` は WritePage 用に残し、
    EditorPage 用はキーを `${LS_CURSOR_KEY}:${volumeId}:${pageNumber}` にスコープ化した
    新規フック `useEditorCursor` を追加。volumeId/pageNumber 依存でリセットし再復元。
    従来の単独キーは読まず（後方互換より静けさ・明確さを優先）、M7 WritePage 削除時に旧フックも除去。
32. **🟡 onSelect と onChange 両方から onSelectionChange を呼ぶ**: textarea のカーソル位置は
    `onSelect`（矢印キー・クリック）と `onChange`（入力）の両方で変化しうる。統一ハンドラで
    selectionStart を localStorage に debounce 保存する。
33. **🟡 スワイプの target 判定は `target instanceof HTMLTextAreaElement` で十分**: notebook-surface の
    疑似要素 (罫線) は onTouchStart を発火しないため、target は root div または textarea のどちらか。
    将来追加要素でも textarea 以外は「余白」として扱う方針で問題無い。
34. **🟡 PageUp/PageDown は textarea の onKeyDown に配線**: root 全体に window listener を貼ると
    モーダル等との干渉が予測しにくい。textarea フォーカス時のみ反応する方が静かで副作用が小さい。
35. **🟡 PAGE_FADE_MS 定数は EditorPage ローカル**: CSS 変数 `--transition-page` と対になる
    JS 側の所要時間。DRY 化のため constants.ts 送りも検討したが、トランジション時間の調整は
    CSS 変数で行うのが自然なので現状は両方個別に持つ。今後ズレが問題になったら constants に移す。

## 本PCで実施できなかった作業（HANDOFF.md に委譲）

- `npm install`（依存取得、lockfile 生成）
- `npm run build` / `npm test` の実行（実ビルドと実テスト実行）
- `git init`、初回コミット、GitHub リモート設定、push
- アイコン PNG 生成（ImageMagick 等が必要）
- 実機確認（iOS Safari での PWA 追加、罫線の位置合わせ、スワイプ動作）
- Lighthouse PWA 監査
