# 実装計画 — PWA 日記アプリ UX 改修 (M4〜M7)

## Goal

本棚を中心とした UX に転換し、紙のノートのメタファを強化する。
具体的には:
1. ルート `/` を本棚画面に変更、冊タップで編集画面へ遷移
2. 「書く」という UI 名称を廃止、1ページ=1 textarea の独立 UI へ変更
3. 左右スワイプ/ボタンによるページめくり、30行到達時の自動ページ遷移
4. ヘッダーと本文1行目の重なり解消、日付アイコンのヘッダー格上げ
5. 新冊作成は本棚でのみ可能、常時ボタン＋確認ダイアログ

## Context（現状把握）

### 現行アーキテクチャ
- React 19 + Vite + TypeScript + HashRouter、IndexedDB v1 (idb)
- `/` = WritePage（1冊=1 textarea）、`/bookshelf` = 本棚、`/read/:id/:page` = ReaderPage（読み取り専用）
- `useWrite` は冊全文を1本の string で保持 → autosave で `splitIntoPages()` → 複数 Page に展開
- 罫線は `notebook-surface` クラスの repeating-linear-gradient、line-height 同期必須
- 既存定数: `LINES_PER_PAGE=30`, `PAGES_PER_VOLUME=50`, `LINE_HEIGHT_PX=28.8`

### 現状コードでの重要な構造
- `src/lib/db.ts`: `saveVolumeText(id, text)` が冊全文を受けてページ単位に分割保存する。**新 UI ではこれを使わず、`savePage(volumeId, pageNumber, content)` を追加して単一ページ保存に切り替える**（Skeptic C1 対策）
- `src/features/reader/ReaderPage.tsx`: 左右スワイプ + 180ms フェードのロジックが既に存在 → EditorPage に移植する
- `src/features/bookshelf/VolumeCard.tsx`: 現在は `/read/:id/1` に遷移 → `/book/:id/:lastOpenedPage` に変更
- 既存テスト: `pagination.test.ts`（pure 関数のみ）。DB 層は fake-indexeddb で Vitest テスト可

## チーム構成

- Pragmatist（実用性・最短経路・最小変更）
- Skeptic（リスク・エッジケース・回帰）
- Aesthete（視覚的美しさ・UX・認知負荷）

---

## マイルストーン分割（垂直スライス）

合計 4 マイルストーン。各マイルストーン完了時に動作する機能が増える構成。

### M4: ルート再編と最小 EditorPage（冊を開ける）
### M5: ページめくり UI とページ単位保存（ページ単位で書ける）
### M6: 30行境界・50ページロック・本棚刷新（ページが自動でめくれる・新冊が作れる）
### M7: ヘッダー整合・日付アイコン・旧画面削除（見た目が整う）

---

## M4: ルート再編と最小 EditorPage

**垂直スライス**: ユーザーは本棚から冊をタップし、新しい編集画面で日記を書ける。

### Wave 1（並列）
- **T4.1 ルーター変更**（🔵）
  - `src/App.tsx`: `/` を `BookshelfPage` に、`/book/:volumeId/:pageNumber` を新 `EditorPage` に割当
  - `/read/:volumeId/:pageNumber` → `/book/:volumeId/:pageNumber` の Navigate redirect 追加
  - WritePage は当面 `/write` に退避（削除は M7）
  - テスト: Vitest でルート解決（Navigate の動作確認）
  - 受入条件: 既存ブックマーク `/#/read/:id/1` が `/#/book/:id/1` にリダイレクトされる

- **T4.2 Volume 型拡張 と DB v2 マイグレーション**（🔵🟡）
  - `src/types/index.ts`: `Volume.lastOpenedPage?: number` を追加（optional）
  - `src/lib/constants.ts`: `DB_VERSION = 2`
  - `src/lib/db.ts`: `upgrade` に `if (oldVersion < 2) { /* 既存レコード更新不要（optional フィールド） */ }` を追加
  - `src/lib/db.ts`: `updateVolumeLastOpenedPage(volumeId, pageNumber)` 関数追加
  - `src/lib/db.ts`: `savePage(volumeId, pageNumber, content)` 単一ページ保存関数追加（他ページに触れない）
  - `src/lib/db.ts`: `getLatestUpdatedPageNumber(volumeId)` ヘルパ追加（lastOpenedPage 未設定時のフォールバック用）
  - テスト: fake-indexeddb で v1 → v2 upgrade が既存データを破壊しないこと、savePage が他ページを破壊しないこと
  - 受入条件: 旧 v1 データが v2 で問題なく読み込め、savePage で単一ページのみ更新される

