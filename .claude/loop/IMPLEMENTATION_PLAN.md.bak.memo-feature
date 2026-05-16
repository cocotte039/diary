# 実装計画 — 1ページ文字数上限の撤廃 + 25行強調罫線

## 概要

EditorPage の 1 ページあたり 1200 字制限（自動次ページ遷移 + 最終ページロック）を撤廃し、ユーザー任意タイミングのページ送りに一本化する。併せて 25 行ごとに罫線をごくわずかに濃くしてボリューム感を静かに表現する。

詳細は `.whiteboard/plan.md` を参照。

## 背景

スマホ表示では端末幅により最終行が中途半端な位置で次ページに送られる UX 問題があった。ユーザーは任意のタイミングでページ送りできる方が書きやすいと判断。

## マイルストーン

### M1: 1ページ文字数上限撤廃 + 25行強調罫線

| タスク | 内容 | 仕様ファイル | Wave |
|---|---|---|---|
| M1-T1 | 旧仕様テスト削除 | `specs/m1-t1.md` | 1 |
| M1-T2 | 新仕様テスト追加（RED） | `specs/m1-t2.md` | 2 |
| M1-T3 | EditorPage 自動遷移/ロック削除（GREEN） | `specs/m1-t3.md` | 3 |
| M1-T4 | splitAtCharLimit 削除 + コメント整理 | `specs/m1-t4.md` | 4 |
| M1-T5 | 25 行強調罫線 CSS 追加 | `specs/m1-t5.md` | 4 |
| M1-T6 | typecheck + test:run 全緑確認 | `specs/m1-t6.md` | 5 |
| M1-T7 | 配線検証 + Verify チェックリスト | `specs/m1-t7.md` | 6 |

**検証**: `npm run typecheck && npm run test:run && npm run build`

## 変更対象ファイル

- `src/features/editor/EditorPage.tsx`（自動遷移・最終ページロック・pendingCursorPosRef 削除）
- `src/features/editor/EditorPage.test.tsx`（旧テスト削除 + 新テスト追加）
- `src/lib/pagination.ts`（`splitAtCharLimit` 削除）
- `src/lib/pagination.test.ts`（`splitAtCharLimit` 系テスト削除）
- `src/types/index.ts`（L34 コメント修正）
- `src/lib/db.ts`（L213 コメント補足）
- `src/styles/notebook.css`（25 行強調罫線レイヤー追加）

## 実装フロー（TDD）

1. M1-T1: 旧仕様テスト（自動遷移・最終ページロック系）を削除
2. M1-T2: 新仕様テスト 5 件を追加し RED を確認
3. M1-T3: EditorPage の自動遷移・最終ページロックを撤廃（GREEN）
4. M1-T4 + M1-T5: dead code 削除と CSS 追加（並列可）
5. M1-T6: typecheck + test:run + build で全緑確認
6. M1-T7: grep による配線検証 + Verify チェックリスト（実機は手動）

## 非目標（やらないこと）

- 既存冊の再ページング機能
- 明示的ページ区切り記号方式
- contenteditable 移行
- 進捗バー 100% 到達時の視覚変化追加
- `CHARS_PER_PAGE` 定数の削除
- `saveVolumeText` の仕様変更
