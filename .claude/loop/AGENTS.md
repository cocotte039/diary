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

### M8-3（2026-04-14）

- **🟡 active 昇格時の ordinal タイブレーク**: `all.sort((a, b) => b.ordinal - a.ordinal)` の
  stable 比較に任せ、同 ordinal の場合は配列先頭（IndexedDB の挿入順に依存）を採用する。
  運用上 ordinal は `ensureActiveVolume` / `rotateVolume` で単調増加採番されるため衝突しない想定。
  万一衝突しても「どちらか 1 冊が active になる」だけで整合性は保たれる。
- **🟡 no-op 時も `await tx.done` を待つ**: `target` が `undefined` でも readwrite tx を
  開いた以上は commit を待機してから return。idb のドキュメント通りの安全側実装。
  実害は無いが「トランザクション開いたら必ず閉じる」規約の一貫性を優先。
- **🟡 削除テストでの「2 冊構成」作成は rotateVolume 経由**: 直接 `put` で作ると
  既存 ensureActiveVolume が先に active を作ってしまい冊が 3 つになる。`ensureActiveVolume` →
  `rotateVolume` で v1=completed(ord=1) / v2=active(ord=2) という素直な状態を作るのが最短。
- **🟡 配線検証は grep 出力目視**: M8-4 で UI 呼び出しが入るまで db.ts の export と
  test の import だけで足りる。UI から未呼び出しでも dead-code 警告は TS 側で出ないため許容。

### M8-2（2026-04-15）

- **🟡 textarea 上スワイプテストの fireEvent target 指定**: `fireEvent.touchStart/touchEnd` に
  textarea 要素を直接渡す方式を採用。既存の `swipe(el, from, to)` ヘルパを流用し、
  第1引数を `root` から `textarea` に差し替えるだけで B 案の配線を検証できる。
  バブリングの挙動は React onTouchStart/onTouchEnd が root 上で発火するため問題なし。
- **🟡 水平優位テストの座標選択 (dx=60/dy=20)**: |dx|=60 > |dy|*2=40 を満たしつつ
  閾値 50px も超える最小構成。実機で親指 1 本を斜め 20deg 振った場合の近似。
- **🟡 縦優位テストの座標選択 (dx=30/dy=60)**: B 案で navigate しないことを確認するため
  `Math.abs(dx) <= Math.abs(dy) * 2` (30 <= 120) を明確に満たす組み合わせ。
  ついでに閾値 50px 未満もカバーする（二重の防御ラインを同時確認）。
- **🟡 既存「root 余白縦スクロール」テストの座標は不変で通過**: dx=-30/dy=80 は
  `|dx| < SWIPE_THRESHOLD_PX` で先に弾かれるため、2:1 判定より手前で終了する。
  B 案の厳格化後も挙動が変わらず、リグレッションテストとして有効。

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

### M1（2026-04-15 page-char-basis）

- **🟡 LINES_PER_VOLUME は削除**: grep 結果、定義箇所 (constants.ts) 以外で参照無し。
  spec 通り削除し、`CHARS_PER_VOLUME` への置換も行わない（呼び出し側が無いため不要）。
- **🟡 splitIntoPages / joinPages は維持して文字数ベースに書き換え**: `db.ts` の
  `saveVolumeText` から呼ばれている。削除すると DB 層の冊保存が壊れる。
  チャンクを `text.slice(i, i + CHARS_PER_PAGE)` で 1200 文字ごとに切る方式へ変更。
  joinPages は `pages.join('')`（区切り文字なしの単純連結）で round-trip 成立。
- **🟡 getPageNumber は維持**: spec で「使われていれば書き換え」とあるが、現状
  pagination.test.ts でのみ参照。M2 以降の Editor で再活用される可能性も考え、
  文字数ベースに書き換えて残置。実装は `Math.floor(clamped / CHARS_PER_PAGE) + 1`。
- **🟡 getScrollTopForCursor はロジック維持**: `useEditorCursor.ts` から参照。M3 で
  scroll target が `.surface` に変わるが、y = lineIndex * LINE_HEIGHT_PX の計算は同じ。
  JSDoc に「外側スクロールでも同じ計算」と明記。
- **🟡 db.test.ts の「3ページ生成」テスト**: `'あ'.repeat(CHARS_PER_PAGE * 2 + 1)` で
  3 ページに分割される（1200/1200/1）。日本語文字を使うことで「文字数ベース」が
  バイト数でないことも暗黙に検証。