### Wave 2（Wave 1 完了後、並列）
- **T4.3 最小 EditorPage 新規作成**（🔵）
  - `src/features/editor/EditorPage.tsx`: 新規作成
  - 1ページ = 1 textarea。`useParams` で volumeId/pageNumber を取得
  - 起動時: `getPage(volumeId, pageNumber)` で既存内容をロード、無ければ空文字
  - onChange で local state 更新、`useAutoSave` 相当（後述 T4.4）で `savePage` を呼ぶ
  - ページ遷移は M5 で追加。M4 では URL を手入力して遷移できれば OK
  - ヘッダー: 本棚リンク（左）、ページX/50（中央）、設定リンク（右）。Aesthete 案の3要素配置
  - 本文エリアは `notebook-surface` クラス使用、罫線整合は M7 で微調整
  - 受入条件: `/book/:volumeId/:pageNumber` で指定ページの本文を表示・編集できる

- **T4.4 ページ単位 autosave**（🔵）
  - `src/features/editor/useEditorAutoSave.ts`: 新規作成（または既存 `useAutoSave` を拡張）
  - 2秒 debounce で `savePage(volumeId, pageNumber, text)` を呼ぶ
  - flush API を持つ（ページ遷移時に即保存するため、Skeptic H3 対策）
  - 保存後に `syncPendingPagesBackground` を fire-and-forget
  - テスト: Vitest fake timers で debounce 挙動、flush 動作を検証
  - 受入条件: 入力 → 2秒後に savePage 発火、flush() 即時発火

- **T4.5 BookshelfPage のリンク先変更**（🔵🟡）
  - `src/features/bookshelf/VolumeCard.tsx`: `to={/read/${id}/1}` → `to={/book/${id}/${lastOpenedPage ?? latestUpdatedPage ?? 1}}`
  - `lastOpenedPage` が未設定の場合、`getLatestUpdatedPageNumber(volumeId)` で決定（BookshelfPage 側で事前取得・props で渡す）
  - テスト: Vitest で「lastOpenedPage が未設定のとき最終更新ページに遷移」
  - 受入条件: 冊カードをタップすると、その冊で最後に開いた（or 最終更新）ページが表示される

### Wave 3
- **T4.6 BookshelfPage の「書く」リンク削除 & 初回自動冊作成**（🔵）
  - `BookshelfPage.tsx`: `<Link to="/">書く</Link>` を削除
  - `SettingsPage.tsx`: `<Link to="/">書く</Link>` を `<Link to="/">本棚</Link>` に置換
  - `BookshelfPage.tsx`: `useEffect` で冊が0件なら `ensureActiveVolume` を呼ぶ
  - テスト: 冊0件状態で BookshelfPage をマウント → 1冊作成されることを確認
  - 受入条件: 初回起動時、自動で1冊作成され本棚に表示される

### M4 受入条件（統合）
- ルート `/` で本棚が表示される
- 冊タップで `/book/:id/:page` に遷移し、該当ページが表示・編集できる
- 入力は 2秒 debounce で自動保存される
- 旧 `/read/:id/:page` URL はリダイレクトで動作する
- 初回起動で自動的に1冊作成される
- WritePage / ReaderPage は `/write` `/read` で動作継続（M7 で削除）

### M4 リスクと緩和（Skeptic）
- C1（他ページ破壊）: `savePage` で単一ページ put のみ、`saveVolumeText` は呼ばない
- H3（debounce中の遷移でデータロス）: `flush` API を実装、M5 のページ遷移タスクで利用
- H1（DB ダウングレード）: 今回は単純な optional フィールド追加のみ、v2 → v1 ダウングレードは考慮外とする（ドキュメントに注記）

