# 実装計画 — 観測ログ（メモ）機能 UX 改善

詳細は `.whiteboard/plan.md` を正とする。本ファイルは /build 互換のサマリ。

## 概要
PWA日記アプリ「ノート」の観測ログ（メモ）機能 UX を「静けさ」原則維持で改善。単一マイルストーン M1。

## M1: メモ機能 UX 改善

検証: `npx vitest run src/features/log/MemoEditorPage.test.tsx src/features/log/LogListPage.test.tsx src/features/bookshelf/BookshelfPage.test.tsx && npm run build`

- **T1**（wave1, CSS独立）FAB位置上昇: `BookshelfPage.module.css` `.fab` bottom → `max(3.5rem, calc(env(safe-area-inset-bottom) + 3rem))`
- **T3**（wave1, CSS独立）ゴシック化: `MemoEditorPage.module.css` `.textarea` / `LogListPage.module.css` `.preview` の明朝 → `var(--font-family-ui)`、罫線追加なし（非目標厳守）
- **T4**（wave1, CSS独立）一覧タップ背景HL: `LogListPage.module.css` `.row:active` opacity → `background-color: var(--color-accent)`、`.row` に transition 150ms
- **T2**（wave2）編集ページ自動フォーカス: `MemoEditorPage.tsx` textareaRef + ready後 focus({preventScroll}) + 編集時末尾カーソル
- **T5**（wave3, T2と同ファイル連続）右エッジスワイプ戻る: `MemoEditorPage.tsx` onTouchStart/End + goBack 共通化 + IMEガード
- **T6**（wave4）テスト更新: 旧「自動フォーカスなし」テスト書換（C1解消）+ フォーカス/スワイプテスト追加

## 非目標（厳守）
罫線追加 / EditorPage変更 / 保存・キャンセル明示UI / 新規色 / transition>200ms / バッジ
