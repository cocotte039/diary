# Pragmatist 分析 — 時系列メモ機能（観測ログ）

視点: 実用性・最短経路・既存資産再利用・情報構造

## 1. 既存資産の再利用ポイント（最短経路）

| 既存資産 | 再利用先 | 確信度 |
|---|---|---|
| `db.ts` の idb `DiaryDB extends DBSchema` + `getDB()` upgrade パターン | `memos` ストア追加。`if (!db.objectStoreNames.contains('memos'))` ガード方式を踏襲 | 🔵 |
| `db.ts` CRUD パターン（`getDB()`→tx→put/get/delete、`nowIso()`/`uuid()`） | memo CRUD 関数群（addMemo 等）にそのまま流用 | 🔵 |
| `db.ts` `getPendingPages`/`markPageSynced`（by-syncStatus index） | `getPendingMemos` + 日単位 synced 化。memos に `by-syncStatus` index 追加 | 🔵 |
| `db.ts` `dateKey(iso)`（ローカル日付 YYYY-MM-DD、現在は module-private） | memo 日付グルーピング/GitHubファイル名に必須。**export 化して再利用** | 🔵 |
| `useEditorAutoSave.ts`（debounce + flush + lastSavedRef 冪等 + fire-and-forget sync） | `useMemoAutoSave` の雛形。pageNumber 概念を除去した版を新規作成（流用ではなく派生） | 🔵 |
| `github.ts` `b64encode`/`shaCache`/`createOctokit`/backoff リトライループ | `syncPendingMemos` で再利用。`putPage` を一般化せず memo 用 putファイルを新設 | 🔵 |
| `BookshelfMenu.tsx` の SVG アイコン作法（viewBox, stroke currentColor, strokeWidth 1.5） | FAB の鉛筆アイコン | 🔵 |
| `VolumeCard.tsx` の長押し作法（longPressTimerRef/longPressFiredRef/move tolerance/click guard/onContextMenu preventDefault） | メモ一覧アイテムの長押し削除に丸ごと流用 | 🔵 |
| `VolumeCard.tsx` `formatRange` のローカル日付整形 | 一覧の日付見出し YYYY/MM/DD | 🔵 |
| `EditorPage.tsx` の popstate ガード + flush パターン | メモ入力画面の戻る/Android戻るで未保存 flush | 🔵 |
| `.app-header` / `.app-header-link` CSS | タブ・戻る導線・FABの色/フォント基盤 | 🔵 |
| `export.ts` `buildExportPayload` + `exportAllData` | memos 追加。構造そのまま | 🔵 |
| `db.test.ts` の `wipeDB`/`_resetDBForTests`/beforeEach 作法 | memo テスト雛形 | 🔵 |

## 2. db.ts 追加関数シグネチャ案（🔵）

DBSchema 拡張:
```ts
memos: {
  key: string;
  value: Memo;
  indexes: {
    'by-createdAt': string;
    'by-syncStatus': SyncStatus;
  };
};
```

upgrade コールバックに追加（既存 contains ガード方式と同型）:
```ts
if (!db.objectStoreNames.contains('memos')) {
  const ms = db.createObjectStore('memos', { keyPath: 'id' });
  ms.createIndex('by-createdAt', 'createdAt');
  ms.createIndex('by-syncStatus', 'syncStatus');
}
```
（`oldVersion < 3` 分岐は不要。contains ガードが v1/v2 既存ユーザー・新規双方を一律カバー。既存 v1→v2 と同方針）

関数群（Key Links = 本番呼び出し元）:
- `addMemo(content: string): Promise<Memo>` — Key Link: MemoEditorPage 新規初回保存（useMemoAutoSave 経由）
- `getMemo(id: string): Promise<Memo | undefined>` — Key Link: MemoEditorPage 編集ロード
- `getAllMemos(): Promise<Memo[]>` — Key Link: LogListPage、buildExportPayload
- `updateMemo(id: string, content: string): Promise<Memo | undefined>` — Key Link: MemoEditorPage 編集保存（useMemoAutoSave）
- `deleteMemo(id: string): Promise<void>` — Key Link: LogListPage 長押し削除
- `getPendingMemos(): Promise<Memo[]>` — Key Link: syncPendingMemos
- `markMemosSyncedByDay(dateKey: string): Promise<void>` — Key Link: syncPendingMemos（その日 PUT 成功後）
- `replaceAllData(volumes, pages, memos)` — 既存シグネチャに memos 追加（呼び出し元 importFromGitHub）
- `dateKey` を `export function dateKey` 化

