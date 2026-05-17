# 実装計画 — 時系列メモ機能（観測ログ）

## 概要

日記とは別管理の「観測ログ」機能を追加。1メモ＝「本文＋自動時刻のみ」。本棚右下FAB→メモ入力専用画面で低摩擦に記録、ヘッダータブ（本棚/メモ）でメモ一覧へ切替、日付グルーピング時系列表示、長押し削除、GitHub日付別ファイルバックアップ、JSONエクスポート内包。設計原則「静けさ」厳守。

詳細・確信度・エッジケース表（E1-E20）・ユーザー判断事項（U1-U4）は `.whiteboard/plan.md` を単一情報源として参照。

## 背景

試行に対する観測を、いつ何に触れたか後から振り返れる形で、作成摩擦を最小化して記録したいというユーザー要望。日記（罫線ノート・冊/ページ）とはデータストア単位で完全分離。

## マイルストーン

### M1: データ基盤（Memo型・DB v3・CRUD）

| タスク | 内容 | 仕様 | Wave |
|---|---|---|---|
| M1-T1 | Memo型 / ExportPayload.memos / 定数(DB_VERSION=3, EXPORT_FORMAT_VERSION=2) | `specs/m1-t1.md` | 1 |
| M1-T2 | DBSchema memos + upgrade追加分岐 + dateKey export（TDD） | `specs/m1-t2.md` | 2 |
| M1-T3 | memo CRUD + memos-deleted-days + replaceAllData拡張（TDD） | `specs/m1-t3.md` | 3 |

**検証**: `npm run lint && npm run test:run`

### M2: メモを書ける（FAB→入力画面・暗黙保存）

| タスク | 内容 | 仕様 | Wave |
|---|---|---|---|
| M2-T1 | App.tsx に /log/new・/log/:memoId ルート | `specs/m2-t1.md` | 1 |
| M2-T2 | useMemoAutoSave（TDD） | `specs/m2-t2.md` | 2 |
| M2-T3 | MemoEditorPage 新規/編集兼用（TDD） | `specs/m2-t3.md` | 3 |
| M2-T4 | Fab.tsx + BookshelfPage 配置 + padding-bottom | `specs/m2-t4.md` | 4 |

**検証**: `npm run lint && npm run test:run`

### M3: メモを振り返れる・消せる（タブ・一覧・長押し削除）

| タスク | 内容 | 仕様 | Wave |
|---|---|---|---|
| M3-T1 | HeaderTabs + CSS + test | `specs/m3-t1.md` | 1 |
| M3-T2 | BookshelfPage h1→HeaderTabs置換（回帰更新） | `specs/m3-t2.md` | 2 |
| M3-T3 | App.tsx に /log=LogListPage ルート | `specs/m3-t3.md` | 2 |
| M3-T4 | LogListPage 日付グルーピング・空状態（TDD） | `specs/m3-t4.md` | 3 |
| M3-T5 | MemoListItem タップ編集・長押し削除（TDD） | `specs/m3-t5.md` | 4 |

**検証**: `npm run lint && npm run test:run`

### M4: メモをバックアップできる（JSON・GitHub日付別）

| タスク | 内容 | 仕様 | Wave |
|---|---|---|---|
| M4-T1 | buildExportPayload に memos（TDD） | `specs/m4-t1.md` | 1 |
| M4-T2 | buildMemoFileContent + putMemoFile + syncPendingMemos（TDD） | `specs/m4-t2.md` | 2 |
| M4-T3 | registerOnlineSync 拡張 + useMemoAutoSave 同期配線 | `specs/m4-t3.md` | 3 |
| M4-T4 | A12 削除日反映 空PUT（TDD） | `specs/m4-t4.md` | 4 |
| M4-T5 | github.test: BACKUP_PATH_RE非マッチ・memos非破壊 | `specs/m4-t5.md` | 5 |

**検証**: `npm run lint && npm run test:run && npm run build`

## 依存

M1 → M2 → M3 → M4（垂直スライス、各M内 Wave 順）。

## 非目標（やらないこと）

- タグ/タイトル/全文検索
- メモと日記の相互リンク・統合ビュー
- 新規 npm 依存
- JSON インポートUI新規実装（後方互換フォールバック方針のみ用意）
- importFromGitHub での memos 逆復元（U4 見送り、将来課題）
- メモ一覧の仮想スクロール/ページング
- github `putPage` の汎用リファクタ（コピーで十分）

## ユーザー判断事項（推奨案で進行・AGENTS.md記録）

- U1 GitHub全削除日反映: **空内容PUT**（採用）
- U2 GitHub置換復元時メモ: **保持**（replaceAllData memos省略時無触、採用）
- U3 空メモ: **初回非空入力で初めて addMemo**（採用）
- U4 memos逆復元: **本サイクル見送り**（採用、将来課題）

## ロールバック

マイルストーン単位コミット。DB_VERSION 3 は idb downgrade 不可のため戻さない（memos ストア残置は既存3ストアに無害）。UI層 M2-M4 の revert で機能無効化可能。revert は M4→M3→M2→M1 の逆順。
