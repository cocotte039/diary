# Skeptic 分析 — 時系列メモ機能（観測ログ）

視点: リスク・エッジケース・回帰・マイグレーション・後方互換・同期競合・行動心理

## Critical リスク（要対策）

### C1. v2→v3 マイグレーションで既存 diary 破壊（Critical / 🔵）
既存 `getDB().upgrade(db, oldVersion)` は `contains` ガード方式。v2→v3 で `memos` を**追加のみ**する限り volumes/pages/meta は無影響。誤って `db.deleteObjectStore` や既存 store の index 再作成を書くと既存日記が消える。
- 緩和: upgrade に `if (!db.objectStoreNames.contains('memos')) {...}` の**追加分岐のみ**。既存3ストアのコードは一切触れない。`oldVersion < 3` 条件は不要（contains ガードで十分、既存 v1→v2 と同方針）。
- 検証テスト（🔵 必須）:
  1. v2 スキーマで volumes/pages/meta にデータ投入 → DB close → DB_VERSION 3 で再open → 既存3ストアのデータが全て無傷で読める
  2. 新規ユーザー（DB なし）→ v3 open → 4ストア全て生成・memos 空
  3. fake-indexeddb で DB_VERSION を一時的に古い値で開く再現が必要。`indexedDB.open(DB_NAME, 2)` で旧スキーマ構築→close→getDB() で v3 昇格、を db.test.ts に追加。

### C2. GitHub日単位同期の取りこぼし・競合（Critical / 🟡）
`memos/YYYY-MM-DD.md` をその日の全メモから再生成PUT する設計の競合点:
- shaCache は path→sha の**メモリMap**。同日ファイル再PUTで sha 更新は putPage と同じ 422→再取得→リトライで対応可。だが「ファイル本文生成」と「PUT」の間に新メモ追加/編集が入ると、その新メモが本文に含まれず synced 化されると**永久未同期 or 上書き消失**。
  - 緩和（🔵）: `markMemosSyncedByDay` は **PUT に含めた本文生成時点のメモ id 集合のみ** synced 化する（その日の pending を一括 synced にしない）。生成→PUT→「生成時に取得した memo の id 群だけ」markSynced。生成後に増えた pending は次回ループで再生成される。
- 1日のメモ全削除時の当日ファイル: 要件未定。
  - 🔴 ユーザー判断: (A) 空内容で `memos/YYYY-MM-DD.md` を PUT（履歴に空ファイル残る） / (B) GitHub上のファイルを delete / (C) 放置（GitHub に古い内容が残存＝バックアップ不整合）。**推奨 (A)**: octokit deleteFile は sha 必須・404処理増・既存 putPage 資産流用不可。空ファイル PUT が最小実装で「ローカル真実＝空」を反映。削除を pending として扱う仕組みが必要（下記 C6）。

### C3. 削除メモの同期反映漏れ（Critical / 🟡）
メモ削除 = `deleteMemo` で DB から消える。だが GitHub 上の `YYYY-MM-DD.md` には残る。`getPendingMemos` は存在するメモしか返さないため、削除されたメモの「日」が再PUTされず GitHub に古い内容が残る。
- 緩和（🔵 推奨）: メモ削除時、その日に**残る他メモがあればそのいずれかを pending 化**して当日ファイル再生成を誘発。その日のメモが全削除なら C2(A) の空ファイル PUT を誘発する「削除済み日」マーカーを meta に持つ、または削除直後に当日空PUTを試行（オフライン時は pending 扱い）。要件で「同日メモの追加/編集/削除時はその日のファイルを再生成して PUT」と明記されているので、削除も再生成トリガ。実装: deleteMemo 後、当日の残メモ1件を pending 化 / 全削除なら meta に `memos-deleted-days` Set を持ち syncPendingMemos がそれも処理。
- 🔴 ユーザー判断: 全削除日の GitHub 反映方式（空PUT vs ファイル削除 vs 放置）。**推奨: 空PUT**。

## Major リスク