---

## M5: ページめくり UI とページ単位保存

**垂直スライス**: ユーザーは左右スワイプ/ボタンでページをめくり、自然に連続して書ける。

### Wave 1（並列）
- **T5.1 ページ遷移 UI（ボタン）**（🔵）
  - `EditorPage.tsx` にヘッダー下 or 画面端に左右ボタン（モノクロ、opacity 0.3）
  - ボタンタップで `navigate('/book/:id/:page±1')`
  - 境界制御: pageNumber=1 で「前へ」無効、最終ページで「次へ」の挙動は M6 で確定（新規ページ作成 or ロック）
  - 遷移前に `autoSave.flush()` を呼ぶ（Skeptic H3）
  - 遷移前に `updateVolumeLastOpenedPage(volumeId, newPage)` を呼ぶ
  - テスト: ボタンクリックで flush → navigate → lastOpenedPage 更新の順序
  - 受入条件: ボタンで隣接ページに遷移でき、データが失われない

- **T5.2 180ms フェードトランジション**（🔵🟡）
  - ReaderPage の `fading` ステート機構を EditorPage に移植
  - pageNumber 変更を検知して 180ms fade out → load → fade in
  - `src/styles/global.css`: `--transition-page: opacity 180ms ease` を追加（要: 既存 `--transition-soft: 200ms` との差分を確認）
  - **決定事項**: 要件 180ms を優先。既存200msとは別の CSS 変数として共存させる（Aesthete の懸念は variable 分離で解決）
  - 受入条件: ページ遷移時に 180ms の opacity フェードが走る

- **T5.3 左右スワイプ対応（textarea 競合回避）**（🟡）
  - `EditorPage` の root 要素で touchstart/touchend を捕捉
  - 判定領域: **textarea 以外のヘッダー下余白・ページ番号周辺のみ**でスワイプ反応（Skeptic H4 A案）
  - 閾値: `SWIPE_THRESHOLD_PX = 50`（既存定数）
  - もしくは**横方向移動 > 縦方向移動 × 2** の時のみ水平スワイプと判定し、textarea 上でも反応する実装も検討。実機検証で切替。
  - **暫定決定**: まず領域限定で実装。実機検証後に調整。
  - 受入条件: 日常的な textarea 編集操作（カーソル移動・選択）を邪魔せずに、左右スワイプでページめくりできる

### Wave 2
- **T5.4 カーソル復元のページ単位化**（🟡）
  - `src/hooks/useCursorRestore.ts`: キーを `note-cursor-position:${volumeId}:${pageNumber}` にスコープ化（Skeptic M5）
  - もしくは EditorPage 内で完結させる（`useParams` 依存）
  - テスト: 異なる volumeId/pageNumber 間でカーソル位置が干渉しないこと
  - 受入条件: ページ A のカーソル位置が、ページ B を開いても漏れない

- **T5.5 PageUp/PageDown キーでの遷移**（🟡）
  - textarea onKeyDown で PageUp/PageDown をキャッチ → preventDefault → 隣接ページへ遷移
  - テスト: キーイベント発火で navigate が呼ばれる
  - 受入条件: PageUp で前ページ、PageDown で次ページに遷移する

### M5 受入条件（統合）
- 左右ボタンでページ移動できる
- 左右スワイプでページ移動できる（textarea 編集を妨げない）
- ページ遷移時に 180ms フェード
- ページ遷移時に即保存される
- 遷移先でカーソルが適切に復元される
- 遷移のたびに `lastOpenedPage` が更新される

### M5 リスクと緩和
- H3 debounce: flush 実装で対応
- H4 textarea 競合: 領域限定スワイプ、実機調整余地あり
- M5（カーソルキー）: volumeId/pageNumber スコープで対応
- 要件180ms vs 既存200ms のトランジション時間: CSS 変数を分離し、読み返しは `--transition-soft`, 編集ページは `--transition-page` とする

---

## M6: 30行境界・50ページロック・新冊作成

**垂直スライス**: ユーザーは30行書くと自動で次ページに遷移、50ページで冊終了、本棚から新冊作成できる。

