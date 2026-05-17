# 実装計画 — diary UX 改善（メモ手書き体/罫線・設定閉じる・本棚⇔メモ スワイプ）

単一情報源は `.whiteboard/plan.md`。本ファイルは /build 互換サマリ。

推奨実装順: M2 → M3 → M1 → M4（全 M 独立・個別 revert 可能）

## M2: メモ一覧本文を手書き体に（R2）
- T1: `LogListPage.module.css` の `.preview` と `.emptyMemo` から `font-family: var(--font-family-ui);` の行のみ削除（global body の Klee One 継承）。`.dateHeading`/`.time`/`.empty` は不変。
- 検証: `npx vitest run src/features/log/LogListPage.test.tsx`（回帰のみ）

## M3: 設定を「閉じる」で元画面へ（R3）
- T1: `BookshelfMenu.tsx` 設定 `<Link to="/settings">` に `state={{ from: '/' }}`
- T2: `MemoMenu.tsx` 設定 `<Link to="/settings">` に `state={{ from: '/log' }}`
- T3: `SettingsPage.tsx` に `useLocation` import、`from = state.from ?? '/'`、右上を `<Link to={from}>閉じる</Link>` 化。SettingsPage テストで to 検証
- 検証: `npx vitest run src/features/settings src/features/bookshelf/BookshelfPage.test.tsx src/features/log/LogListPage.test.tsx`

## M1: メモ編集を日記と同一体験に（R1）
- T1: `MemoEditorPage.tsx` textarea className を `notebook-surface notebook-textarea ${styles.textarea}` に。設計意図コメント更新
- T2: `MemoEditorPage.module.css` `.textarea` の font/padding/border 等を notebook へ委譲（減算）。`.surface` 不変。自由高さ維持
- T3: `MemoEditorPage.test.tsx` の notebook クラス不在テストを反転更新（削除でなく仕様変更に伴う検証反転）
- 検証: `npx vitest run src/features/log/MemoEditorPage.test.tsx` + full-suite 回帰
- 実機確認（受入の一部）: 罫線ベースライン/スクロール追従/空メモ/長文

## M4: 本棚⇔メモ一覧 親指スワイプ切替（R4）
- T1: 新規 `src/hooks/useSwipeNavigation.ts`（EditorPage 判定ロジックをコピー流用、EditorPage import しない）
- T2: `BookshelfPage.tsx` で `useSwipeNavigation({ onSwipeLeft: ()=>navigate('/log'), disabled: showCalendar })` を root に配線
- T3: `LogListPage.tsx` で `useSwipeNavigation({ onSwipeRight: ()=>navigate('/'), disabled: showCalendar })` を root に配線
- T4: hook 単体テスト + BookshelfPage/LogListPage の swipe テスト追加
- 検証: `npx vitest run src/hooks src/features/bookshelf/BookshelfPage.test.tsx src/features/log/LogListPage.test.tsx`

## 不可侵
EditorPage.tsx / notebook.css / global.css / 日記が使う既存 CSS 変数は1文字も変更しない。DB・データモデル・メモのページ概念は不変。新規色トークン禁止。テスト削除禁止（M1-T3 のみ仕様変更に伴う反転更新）。
