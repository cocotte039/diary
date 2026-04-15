# 実装計画 — 仕様改善 5 件

## 概要

5 件の UX/バグ修正を統合で実装する。

1. **罫線均一化**: 15/30/45 行目の強調罫線を廃し、`--color-rule` 通常罫線のみに
2. **日付挿入時スクロール維持**: `EditorPage.insertDate` で surface の scrollTop を保存→復元
3. **本棚並び順修正**: `createdAt` 文字列順 → `ordinal` 降順 (`createdAt` tie-break) に
4. **新ノート作成 UI**: 末尾「＋」カード撤去、ヘッダーハンバーガーメニューから起動
5. **カレンダー UI**: 本棚下部の開閉ボタン撤去、ヘッダーメニューから全画面モーダル

共通: 本棚ヘッダー右端に `BookshelfMenu`（ハンバーガー + 右ドロップダウン）を新設し、「新しいノート / カレンダー / 設定」を集約。

## マイルストーン一覧

| ID | 名前 | Wave | 目的 |
|----|------|------|------|
| M1 | 罫線均一化 | 0 | `notebook.css` のレイヤー1 削除 |
| M2 | 日付挿入 scrollTop 保持 | 0 | `insertDate` で scrollTop を保存→復元 |
| M3 | 本棚並び順修正 | 0 | `ordinal` 降順 + createdAt tie-break |
| M4 | ヘッダーメニュー基盤 | 0 | `BookshelfMenu` コンポーネント新設 |
| M5 | 新ノート作成メニュー統合 | 1 (M4依存) | NewVolumeCard 撤去、メニュー結線 |
| M6 | カレンダーモーダル化 | 1 (M4依存) | fixed overlay モーダル + Esc 閉じ |
| M7 | 全体検証 + README 更新 | 2 (全完了後) | grep 確認・README 整合・全テスト |

## Wave 構成

- Wave 0: M1, M2, M3, M4（並列可）
- Wave 1: M5, M6（M4 完了後、並列可）
- Wave 2: M7（M1〜M6 完了後）

## 🟡 判断箇所（Build Agent 向け）

1. **J1 scrollTop テスト**: jsdom で `scrollTop = 200` 直接設定→assert で OK。ダメなら `data-testid="editor-surface"` 直取得
2. **J2 `.header button` CSS 削除**: BookshelfMenu 結線後は `.header button` 指定を削除（trigger と衝突防止）
3. **J3 モーダル fade-in**: 200ms opacity 0→1（静けさ準拠）
4. **J4 ハンバーガー opacity**: 0.5（発見性確保、既存リンク 0.3 より少し強め）
5. **J5 モーダル overlay 色**: `rgba(0, 0, 0, 0.6)`
6. **J6 BookshelfMenu 単体テスト**: 追加しない（BookshelfPage 統合テスト経由）
7. **J7 ソート tie-break**: `createdAt` をセカンダリキーに（データ異常時の保険）

## リスク

- jsdom の scrollTop 挙動: 不発時はテスト方針を見直し
- iOS Safari のモーダル `position: fixed` : `100dvh` 使用、内部 `overflow-y: auto`
- 既存テストの書き換え漏れ: grep で `NewVolumeCard` / `新しいノートを作る` の残留ゼロを確認

## ロールバック

- M1, M2, M3 は独立コミットで個別 revert 可
- M4〜M6 は連動（途中状態だと UI が壊れる）。問題時は 3 つ同時 revert

## 詳細

詳細設計は `.whiteboard/plan.md` を参照。

各タスクの spec は `.claude/loop/specs/m{N}-t{K}.md`。