addMemo/updateMemo は `syncStatus:'pending'`、`updatedAt=nowIso()`、addMemo は `createdAt=updatedAt`。

## 3. github.ts 日付別ファイル同期（🟡 推奨案で確定可）

新設 `syncPendingMemos(): Promise<{synced:number; failed:number}>`:
1. settings/online ガード（既存 syncPendingPages と同型）
2. `getPendingMemos()` → `dateKey(createdAt)` でユニーク日集合を作る
3. 各日について `getAllMemos()` から**その日の全メモ**を取得し createdAt 昇順ソート → 本文生成:
   `memos/YYYY-MM-DD.md` = 各メモ `## HH:MM:SS\n{content}\n` を時刻順連結
4. `putMemoFile(path, content)` = `putPage` の SHA 取得/422再取得/作成ロジックを memo 用に複製（汎用化はオーバーエンジニアリング、コピーが最短）
5. PUT 成功 → `markMemosSyncedByDay(dateKey)`（その日の全 memo を synced）
6. backoff リトライは syncPendingPages と同型

`syncPendingMemosBackground()` を fire-and-forget ヘルパとして用意し useMemoAutoSave から呼ぶ（既存 `syncPendingPagesBackground` と同型）。`registerOnlineSync` は memo も発火するよう拡張（online ハンドラで両方呼ぶ）。