- **🟡 constants.test.ts に削除済みエクスポート検査を追加**: `import * as constants` で
  名前空間を取得し、`(constants as Record<string, unknown>).LINES_PER_PAGE` が
  undefined であることを検証。残留復活防止のリグレッションテスト。

### M2（2026-04-15 page-char-basis）

- **🟡 ensurePaperHeight 全削除**: plan 通り関数定義・呼び出し・関連 useEffect
  すべて削除。M3 の CSS（`.textarea { min-height: var(--page-height-px) }`）で紙高さ
  下限を保証する前提。M3 が未完のため一時的に空ページで罫線が 60 本描画されない
  ケースがあり得るが、テストは glass-box な CSS 依存が無いため全緑で通過確認済み。
- **🟡 useLayoutEffect の依存配列は [text, ready]**: `text` 変更（入力・日付挿入・
  fetch 後の初期流し込み）と `ready` 切替（初回ロード完了）の両方で高さを追従させる。
  textareaRef は ref なので依存に含めない（React ESLint 既存規約と整合）。
- **🟡 視覚行 overflow テスト (M9-M5) 2 件は削除**: spec T2.5 および plan の「仕様廃止」に
  従い、scrollHeight をモックする 2 テストを削除。文字数ベースでは scrollHeight 依存
  しないため意味が無い。代わりに「1200 字ちょうどでは遷移しない」という境界テストを
  新設し、文字数境界の回帰を防ぐ。
- **🟡 最終ページロックのテストを「1200 字末尾で 1 文字/改行」の 2 形態に拡張**: 旧テスト
  は改行のみ検証だったが、M2-T3 で `nextValue.length > CHARS_PER_PAGE` に変えたことで
  通常文字もロック対象になったため、通常文字 1 文字 ('x') と改行 '\n' の両ケースを
  追加で検証する。49 ページ目テストは `PAGES_PER_VOLUME - 1 = 59` ページ目に書き換え。
- **🟡 テストで使う overflow 生成は `'あ'.repeat(...)`**: 日本語 1 文字 = `string.length` 1
  なので CHARS_PER_PAGE と直接対応する。M1 の db.test.ts と表記統一。
- **🟡 import の並べ替え**: `CHARS_PER_PAGE`, `PAGES_PER_VOLUME`, `SWIPE_THRESHOLD_PX`
  のアルファベット順を優先し、`splitAtCharLimit` の import 行を定数 import の直後に
  再配置（元コードでは PAGE_HEIGHT_PX ローカル定数の定義に挟まれて散らばっていた）。

### M3（2026-04-15 page-char-basis）

- **🟡 `.textarea` の flex は `0 0 auto`**: M2 までは `flex: 1 1 auto; min-height: 0;`
  で textarea 自身が surface 内いっぱいに広がる前提だった。M3 で外側スクロールに
  切り替え、`height: auto; min-height: var(--page-height-px)` に変えたため、flex で
  伸縮させずコンテンツ高 (＝ scrollHeight or min-height のどちらか大) に任せる方針。
  これで 60 行固定下限 + 内容超過時の自然な拡張が両立する。
- **🟡 `useEditorCursor` に `surfaceRef` 引数を追加（optional 最終引数）**: 既存の
  `fallback: 'end' | 'start'` の後ろに `surfaceRef?: React.RefObject<HTMLElement | null>`
  を追加。`closest('[data-testid="editor-surface"]')` 方式も検討したが、EditorPage 側で
  既に ref を持たせるのが最も素直（DOM クエリより型安全・テスト書きやすい・追加コスト無し）。
  未指定時は scrollTop 書き込みを NOP にし、既存の useEditorCursor.test.ts (10 ケース) を
  書き換えずに緑のまま維持できる。
- **🟡 scrollIntoView ではなく scrollTop 直書き**: `el.scrollIntoView({ block: 'center' })`
  は親要素のスクロールを変えるが、カーソル行が画面中央に来る UX は本アプリの静けさ
  （「書いた行は上詰めで見える」想定）に合わない。既存の `getScrollTopForCursor` が
  y = lineIndex * LINE_HEIGHT_PX で行頭揃えの scrollTop を返す設計を活かし、
  surface.scrollTop に直接書き込む方式を採用。
- **🟡 `.root` の position: fixed は維持**: spec T3.1 にも「.root は変更しない」と
  明記。iOS Safari の body 暴走抑止のため従来通り。scroll はあくまで `.surface` が
  持ち、`.root` は viewport 固定・flex コンテナの役割に徹する。
- **🟡 `-webkit-overflow-scrolling: touch` は `.surface` にのみ付与**: spec 通り。
  `.root` や `html, body` には付けない（iOS で overflow: hidden な祖先に付けると
  副作用があるため）。将来的に古い iOS サポートを切る際は削除可。