### Wave 1（並列）
- **T6.1 `splitAtLine30` 純関数追加**（🔵）
  - `src/lib/pagination.ts`: `splitAtLine30(text: string): { keep: string; overflow: string }` 追加
  - `keep` = 最初の30行（`\n` 結合）、`overflow` = 31行目以降（空なら空文字）
  - 境界: `text.split('\n').length <= 30` なら overflow は空文字
  - テスト: `pagination.test.ts` に境界値テスト追加（29行/30行/31行/45行）
  - 受入条件: 任意のテキストで round-trip（keep + '\n' + overflow が元テキスト、overflow 非空時のみ）を満たす

- **T6.2 IME (composition) ガード**（🔵）
  - `EditorPage.tsx`: `onCompositionStart/End` で `isComposingRef` を管理
  - onChange 時、`isComposingRef.current === true` なら splitAtLine30 判定をスキップ
  - composition 終了時に再度判定を走らせる
  - テスト: composition 中の変更では遷移しないこと
  - 受入条件: 日本語入力変換中にページ遷移が発動しない

### Wave 2
- **T6.3 30行到達時の自動次ページ遷移**（🔵）
  - `EditorPage.tsx`: onChange → splitAtLine30 → overflow が非空なら:
    1. 現ページを `keep` で即時 `savePage` （flush 相当）
    2. 次ページ (pageNumber+1) が存在するか確認、無ければ新規 Page 作成
    3. 次ページ content を `overflow + (existing content を overflow の後に結合)` に更新し `savePage`
    4. `navigate('/book/:id/:nextPage')`
    5. 遷移後、textarea をフォーカスし、カーソルを `overflow.length` 位置に置く
  - **カーソル位置仕様**: 次ページ先頭から overflow の末尾 = `overflow.length`（Skeptic H5 準拠）
  - 最終ページ(50)での発動は T6.4 でロック
  - テスト: 30行超過 → 次ページ内容に overflow が prepend されること、カーソル位置確認
  - 受入条件: 30行目末尾で改行すると、31行目の内容が次ページ先頭に移動し、カーソルも次ページに移る

- **T6.4 50ページ目末尾ロック**（🔵）
  - `EditorPage.tsx`: pageNumber === 50 の場合、onBeforeInput で splitAtLine30 の結果を先読みし、overflow が発生するならその入力をキャンセル（preventDefault）
  - トースト等の通知は出さない（合意済み）
  - テスト: 50ページ目で30行目末尾に改行しようとしても text が変わらないこと
  - 受入条件: 50ページ目30行目末尾で入力がブロックされ、他のページには影響しない

### Wave 3
- **T6.5 本棚に「新しい冊」ボタン追加**（🔵🟡）
  - `BookshelfPage.tsx`: `.grid` の末尾に **破線境界の「＋ 新しい冊」カード**（Aesthete 案）を追加
  - タップで `window.confirm` ダイアログ: 「現在の冊は X / 50 ページです。新しい冊を作りますか？」
  - Yes なら `rotateVolume(activeVolumeId)` を呼び、新冊作成後に本棚を再読み込み
  - 冊が0のときはこのカードを非表示（自動作成が走るため）
  - テスト: ボタンタップ → confirm → rotateVolume が呼ばれること（confirm は mock）
  - 受入条件: 本棚の新冊カードをタップし確認後、新冊が作成され本棚に追加表示される

- **T6.6 WritePage の「新しいノート」ボタン削除**（🔵）
  - `src/features/write/WritePage.tsx`: `handleRotate` と関連 UI を削除
  - WritePage は M7 で完全削除予定、M6 ではボタンのみ先に除去（M4 で `/write` に退避済み）
  - 受入条件: `/write` 画面にもう新冊作成ボタンが存在しない

### M6 受入条件（統合）
- 30行目末尾での改行で、超過分が次ページ先頭に持ち越される
- IME 入力変換中は自動遷移しない
- 50ページ目30行目末尾では入力できない
- 本棚からのみ新冊作成可能、確認ダイアログで現在X/50ページ表示
- 編集画面からの新冊作成UIは存在しない