### C4. 後方互換 — 旧 version=1 JSON インポート（Major / 🔵）
ExportPayload に memos 追加 + EXPORT_FORMAT_VERSION 1→2。旧 version=1 JSON には memos キーが無い。インポート処理（現状 importFromGitHub は GitHub tree 由来で JSON import UI は未実装＝SettingsPage には JSONエクスポートのみ、JSONインポートUIは無い）。
- 現状確認: SettingsPage に「JSONインポート」UI は**存在しない**（exportAllData のみ、復元は importFromGitHub＝GitHub経由）。よって「旧JSONインポート時 memos 空配列フォールバック」は**将来 JSON インポート実装時の要件**。本サイクルで JSON import UI を作らないなら、buildExportPayload に memos を足す + 型を `memos?: Memo[]` でなく `memos: Memo[]`（version=2 は常に存在）にし、将来パーサで `payload.memos ?? []` フォールバックする方針をコメントで明記。
- 緩和: ExportPayload.memos は必須 `Memo[]`、読み手側で `?? []`。export.test.ts の version 期待値を 2 に更新（既存テスト回帰）。

### C5. ExportPayload 型変更の波及（Major / 🔵）
`ExportPayload` に `memos: Memo[]` 追加 → `buildExportPayload`（要 memos 取得追加）、`replaceAllData`（importFromGitHub が `replaceAllData(volumes, pages)` 呼び出し → 引数追加で型エラー）。importFromGitHub は memos を復元しないため `replaceAllData(volumes, pages, [])` か、replaceAllData の memos 引数を optional にして memos 未指定時は **memos ストアを clear しない**（GitHubインポートで既存メモを消さない）。
- 🔴 ユーザー判断: GitHubインポート（importFromGitHub＝置換復元）時に既存ローカル memos を保持するか消すか。**推奨: 保持**（GitHubバックアップは volumes/pages と memos が別系統。volumes/pages の置換復元でメモが巻き添え消失するのは事故）。実装: `replaceAllData(volumes, pages, memos?)` で memos 未指定なら memos ストアに触れない。

### C6. 同期エッジケース（Major / 🟡）
- オフラインでメモ作成 → online 復帰: `registerOnlineSync` の online ハンドラが現状 `syncPendingPagesBackground` のみ。memo 用も呼ぶよう拡張必須（漏れると永久未同期）。
- `syncPendingPages` と `syncPendingMemos` の同時実行: shaCache は path 単位でキー衝突しない（volumes/... と memos/...）。Octokit インスタンスは別生成で独立。干渉低。ただし両方が `syncPendingMemosBackground`/`syncPendingPagesBackground` から fire-and-forget で並走しレート制限に当たる可能性 → backoff で吸収（既存と同等）。
- autosave debounce(2秒) 中の画面離脱（戻る/popstate/タブ切替）: EditorPage は popstate で flush。MemoEditorPage も同じ popstate ガード + 戻るリンク click 時 flush 必須。漏れると2秒以内に書いた最新メモ消失。
- StrictMode 二重マウント: EditorPage の `historyGuardInstalledRef` 同様のガードを MemoEditorPage にも。useMemoAutoSave の timer は unmount で解除（既存 useEditorAutoSave と同型）。

### C7. ルーティング/UIエッジケース（Major / 🟡）
- HashRouter `/log/:memoId` に存在しない memoId 直リンク → getMemo undefined。空 textarea で新規扱いになると**幽霊メモ生成**。緩和: getMemo undefined 時は `/log` へ replace リダイレクト（編集対象なし）。
- `/log/new` で何も書かず戻る → addMemo 未実行（Pragmatist の「初回入力時に addMemo」方針で空メモ生成回避）。🔵 これが空メモ問題の主対策。
- 削除後の最後の1件 / 空一覧: LogListPage で memos.length===0 → 空状態表示（BookshelfPage `.empty` 作法）。クラッシュしないこと。
- タブ状態とブラウザ戻る: EditorPage は popstate でダミー履歴 pop → `/` へ。MemoEditorPage で同方式採用時、戻り先は「新規=遷移元（本棚 or 一覧）、編集=一覧」。popstate ガードの replace 先を文脈で出し分ける必要（location.state で遷移元保持 or 編集/新規でハードコード）。EditorPage の popstate ガードは別コンポーネントなので衝突しない（各画面マウント時のみ有効）。
- 編集中に同メモが別経路で削除: 単一ユーザー端末なので実質発生しにくいが、編集画面で flush 時 updateMemo が「存在しない id」→ updateMemo が undefined を返すなら no-op（put で復活させない＝削除を尊重）。実装方針: updateMemo は get→無ければ何もしない。

