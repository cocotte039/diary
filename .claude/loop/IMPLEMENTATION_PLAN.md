# 実装計画 — ページ単位の文字数基準化 / スクロール構造改善 / プログレスバー

## 概要

- ページ単位を「論理行60」から「文字数1200」へ
- 1冊を50→60ページ（B5大学ノート30枚相当）
- ヘッダー固定、ページ領域を外側スクロール
- ページ残量のモノクロ10分割プログレスバー

## マイルストーン

### M1. 定数と pagination.ts を文字数基準へ
- T1.1 constants.ts: CHARS_PER_PAGE=1200 / LINES_PER_PAPER=60 / PAGES_PER_VOLUME=60 / LINES_PER_PAGE 削除
- T1.2 pagination.ts: splitAtLine30→splitAtCharLimit、countPages 文字数基準、関連関数の grep 確認
- T1.3 pagination.test.ts 書き換え
- T1.4 constants.test.ts / db.test.ts 書き換え
- 検証: `npm run test -- src/lib/pagination.test.ts src/lib/constants.test.ts src/lib/db.test.ts`

### M2. EditorPage ロジックを文字数基準へ
- T2.1 import 更新・LINES_PER_PAGE 参照削除
- T2.2 checkOverflowAndNavigate を splitAtCharLimit のみに
- T2.3 handleBeforeInput を nextValue.length > CHARS_PER_PAGE に
- T2.4 ensurePaperHeight 撤去 + textarea 高さ useLayoutEffect 追従
- T2.5 EditorPage.test.tsx 書き換え（視覚行ケース削除）
- 検証: `npm run test -- src/features/editor/EditorPage.test.tsx && npm run build`

### M3. スクロール構造を外側スクロールへ
- T3.1 EditorPage.module.css: .surface overflow-y:auto / .textarea overflow:visible, height:auto, min-height:var(--page-height-px)
- T3.2 useEditorCursor の scrollTop 宛先を .surface へ（必要なら）
- T3.3 罫線・min-height 動作確認
- 検証: `npm run test && npm run build`

### M4. プログレスバー追加
- T4.1 EditorPage.tsx: ヘッダー直下に progressbar 要素、role/aria 属性、width=text.length/CHARS_PER_PAGE
- T4.2 .progress (高さ3px, トラック+10分割 tick) / .progressFill (opacity 0.5, transition 120ms)
- T4.3 a11y / aria-valuenow テスト追加（0/600/1200/1300 ケース）
- 検証: `npm run test -- src/features/editor/EditorPage.test.tsx && npm run build`

### M5. 仕上げ・整合確認
- T5.1 grep 残留ゼロ化（LINES_PER_PAGE / splitAtLine30 / LINES_PER_VOLUME）
- T5.2 JSDoc / CSS 変数コメント更新
- T5.3 lint / build / test 全緑
- 検証: `npm run lint && npm run build && npm run test`

## 非目標
- 紙幅固定
- 既存冊コンテンツの再ページング
- プログレスバーの色変化・数値表示・アニメーション