### M6 リスクと緩和
- C2 IME: compositionStart/End ガードで対応
- C3 ロック挙動: onBeforeInput で先読みキャンセル、準備段階で仕様を明文化
- H5 カーソル位置: `overflow.length` に固定、仕様として明文化
- ロジックが純関数 `splitAtLine30` に寄せられているため Vitest で網羅テスト可能

---

## M7: ヘッダー整合・日付アイコン・旧画面削除

**垂直スライス**: ユーザーに見える UI が完全に整い、旧画面の残骸がなくなる。

### Wave 1（並列）
- **T7.1 `--header-height` CSS 変数追加**（🔵）
  - `src/styles/global.css`: `--header-height: calc(2 * var(--line-height-px))` （= 57.6px）
  - `src/lib/constants.ts`: `HEADER_HEIGHT_PX = 2 * LINE_HEIGHT_PX`（JS 側でも参照可能に）
  - 受入条件: CSS 変数が解決される

- **T7.2 EditorPage 本文と罫線の整合**（🔵🟡）
  - `EditorPage.module.css`: 
    - textarea `padding-top: var(--header-height)`
    - `background-position: 0 0`（現状維持）だと罫線がヘッダー領域にも描画され重なる
    - 解決策: textarea の padding-top をつけ、罫線の background-position は同値で OK（テキストと罫線が一緒に下にずれる）
  - safe-area-inset-top のある端末では `padding-top: calc(var(--header-height) + env(safe-area-inset-top))` と `background-position: 0 env(safe-area-inset-top)` のペアで整合（Skeptic M4）
  - ヘッダーは fixed、z-index > 本文、背景色で本文の上半分を隠す
  - テスト: 目視（実機での確認が最終判断）、Vitest では computed style の確認のみ
  - 受入条件: ヘッダーと本文1行目が重ならず、罫線が本文のベースラインに合っている

- **T7.3 日付アイコン SVG コンポーネント**（🔵🟡）
  - `src/features/editor/DateIcon.tsx`: モノクロ SVG 16x16、stroke 1.5、currentColor
  - Aesthete 提案のパス:
    ```
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1"/>
      <line x1="2.5" y1="6.5" x2="13.5" y2="6.5"/>
      <line x1="5.5" y1="2" x2="5.5" y2="5"/>
      <line x1="10.5" y1="2" x2="10.5" y2="5"/>
    </svg>
    ```
  - 呼び出し側: `<button aria-label="今日の日付を挿入" onClick={insertDate}><DateIcon /></button>`
  - ボタンの hit area は 44x44 確保（Skeptic M3）
  - 受入条件: ヘッダー右端にモノクロの日付アイコンが表示される

### Wave 2
- **T7.4 `insertDate` を EditorPage へ移植**（🔵）
  - WritePage 既存の `formatToday()` と `insertDate` ロジックを EditorPage に移植
  - ただしカーソル位置の text 長が変動するため、splitAtLine30 との協調を確認（日付挿入で30行を超える場合は T6.3 の自動遷移を発動）
  - 最下部丸ボタン (`styles.dateButton`) は削除（ヘッダー格上げのため）
  - テスト: 挿入後のカーソル位置確認、30行境界の超過動作確認
  - 受入条件: ヘッダー右の日付アイコンをタップすると、カーソル位置に「YYYY年M月D日(曜)\n」が挿入される

- **T7.5 WritePage / ReaderPage 削除**（🔵🟡）
  - `src/App.tsx`: `/write` と `/read/:id/:page` のルートを削除（redirect は残す）
  - `src/features/write/` ディレクトリ削除
  - `src/features/reader/` ディレクトリ削除（もしくは ReaderPage 機能を EditorPage に統合済みか確認）
  - **判断**: ReaderPage は EditorPage に統合済み（本プラン採用）なので削除。読み取り専用モードが必要になった場合は別途対応
  - 不要になった hooks（`useWrite`）、import も一掃
  - 受入条件: `src/features/write` `src/features/reader` が存在しない、TypeScript ビルドが通る、Vitest 全パス

