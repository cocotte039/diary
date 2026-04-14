# 実装計画 (Implementation Plan) — UX Overhaul M4〜M7

前回までの M1-M3（初期リリース）は完了済み。本計画は UX 刷新フェーズ。
過去の計画は `IMPLEMENTATION_PLAN.md.bak` に退避済み。

## プロジェクト概要

- 目的: メイン画面を本棚に刷新、ページ単位の独立UIへ変更、ヘッダー整合と日付アイコンの改善
- 参照: `.whiteboard/plan.md`（詳細設計）、`.claude/loop/AGENTS.md`（プロジェクト規約）

## マイルストーン

### M4: ルート再編と最小EditorPage

- 状態: pending
- 完了条件: 本棚から冊を開き、新しい編集画面で日記を書ける。旧URLはリダイレクト互換。

#### タスク
- [ ] T4.1: ルーター変更とリダイレクト -- specs/m4-t1.md
- [ ] T4.2: Volume型拡張とDB v2マイグレーション -- specs/m4-t2.md
- [ ] T4.3: 最小EditorPage新規作成 -- specs/m4-t3.md
- [ ] T4.4: ページ単位autosave -- specs/m4-t4.md
- [ ] T4.5: BookshelfPageのリンク先変更 -- specs/m4-t5.md
- [ ] T4.6: 書くリンク削除と初回自動冊作成 -- specs/m4-t6.md

### M5: ページめくりUIとページ単位保存

- 状態: pending
- 完了条件: 左右ボタン/スワイプ/キーでページをめくり、180msフェードで連続編集できる。

#### タスク
- [ ] T5.1: ページ遷移UI(ボタン)とflush保存 -- specs/m5-t1.md
- [ ] T5.2: 180msフェードトランジション -- specs/m5-t2.md
- [ ] T5.3: 左右スワイプ対応(領域限定) -- specs/m5-t3.md
- [ ] T5.4: カーソル復元のページ単位化 -- specs/m5-t4.md
- [ ] T5.5: PageUp/PageDownキーでの遷移 -- specs/m5-t5.md

### M6: 30行境界・50ページロック・新冊作成

- 状態: pending
- 完了条件: 30行で自動遷移、IMEガード付き、50ページで入力ロック、新冊は本棚からのみ。

#### タスク
- [ ] T6.1: splitAtLine30純関数追加 -- specs/m6-t1.md
- [ ] T6.2: IME(composition)ガード -- specs/m6-t2.md
- [ ] T6.3: 30行到達時の自動次ページ遷移 -- specs/m6-t3.md
- [ ] T6.4: 50ページ目末尾ロック -- specs/m6-t4.md
- [ ] T6.5: 本棚に新しい冊ボタン追加 -- specs/m6-t5.md
- [ ] T6.6: WritePageの新しいノートボタン削除 -- specs/m6-t6.md

### M7: ヘッダー整合・日付アイコン・旧画面削除

- 状態: pending
- 完了条件: UIが整い、旧画面の残骸がなくなる。全テスト・ビルドが通る。

#### タスク
- [ ] T7.1: --header-height CSS変数追加 -- specs/m7-t1.md
- [ ] T7.2: EditorPage本文と罫線の整合 -- specs/m7-t2.md
- [ ] T7.3: 日付アイコンSVGコンポーネント -- specs/m7-t3.md
- [ ] T7.4: insertDateをEditorPageへ移植 -- specs/m7-t4.md
- [ ] T7.5: WritePage/ReaderPage削除 -- specs/m7-t5.md
- [ ] T7.6: ヘッダー視覚統一 -- specs/m7-t6.md
- [ ] T7.7: リグレッションテスト一式 -- specs/m7-t7.md

## 完了基準 (Definition of Done)

- [ ] 全タスクが実装済み
- [ ] 全テストがパス（`npm run test:run`）
- [ ] ビルドが成功（`npm run build`）
- [ ] README.md が最新の仕様と整合

## 進捗サマリー

| マイルストーン | 状態 | タスク完了 | 最終更新 |
|---|---|---|---|
| M4 | pending | 0/6 | 2026-04-14 |
| M5 | pending | 0/5 | 2026-04-14 |
| M6 | pending | 0/6 | 2026-04-14 |
| M7 | pending | 0/7 | 2026-04-14 |