- **🟡 T3.3 は CSS 側検証のみ（コード変更なし）**: `--page-height-px` は既に
  `calc(60 * 28.8px)` = 1728px で正しく、コメントも `LINES_PER_PAPER と同期` 相当の
  記述が global.css L34-36 にある。notebook.css の `background-attachment: local` は
  commit c2e4d5f で既に入っており、surface スクロール時は textarea 全体が動くため
  罫線とテキストは同期する。追加の CSS 変更は不要。

### M4（2026-04-15 page-char-basis）

- **🟡 色トークンではなく rgba 直指定を採用**: plan.md D5 は `--color-text` /
  `--color-rule` / `--color-page-divider` の流用を許容し、spec m4-t2.md は rgba
  直指定を指示。global.css のトークンは opacity が固定（`--color-rule` = 0.08、
  `--color-page-divider` = 0.15）で、合意値（トラック 0.15 / tick 0.3 / 塗り 0.5）を
  正確に再現できない。静けさ原則と合意 opacity の忠実再現を優先し、ダークテーマ用の
  `rgba(255,255,255, {0.15|0.3|0.5})` を EditorPage.module.css にローカル直指定。
  将来カラーテーマを増やす際はトークン化を再検討する。
- **🟡 プログレスバーに `data-testid="page-progress"` を付与**: spec m4-t3 の
  「常時存在確認」で `role="progressbar"` を検索すると他の将来要素（ARIA live 等）と
  衝突する可能性があるため、安定セレクタとして testid を併用。`role` / `aria-*` は
  合わせて付与するので semantic a11y は損なわない。
- **🟡 1300 字 clamp テストは最終ページに直接保存してロード**: 通常ページで 1300 字を
  setValue すると `checkOverflowAndNavigate` が走って overflow が次ページへ押し出される
  ため、「1300 字を保持したまま表示」が検証できない。最終ページ（PAGES_PER_VOLUME）は
  T6.4 の onBeforeInput ロック対象で自動遷移の対象外、かつ既存 1200 字超データ
  （旧基準データの移行後想定）をロードするケースと実質同じなので、この経路で clamp を
  検証する。
- **🟡 progressPct は毎レンダ計算（memo しない）**: `text.length / CHARS_PER_PAGE` は
  数値演算 2 回 + `Math.round` + `Math.min` のみで O(1)。useMemo を挟むと依存配列の
  比較コストの方が重くなる可能性があり、静けさ原則（最小限の間接層）にも反するため
  インライン計算で十分。

### M8-4（2026-04-14）

- **🟡 VolumeCard の Pointer Events 実装範囲**: `onPointerDown/Move/Up/Cancel/Leave`
  の 5 点を `<Link>` に直接配線。`onContextMenu={(e) => e.preventDefault()}` も
  併用して mouse 右クリック・iOS の長押しコールアウト両方を抑止。
- **🟡 confirm 文言**: 1 段階目は pages.length 0 / 1+ で分岐
  (`この冊を削除します。よろしいですか？` / `この冊と全 N ページを削除します。よろしいですか？`)。
  2 段階目（1+ のときのみ）は固定で `本当に削除しますか？この操作は取り消せません。`。
  静けさ原則に沿って感嘆符・トーストは使わず `window.confirm` 2 段で十分。
- **🟡 テストは実時間待ち 600ms**: `vi.useFakeTimers` は fake-indexeddb と干渉する
  ので使わず、`setTimeout(r, LONG_PRESS_MS + 100)` で実時間待機。テスト数は少ないので
  合計 4 秒程度の追加で許容範囲。
- **🟡 JSDOM の `fireEvent.pointerXxx` は clientX/clientY を渡さない**:
  `createEvent.pointerMove(el, {clientX, clientY})` でイベントを作り、さらに
  `Object.defineProperty(ev, 'clientX', {get: () => X})` で強制セットしてから
  `fireEvent(el, ev)` する `firePointer` ヘルパを BookshelfPage.test.tsx に定義。
- **🟡 0 ページ冊の E2E テストは `replaceAllData` で直接状態を作る**:
  `ensureActiveVolume` / `rotateVolume` は共に page 1 を自動生成するため、
  「ページ 0 枚の冊」を再現するには DB を直接書き換える必要がある。
- **🟡 longPressFiredRef を onClick で reset**: 長押し成立後の click で
  `preventDefault + stopPropagation` してから ref を false に戻す。
  この reset を忘れると次のタップが常に抑止される。
