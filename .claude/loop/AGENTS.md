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

## 実装時に追加した判断（2026-04-14 M6）

36. **🟡 50 ページロックの判定は「行数 > LINES_PER_PAGE」で行う**: `splitAtLine30` の
    `overflow.length > 0` だと、30 行末尾で Enter したケース (split→31 要素だが最後が空で
    `join('\n')` が `''`) を取りこぼす。`nextValue.split('\n').length > LINES_PER_PAGE`
    で常に行数増加を検知し、preventDefault の漏れを防ぐ。
37. **🟡 React の `onBeforeInput` は native `beforeinput` ではなく keypress/textInput/paste/
    compositionend に bind される**: そのためテストでは `fireEvent.beforeInput` が使えず、
    Enter を `KeyboardEvent('keypress', { charCode: 13 })` で dispatch して onBeforeInput を
    発火させる。ハンドラ側は SyntheticInputEvent の `data` と native の `InputEvent.data` を
    両方フォールバックとして読み、`\r → \n` への正規化も行う。
38. **🟡 自動次ページ遷移は専用 checkOverflowAndNavigate 関数に集約**: onChange と
    onCompositionEnd の両方から呼ぶ必要があるため、goPage とは別系統の遷移関数として分離。
    現ページの keep 保存と次ページの overflow prepend を 1 つの async で連鎖させ、
    完了後に `navigate` する。遷移中は transitionLockRef でロックし多重発動を防ぐ。
39. **🟡 遷移後カーソルは pendingCursorPosRef + requestAnimationFrame で復元**: useEditorCursor
    の localStorage 復元より後に実行されないと上書きされる。初期ロード useEffect 内で pending 値が
    あれば rAF 経由で setSelectionRange する。値はクランプして textarea 長に収める。
40. **🟡 useWrite.rotateNow は UI から切り離すだけで残置**: T6.6 で WritePage のボタンのみ除去し、
    useWrite.rotateNow エクスポート自体は残す。M7 T7.5 の WritePage/useWrite 削除で同時に消す。
41. **🟡 BookshelfPage のリロードは reloadKey state 変更で useEffect 再実行**: rotateVolume 後に
    getAllVolumes/getAllPages を再取得する必要があるが、イベントバス導入は過剰。依存配列に
    `[reloadKey]` を置き、`setReloadKey((k) => k + 1)` で再レンダを発火する方式で十分。
42. **🟡 NewVolumeCard は独立コンポーネント**: BookshelfPage.tsx 内インラインでも良いが、
    スタイル・aria 属性・今後の装飾追加を考え 1 ファイル分割。`styles.card + styles.newCard` で
    既存 .card と共通化し、破線境界・opacity のみ差分。

## 実装時に追加した判断（2026-04-14 M7）

43. **🟡 ヘッダー高さは 2 行分で固定**: `--header-height = calc(2 * var(--line-height-px))` = 57.6px。
    本文は `padding-top = var(--header-height) + env(safe-area-inset-top)` でヘッダー分下げ、
    罫線も `background-position: 0 env(safe-area-inset-top)` で揃える。ヘッダー自体は不透明背景で
    本文上端を隠す方式。iOS Safari の safe-area-inset は実機目視が最終判断。
44. **🟡 app-header-link クラスで 3 ページのヘッダーを統一**: `global.css` に共通クラスを定義し、
    EditorPage/BookshelfPage/SettingsPage の Link に付与。opacity 0.3 / active 0.6 / 0.75rem。
    CSS Module 内で :global を書かずにクラス参照だけで済むよう、JSX 側に `className="app-header-link"` を直接置く方針。
45. **🟡 DateIcon は機能ディレクトリ直下に配置**: 共通 icons ディレクトリを新設せず、
    `src/features/editor/DateIcon.tsx` に 1 ファイル。将来他アイコンが増えたら集約検討。
    SVG は stroke=currentColor で親の color を継承し、aria-hidden でボタン側の aria-label に任せる。
46. **🟡 日付挿入ボタンの hit area は styles.headerDateButton で 44x44 固定**: アイコン自体は 16x16 だが、
    ボタンに width/height 44px を与えるタッチ安全域を確保（Skeptic M3）。
47. **🟡 insertDate の overflow 判定は既存 checkOverflowAndNavigate 再利用**: 日付挿入で 30 行超過時も
    T6.3 の自動遷移経路を通す。state と requestAnimationFrame による selection 復元の順序を維持。
48. **🟡 WritePage/ReaderPage 削除**: `git rm -r src/features/write src/features/reader` に加え、
    WritePage 専用だった hooks (`useAutoSave`, `useCursorRestore`) も同時削除。
    `/write` ルートは `path="*"` のフォールバックで `/`（本棚）に戻す。
    `/read/:id/:page` は既存ブックマーク互換のため ReadRedirect を残す。
49. **🟡 v1→v2 マイグレーションテストは素の indexedDB.open で構築**: fake-indexeddb + idb の
    upgrade テストは、先にバージョン 1 でオブジェクトストアを作成しレコードを入れてから、
    `getDB()` (DB_VERSION=2) で再 open して upgrade ハンドラを通す。optional フィールド追加のため
    既存レコードは無傷で読める。
50. **🟡 insertDate テストは vi.useFakeTimers を使わない**: AGENTS.md #27 と同じ理由で、
    fake-indexeddb の microtask がハングする。Date 自体を軽量に stub する `withFixedDate`
    ヘルパで決定論化し、rAF の収束は `waitFor` で待つ。

## 本PCで実施できなかった作業（HANDOFF.md に委譲）

- `npm install`（依存取得、lockfile 生成）
- `npm run build` / `npm test` の実行（実ビルドと実テスト実行）
- `git init`、初回コミット、GitHub リモート設定、push
- アイコン PNG 生成（ImageMagick 等が必要）
- 実機確認（iOS Safari での PWA 追加、罫線の位置合わせ、スワイプ動作）
- Lighthouse PWA 監査

## 自律判断ログ

### M8-1（2026-04-14）

- **🟡 EditorPage.module.css の .header は空のクラスとして残置**: JSX 側で
  `styles.header` を参照しているため、クラスごと削除すると CSS Modules が
  undefined を返して `className` が `app-header undefined` になる。空クラスのまま
  残し、共通プロパティは `.app-header` に集約する方針。
- **🟡 BookshelfPage.header の `font-family: var(--font-family-ui)` は削除**:
  `.app-header` が同じフォントを指定しているため冗長。`align-items: baseline`
  のみ残して h1 と Link のベースラインを揃える。
- **🟡 `.header button` の副次スタイルは残置**: `.app-header` 側に移さない。
  BookshelfPage 特有のカレンダートグル以外のボタン装飾なので、
  ヘッダーローカルの責務として module.css に残す。
- **🟡 margin-bottom: 1.5rem の削除**: `.header` は `position: fixed` になったため
  フローから外れ margin-bottom は効かない。代わりに `.root` の `padding-top` で
  ヘッダー＋1rem の逃げを確保する（spec 準拠）。
