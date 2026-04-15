# 実装計画 — EditorPage ヘッダー整理と戻るボタン動線修正

## 概要

日記を書く画面（EditorPage）について、2 件の仕様改善を実装する。

1. ヘッダー右端の「設定」リンクを削除（本棚ハンバーガーメニュー経由に一本化）
2. Android 端末の戻るボタンを押したら、前ページ履歴ではなく本棚 (`/`) に戻るようにする

詳細は `.whiteboard/plan.md` を参照。

## マイルストーン

### M1: ヘッダー整理と戻るボタン動線修正

| タスク | 内容 | 仕様ファイル | Wave |
|---|---|---|---|
| M1-T1 | 設定リンク削除 + テスト書換 | `specs/m1-t1.md` | 1 |
| M1-T2 | 戻るボタンガード実装 + 追加テスト（TDD） | `specs/m1-t2.md` | 2 |

**検証**: `npm run test:run && npm run lint`

## 変更対象ファイル

- `src/features/editor/EditorPage.tsx`
- `src/features/editor/EditorPage.test.tsx`
- `src/features/editor/EditorPage.module.css`（変更なしの想定）

## 実装フロー

1. M1-T1: 既存テスト書換 → 設定リンク削除 → テスト緑
2. M1-T2: 新テスト 4 件を先に書いて RED → 戻るボタンガード実装で GREEN
3. 全体検証: `npm run test:run && npm run lint`
4. 実機 QA（オプション、ユーザー側で実施）