- **T7.6 ヘッダー視覚統一**（🟡）
  - `EditorPage` `BookshelfPage` `SettingsPage` のヘッダー要素を全て opacity 0.3/active 0.6 に統一
  - 「本棚」「設定」等のリンクテキストとアイコンのベースライン揃え
  - フォントサイズ 0.75rem で統一（WritePage 既存値）
  - 受入条件: 全ページでヘッダー UI の見え方が一貫している

### Wave 3
- **T7.7 リグレッションテスト一式**（🔵）
  - 既存 Vitest スイートを全実行、全パスすること
  - 追加テストケース:
    - DB v2 マイグレーション（fake-indexeddb で v1 データを作成 → v2 オープン）
    - savePage の単一ページ保証
    - splitAtLine30 の境界値
    - updateVolumeLastOpenedPage の書き込み・読み出し
    - Navigate redirect のパス解決
  - 受入条件: `npm run test` が全パス、`npm run build` が成功する

### M7 受入条件（統合）
- ヘッダーと本文1行目が重ならない
- 罫線が本文のベースラインに整合する
- 日付アイコンがヘッダー右端に表示される
- 最下部の丸ボタン日付 UI が存在しない
- `src/features/write` `src/features/reader` が削除されている
- 全テストがパス、ビルドが成功する

### M7 リスクと緩和
- 罫線整合は CSS 変数の単一情報源化と実機検証
- 旧画面削除時の import 漏れは TypeScript が検出
- safe-area-inset は iOS 実機での目視確認が最終判断

---

## 全体: 受入条件サマリ

| 要件 | 確信度 | 対応マイルストーン |
|---|---|---|
| ルート `/` = 本棚 | 🔵 | M4 T4.1 |
| 冊タップで編集へ | 🔵 | M4 T4.5 |
| 1ページ=1 textarea | 🔵 | M4 T4.3 |
| 左右スワイプ/ボタン | 🔵 | M5 T5.1 T5.3 |
| 180ms フェード | 🔵 | M5 T5.2 |
| 最後に開いたページを記憶 | 🔵 | M4 T4.2 T4.5、M5 T5.1 |
| 30行持ち越し | 🔵 | M6 T6.1 T6.3 |
| 30行満杯で自動次ページ | 🔵 | M6 T6.3 |
| 50ページロック | 🔵 | M6 T6.4 |
| 新冊本棚のみ・確認付き | 🔵 | M6 T6.5 |
| 初回自動冊作成 | 🔵 | M4 T4.6 |
| ヘッダー日付アイコン | 🔵 | M7 T7.3 T7.4 |
| 最下部丸ボタン削除 | 🔵 | M7 T7.4 |
| ヘッダー重なり解消 | 🔵 | M7 T7.2 |
| 既存データ保持 | 🔵 | M4 T4.2 (DB v2)、回帰テスト全般 |
| PageUp/Down 対応 | 🟡 | M5 T5.5 |
| /read → /book redirect | 🟡 | M4 T4.1 |
| IME ガード | 🔵 | M6 T6.2 |
| autosave 2秒 debounce 維持 | 🔵 | M4 T4.4 |

## 全体リスクとテスト方針

### 最優先回帰テスト（Skeptic C1 対応）
1. **既存30ページ冊の部分編集**: fake-indexeddb で 30 ページ持つ冊を作成 → EditorPage で3ページ目を編集・保存 → 1,2,4〜30ページが無傷であることを確認
2. **冊ローテーション**: 本棚から新冊作成 → 旧冊が `completed`、新冊が `active`、旧冊の全ページが保持
3. **IME ガード**: compositionStart → onChange（overflow発生パターン）→ compositionEnd で遷移が発動、compositionStart → onChange → compositionEnd 無しでは発動しないこと
4. **50ページロック**: pageNumber=50 で overflow を発生させる入力が弾かれる

### 実機確認必須項目
- iOS Safari PWA でのヘッダーと safe-area-inset
- 日本語 IME でのページ境界近傍の入力
- 左右スワイプと textarea 選択操作の競合度
- 罫線と本文ベースラインの整合

## スコープ外（やらないこと）