importFromGitHub の memos 復元: **本サイクルでは見送り推奨（🟡）**。理由=既存 importFromGitHub は volumes/pages tree 解析専用。memos/*.md は `## HH:MM:SS` パース＋createdAt 復元（時刻はあるが「年月日」はファイル名から、秒の重複可）で逆変換に曖昧性。JSONエクスポート/インポートで memos バックアップ経路は確保されるため、GitHubインポートの memos 対応は将来課題に回すのが ROI 妥当。**ただしユーザー判断事項**（Skeptic と一致）。

## 4. タブ UI コンポーネント（🟡）

`src/features/shared/HeaderTabs.tsx`（新規、最小）:
- `react-router-dom` の `useLocation` で現在パス判定（`/` 始まりは本棚、`/log` 始まりはメモ）
- `<Link to="/">本棚</Link>` `<Link to="/log">メモ</Link>` を `.app-header` 内左側に配置
- 選択中は opacity を上げる（非選択 0.3 / 選択中 0.7、`.app-header-link` 拡張）
- BookshelfPage の h1「本棚」を廃止し HeaderTabs に置換（Aesthete 判断と整合させる）
- LogListPage でも同じ HeaderTabs を使い一貫性確保

CSS: `src/features/shared/HeaderTabs.module.css`（新規）。命名規約 `*.module.css` 準拠。

## 5. メモ autosave（🔵 判断）

`useEditorAutoSave` は `(volumeId, pageNumber, text)` 前提で savePage に密結合 → **流用不可**。`src/features/log/useMemoAutoSave.ts` を新規（既存フックの構造を踏襲）:
- 引数 `(memoId: string | null, content: string)`
- memoId が null（新規未保存）かつ content 非空 → 初回 `addMemo` で id 採番し、以後 `updateMemo`
- 同値冪等（lastSavedRef）、flush、unmount タイマー解除、fire-and-forget `syncPendingMemosBackground`

**新規メモ id 生成タイミング判断（🔵）**: `/log/new` 到達時に即 addMemo しない。**初回入力（content が空でなくなった瞬間）に addMemo して id を確定**し、`navigate(/log/:id, {replace:true})` でURLを編集モードに差し替える。理由=空メモ量産回避（要件「摩擦低い」と「空メモ破棄」の両立、Skeptic の空メモリスクに直結）。

## 6. 変更・新規ファイル一覧

新規:
- `src/features/log/LogListPage.tsx`（~120行）
- `src/features/log/LogListPage.module.css`（~60行）
- `src/features/log/MemoEditorPage.tsx`（~130行）
- `src/features/log/MemoEditorPage.module.css`（~40行）
- `src/features/log/useMemoAutoSave.ts`（~70行）
- `src/features/log/MemoListItem.tsx`（長押し削除付き、~90行）
- `src/features/shared/HeaderTabs.tsx`（~40行）
- `src/features/shared/HeaderTabs.module.css`（~30行）
- `src/features/bookshelf/Fab.tsx`（~35行）+ Fab CSS は BookshelfPage.module.css に追記
- テスト: `src/features/log/LogListPage.test.tsx`, `MemoEditorPage.test.tsx`, `src/features/shared/HeaderTabs.test.tsx`

変更:
- `src/types/index.ts`: Memo 型、ExportPayload.memos 追加（~10行）
- `src/lib/constants.ts`: `DB_VERSION=3`, `EXPORT_FORMAT_VERSION=2`（2行）
- `src/lib/db.ts`: DBSchema memos, upgrade, memo CRUD群, dateKey export, replaceAllData 拡張（~90行）
- `src/lib/export.ts`: buildExportPayload に memos（~3行）
- `src/lib/github.ts`: syncPendingMemos/putMemoFile/syncPendingMemosBackground/registerOnlineSync 拡張（~90行）
- `src/App.tsx`: /log, /log/new, /log/:memoId ルート追加（~6行）
- `src/features/bookshelf/BookshelfPage.tsx`: h1→HeaderTabs、FAB 追加（~10行）
- `src/features/bookshelf/BookshelfPage.module.css`: FAB スタイル（~25行）
- 既存テスト: `db.test.ts`/`export.test.ts`/`github.test.ts` に memo ケース追加、EXPORT_FORMAT_VERSION 変更追従

## 7. マイルストーン分割（垂直スライス・依存順）

- **M1 データ基盤**: 型 + DB_VERSION 3 + memos ストア + CRUD + v2→v3 マイグレーション。TDD（db.test.ts）。ユーザー価値: 内部のみだが以後の全機能の土台。例外的に水平だが分離不可。
- **M2 メモ作成・編集（垂直）**: FAB + MemoEditorPage + useMemoAutoSave + ルート /log/new・/log/:memoId。「ユーザーが本棚からFABでメモを書いて暗黙保存できる」。TDD（MemoEditorPage.test.tsx）。
- **M3 メモ一覧・閲覧・削除（垂直）**: LogListPage + HeaderTabs + MemoListItem 長押し削除 + ルート /log + タブ切替。「ユーザーがメモを時系列で振り返り、不要なメモを削除できる」。TDD。
- **M4 バックアップ（垂直）**: JSONエクスポート memos + EXPORT_FORMAT_VERSION 2 後方互換 + GitHub日付別ファイル同期。「ユーザーがメモをバックアップ/復元（JSON）できる」。TDD（export.test.ts/github.test.ts）。

依存: M1→M2→M3→M4。M2 と M3 は M1 完了後並行可だが UI 一貫性のため逐次推奨。

## 8. ROI と過剰実装の指摘

- 最小高ROI: M1+M2 でコア価値（書ける）が成立。M3 で振り返り価値。M4 はデータ保全。
- 過剰になりうる点:
  - github の `putPage` 汎用リファクタ → コピーで十分（汎用化はテスト面積増、ROI 低）
  - importFromGitHub の memos 逆変換 → 曖昧性高くバグ源。JSON経路で代替（見送り推奨）
  - HeaderTabs を汎用タブライブラリ化 → 2タブ固定で十分
  - メモのページング/仮想スクロール → 観測ログ件数想定で不要、非目標準拠