## Minor リスク

### C8. 空メモ・空白のみメモ（Minor / 🔴 要件未確定）
観測ログは摩擦最小だが、空 or 空白のみメモの扱いが未定。
- 🔴 ユーザー判断。**推奨**: 「初回非空入力で addMemo、その後全消ししても保持（更新で空 content 可）」より、**flush 時 content.trim()==='' なら保存しない/既存なら削除**は破壊的で危険。安全側推奨: **trim 後空なら addMemo しない（新規）／既存メモを空にした場合は保持（ユーザーが意図的に消した可能性、削除は長押しで明示）**。空メモ一覧表示は本文プレビュー空行になる → 一覧で空メモは「（空のメモ）」薄字プレースホルダ表示。
- 一覧/GitHub生成時、content 空のメモも時刻見出しは出す（記録の事実は残す）か除外するか → 推奨: 残す（観測ログの「いつ触れたか」目的に合致）。

### C9. 既存テスト回帰（Minor / 🔵）
- `db.test.ts` の `wipeDB` は `indexedDB.deleteDatabase(DB_NAME)` で DB ごと削除 → memos も消える、問題なし。新規 memo テストは同 wipeDB 流用可。
- `export.test.ts`: `expect(payload.version).toBe(EXPORT_FORMAT_VERSION)` は定数参照なので 2 でも自動追従。ただし memos 配列存在の新規アサーション追加要。
- `github.test.ts`: 既存 BACKUP_PATH_RE `/^volumes\/.../`は `memos/...` にマッチしない（誤import回避）→ 確認テスト追加推奨。importFromGitHub の memos 非復元を明示テスト。
- `BACKUP_PATH_RE` は volumes 専用。memos/*.md は parseBackupPath で null になり tree 解析でスキップ＝既存挙動維持。

## テスト方針（エッジ網羅）
1. v2→v3 移行: 旧スキーマ投入→昇格→既存データ無傷（C1）
2. addMemo/updateMemo/deleteMemo/getAllMemos/getPendingMemos/markMemosSyncedByDay 単体
3. syncPendingMemos: 同日複数メモ→1ファイル時刻順生成、生成時点 id 集合のみ synced、生成後追加メモは pending 残存（C2）
4. 削除誘発の当日再生成 / 全削除→空PUT（C3, ユーザー確定後）
5. replaceAllData(volumes, pages) で memos 保持（C5）
6. buildExportPayload に memos / version=2（C4, C9）
7. /log/:memoId 不正 id → /log リダイレクト（C7）
8. /log/new 空のまま戻る → memos.length 増えない（C7/C8）
9. MemoEditorPage 戻る/popstate で flush（C6）
10. LogListPage 空状態・日付グルーピング・新しい順
11. BACKUP_PATH_RE が memos/ にマッチしない（C9）

## ユーザー判断必須事項（🔴 まとめ）
- U1: GitHub 全削除日の反映方式（推奨: 空ファイル PUT）
- U2: importFromGitHub（GitHub置換復元）で既存ローカル memos を保持するか（推奨: 保持＝replaceAllData memos 省略時 memos 無触）
- U3: 空/空白のみメモの扱い（推奨: 新規は非空入力で初めて addMemo、既存空編集は保持、一覧はプレースホルダ）
- U4: GitHubインポートで memos を復元するか（推奨: 本サイクル見送り、JSON経路で代替）