- 3Dめくりアニメ・紙質感アニメ（合意済み非目標）
- マルチユーザー、共有、検索機能
- 冊ごとテーマ色カスタム
- 朝いち自動日付プレビュー、スラッシュコマンド
- 読み取り専用モードの分離 UI（EditorPage で統合）
- v2 → v1 DB ダウングレード対応（将来課題として注記）
- 余白縮小（冊終わり）による視覚強化（既存注記のまま保留）

## 未解決事項（要ユーザー判断）

1. **トランジション時間 180ms vs 200ms**: 要件は180ms、既存は200ms。
   - 推奨: `--transition-page: 180ms`（編集ページ）と `--transition-soft: 200ms`（既存UI）を別変数として併存
   - もしくは要件を 200ms に緩和して統一
2. **スワイプの競合解決方式**:
   - A) 領域限定スワイプ（ヘッダー下余白のみ）
   - B) 横移動 > 縦移動×2 判定で textarea 上でも反応
   - C) ボタン主、スワイプ見送り
   - 推奨: まず A で実装、実機検証後に B or C に調整
3. **50ページロック時の視覚フィードバック**:
   - トースト無しは合意済みだが、何らかの示唆（キャレット点滅停止・ページ番号の色変化）を入れるか？
   - 推奨: 無し（静けさ原則）
4. **新冊作成カードの見た目**:
   - A) 破線境界の空カード（Aesthete 推奨）
   - B) ヘッダー右の控えめなアイコンボタン
   - 推奨: A（誤タップが起きにくく、本棚の視覚連続性が保てる）

---

## Plan Check（自己レビュー）

### 1. 完全性 — 全受入条件に対応するタスクが存在するか
- [x] ユーザー依頼5点 → 全て M4〜M7 のタスクにマッピング済み
- [x] 機能要件 🔵🟡 → 上記サマリ表で全網羅
- [x] 非機能要件（autosave 2秒、PWA、lint）→ M4 T4.4、回帰テスト、既存ビルド設定を踏襲

### 2. 実行可能性 — 各タスクの変更対象ファイル・関数が具体的か
- [x] 全タスクに変更対象ファイルを明記
- [x] 関数名・CSS変数名・テスト対象まで特定
- [x] 曖昧な「〇〇を修正」なし

### 3. 依存整合性 — タスク間の前後関係に矛盾がないか
- [x] M4 の T4.2 (DB拡張) が T4.5 (リンク先変更) より前
- [x] M5 T5.1 (ページ遷移) が T5.4 (カーソル復元) より前
- [x] M6 T6.1 (splitAtLine30) が T6.3 (自動遷移) より前
- [x] M7 T7.1 (CSS変数) が T7.2 (整合) より前
- [x] M7 T7.5 (旧画面削除) は全機能移植完了後の最終段

### 4. リスク対応 — Skeptic Critical 指摘に対策タスクがあるか
- [x] C1 他ページ破壊 → T4.2 で `savePage` 追加、全タスクで `saveVolumeText` 非使用
- [x] C2 IME 自動遷移 → T6.2 で compositionガード
- [x] C3 ロック挙動 → T6.4 で onBeforeInput 先読みキャンセル
- [x] C4 lastOpenedPage フォールバック → T4.2 `getLatestUpdatedPageNumber`、T4.5 で活用

### 5. テスト方針 — 各タスクにテスト方針が記述されているか
- [x] 全タスクに Vitest テスト or 目視確認事項を記述
- [x] 回帰テスト一式を T7.7 で一括実行

### 6. スコープ逸脱 — 合意済みスコープ外のタスクが紛れていないか
- [x] 「スコープ外」に整理、見送り項目を明記

チェック結果: 全項目パス（1周目）。未解決事項4点はユーザー判断に委ねる。

---

## 実装着手時の指針

- **M4 → M5 → M6 → M7 の順で実行**。各マイルストーン完了時点で動作確認（テスト + 目視）を挟む
- 並列実行可能タスクは Wave 単位で同時着手してよい（自律モード時）
- Critical リスク対策は該当マイルストーンの受入条件に明示し、テストコードで担保
- 実機確認が必要な項目（iOS Safari、日本語IME、スワイプ競合）は M7 完了後にまとめて実施し、必要なら微調整タスクを追加
