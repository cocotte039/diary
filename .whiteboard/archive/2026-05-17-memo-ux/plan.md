# Plan — 時系列メモ機能（観測ログ）

## Goal

日記とは別管理の「観測ログ」機能を追加する。何らかの試みに対する観測を、いつ何に触れたか後から振り返れる形で、作成摩擦を最小化して記録する。1メモ=「本文＋自動時刻のみ」。

**ユーザー原依頼**: 時系列に沿ったメモ機能。既存日記と別管理、観測ログ記録目的、振り返りやすく、作成ハードル低く摩擦少なく。

## チーム構成

| エージェント | 視点 | 出力 |
|---|---|---|
| Pragmatist | 最短経路・既存資産再利用・情報構造・マイルストーン | `.whiteboard/pragmatist.md` |
| Skeptic | マイグレーション回帰・同期競合・後方互換・エッジケース | `.whiteboard/skeptic.md` |
| Aesthete | 静けさ・タブ/FAB UX・認知負荷・トランジション | `.whiteboard/aesthete.md` |

判定理由: 新機能追加 + データ層マイグレーション + 同期 + 新規UI画面群の複合タスク。データリスク（既存日記破壊回避）と静けさ原則の両立が要のため3視点フル投入。

## Context（確認済みコード・現状）

- `src/lib/db.ts`: idb `DiaryDB extends DBSchema`、`getDB()` の upgrade は `if (!db.objectStoreNames.contains(...))` ガード方式。`oldVersion < 2` 分岐は no-op コメントのみ。`replaceAllData(volumes, pages)` は volumes/pages を clear→再投入、meta 保持。`getPendingPages`/`markPageSynced` は `by-syncStatus` index 利用。`dateKey(iso)` はローカル日付 YYYY-MM-DD 変換（**現在 module-private**）。`nowIso()`/`uuid()` private ヘルパ。
- `src/lib/constants.ts`: `DB_VERSION=2`, `EXPORT_FORMAT_VERSION=1`, `AUTOSAVE_DEBOUNCE_MS=2000`, `LONG_PRESS_MS=500`, `LONG_PRESS_MOVE_TOLERANCE_PX=10`。
- `src/types/index.ts`: `ISODateString`, `SyncStatus='synced'|'pending'`, `ExportPayload { version; exportedAt; volumes; pages }`。
- `src/lib/export.ts`: `buildExportPayload` = volumes/pages を version 付きで返す。`exportAllData` で Blob ダウンロード。
- `src/lib/github.ts`: `buildPath`=`volumes/{ordinal3}-{volumeId}/page-{NN}.txt`、`b64encode`、`shaCache` path→sha メモリMap、`putPage`（SHA取得→422再取得リトライ）、`syncPendingPages`（settings/online ガード→pending ループ→backoff）、`syncPendingPagesBackground`、`registerOnlineSync`（online で syncPendingPagesBackground のみ）、`importFromGitHub`（tree 解析→`replaceAllData(volumes, pages)`）、`BACKUP_PATH_RE=/^volumes\/(\d{3,})-([^/]+)\/page-(\d{2,})\.txt$/`。
- `src/App.tsx`: HashRouter。`/`=Bookshelf, `/book/:volumeId/:pageNumber`=Editor, `/settings`=Settings, `*`→`/`。
- `src/features/bookshelf/BookshelfPage.tsx`: `.app-header` に `<h1 class={styles.title}>本棚</h1>` + BookshelfMenu。`.body` overflow-y:auto。
- `VolumeCard.tsx`: 長押し作法（longPressTimerRef/longPressFiredRef/startX/Y/move tolerance/handleClick guard/onContextMenu preventDefault/2段 confirm）、`formatRange` ローカル日付 YYYY/MM/DD。
- `EditorPage.tsx`: popstate ガード（`historyGuardInstalledRef` で StrictMode 二重 pushState 防止、popstate で `flush()`→`navigate('/',{replace})`）、戻るリンク `.app-header-link`「本棚」。
- `useEditorAutoSave.ts`: `(volumeId, pageNumber, text)` debounce(AUTOSAVE_DEBOUNCE_MS)→savePage、lastSavedRef 冪等、`flush()`、unmount timer 解除、保存後 `syncPendingPagesBackground` fire-and-forget。**savePage 密結合のため memo へ流用不可、構造踏襲して新規作成**。
- `SettingsPage.tsx`: JSON は `exportAllData` のみ。**JSONインポートUIは存在しない**（復元は `importFromGitHub`=GitHub経由のみ）。
- `global.css`: 4色（--color-bg #1c1c20 / --color-text #e8e0d4 / --color-rule rgba(255,255,255,0.08) / --color-accent #3a3545 / +--color-error）。`.app-header`（flex, safe-area, --header-height）、`.app-header-link`（opacity 0.3→active 0.6, 0.75rem, font-family-ui, transition 120ms）、`--transition-soft: opacity 200ms`。
- テスト作法: vitest + jsdom + fake-indexeddb。`db.test.ts` の `wipeDB`=`_resetDBForTests`+`indexedDB.deleteDatabase(DB_NAME)`、beforeEach/afterEach。`export.test.ts` は `expect(payload.version).toBe(EXPORT_FORMAT_VERSION)`（定数参照、自動追従）。

## ユーザー判断必須事項（🔴 — 実装着手前 or M4 着手前に確定）

Skeptic 抽出。各推奨案で進行可だが、データ保全に関わるため plan に明記しユーザー確認を仰ぐ:

- **U1 GitHub 全削除日の反映方式**: その日のメモが全削除されたとき GitHub `memos/YYYY-MM-DD.md` をどうするか。**推奨: 空内容で PUT**（octokit deleteFile より実装小・既存 putPage 資産流用可・「ローカル真実=空」を反映）。代替: ファイル削除 / 放置（バックアップ不整合）。
- **U2 GitHub置換復元（importFromGitHub）時の memos**: volumes/pages の置換復元でローカル memos を巻き添え消去しない。**推奨: 保持**（`replaceAllData` の memos 引数を optional 化し、未指定時は memos ストアに触れない）。
- **U3 空/空白のみメモの扱い**: **推奨: 新規は content.trim() 非空になって初めて addMemo（空メモ量産回避）。既存メモを空に編集した場合は保持（削除は長押しで明示操作）。一覧で空メモは「（空のメモ）」プレースホルダ**。
- **U4 GitHubインポートで memos を復元するか**: **推奨: 本サイクル見送り**（memos/*.md の `## HH:MM:SS` 逆変換は createdAt 秒の曖昧性・年月日がファイル名依存でバグ源。JSONエクスポート経路でバックアップは確保。将来課題）。

> 本計画は上記推奨案を採用した前提で記述する。ユーザーが別案を選んだ場合は該当タスクの受入条件を差し替える。

## アーキテクチャ判断（確信度付き）

- **A1 🔵** Memo 型: `Memo { id:string; content:string; createdAt:ISODateString; updatedAt:ISODateString; syncStatus:SyncStatus }` を `types/index.ts` に追加。
- **A2 🔵** DB: `DB_VERSION 2→3`。`DiaryDB` に `memos` ストア（keyPath 'id'、index `by-createdAt`・`by-syncStatus`）。upgrade は既存3ストアのコードを一切触れず `if (!db.objectStoreNames.contains('memos')) {...}` 追加分岐のみ。`oldVersion<3` 条件は不要（contains ガードで v1/v2/新規を一律カバー、既存 v1→v2 方針と一致）。
- **A3 🔵** `dateKey` を `export function dateKey` 化（日付グルーピング・GitHubファイル名で共有）。挙動変更なし。
- **A4 🔵** memo CRUD を db.ts に追加（下記 D2）。`addMemo`/`updateMemo` は `syncStatus:'pending'`、`updatedAt=nowIso()`、addMemo は `createdAt=updatedAt`。
- **A5 🔵** `replaceAllData(volumes, pages, memos?)` に拡張。memos 未指定時は memos ストアに**触れない**（U2 推奨=GitHub置換復元でメモ巻き添え消去回避）。importFromGitHub は `replaceAllData(volumes, pages)`（memos 引数省略）のまま型エラーなく動く。
- **A6 🔵** `ExportPayload` に `memos: Memo[]`（optional でなく必須、version=2 は常に存在）。読み手は将来 `payload.memos ?? []` フォールバック（コメント明記）。`EXPORT_FORMAT_VERSION 1→2`。
- **A7 🟡** タブUI: `src/features/shared/HeaderTabs.tsx`（`useLocation` でパス判定、`<Link to="/">本棚</Link>`/`<Link to="/log">メモ</Link>`、選択中 opacity 0.85 / 非選択 0.3、font-family-ui 0.8rem）。BookshelfPage の h1「本棚」を廃止し HeaderTabs に置換。LogListPage も同 HeaderTabs。
- **A8 🟡** メモ autosave: `src/features/log/useMemoAutoSave.ts` を新規（useEditorAutoSave 構造踏襲）。引数 `(memoId: string|null, content: string)`。memoId===null かつ `content.trim()!==''` の初回 → `addMemo` で id 採番、呼び出し側で `navigate('/log/:id',{replace:true})` し以後 updateMemo（U3 空メモ回避の核）。冪等 lastSavedRef、flush、unmount timer 解除、保存後 `syncPendingMemosBackground` fire-and-forget。
- **A9 🟡** GitHub memo 同期: `syncPendingMemos`/`putMemoFile`/`syncPendingMemosBackground` を github.ts に新設。`putMemoFile` は `putPage` の SHA/422 ロジックをコピー（汎用化はオーバーエンジニアリング）。`registerOnlineSync` の online ハンドラに `syncPendingMemosBackground()` を追加。**ファイル本文生成時に取得した memo id 集合のみ synced 化**（生成→PUT 間の新規メモ取りこぼし回避、Skeptic C2）。
- **A10 🟡** メモ入力画面: EditorPage の `.app-header + surface + textarea` 構造言語を踏襲しつつ**罫線なしプレーン textarea**（日記=罫線ノート / メモ=素の紙、で体験分離）。自動フォーカスなし。popstate ガード（EditorPage 同型 `historyGuardInstalledRef`）+ 戻るリンク click 時 flush。
- **A11 🟡** ルート: App.tsx に `/log`=LogListPage, `/log/new`=MemoEditorPage(新規), `/log/:memoId`=MemoEditorPage(編集) 追加。`*`→`/` フォールバック維持。
- **A12 🔵** メモ削除の同期反映（Skeptic C3）: `deleteMemo` 後、当日に残る他メモがあればそのいずれか1件を pending 化し当日ファイル再生成を誘発。当日全削除なら meta の `memos-deleted-days`（Set 相当の string[]）に当日 dateKey を追加し、`syncPendingMemos` がそれらの日について空内容PUT（U1 推奨）→成功で当該 dateKey を除去。

## スコープ

### やること（🔵）
- Memo 型・ExportPayload.memos 追加、DB_VERSION 3 / EXPORT_FORMAT_VERSION 2
- memos ストア追加（v2→v3 既存無破壊マイグレーション）+ memo CRUD + pending/markSyncedByDay
- HeaderTabs（本棚/メモ）、BookshelfPage の h1→タブ置換、FAB
- MemoEditorPage（新規/編集兼用）+ useMemoAutoSave、ルート3本
- LogListPage（日付グルーピング・新しい順・空状態）+ MemoListItem 長押し削除
- GitHub 日付別ファイル同期（syncPendingMemos）+ online 再開拡張 + 削除日反映（A12）
- JSON エクスポートに memos + 後方互換コメント/フォールバック方針
- TDD: db migration/CRUD、export 後方互換、github 日付別生成、各画面テスト

### やらないこと（非目標・🔵）
- タグ/タイトル/全文検索
- メモと日記の相互リンク・統合ビュー
- 新規 npm 依存
- JSON インポートUIの新規実装（現状未実装。memos の後方互換は将来 import 実装時に有効化する設計のみ用意）
- importFromGitHub での memos 逆復元（U4 見送り、将来課題）
- メモ一覧の仮想スクロール/ページング（観測ログ件数想定で不要）
- github `putPage` の汎用リファクタ（コピーで十分）

## 変更・新規ファイル一覧

### 新規
| ファイル | 概算行 |
|---|---|
| `src/features/shared/HeaderTabs.tsx` | ~40 |
| `src/features/shared/HeaderTabs.module.css` | ~30 |
| `src/features/shared/HeaderTabs.test.tsx` | ~50 |
| `src/features/bookshelf/Fab.tsx` | ~35 |
| `src/features/log/MemoEditorPage.tsx` | ~140 |
| `src/features/log/MemoEditorPage.module.css` | ~40 |
| `src/features/log/MemoEditorPage.test.tsx` | ~120 |
| `src/features/log/useMemoAutoSave.ts` | ~75 |
| `src/features/log/LogListPage.tsx` | ~120 |
| `src/features/log/LogListPage.module.css` | ~60 |
| `src/features/log/MemoListItem.tsx` | ~90 |
| `src/features/log/LogListPage.test.tsx` | ~110 |

### 変更
| ファイル | 内容 | 概算行 |
|---|---|---|
| `src/types/index.ts` | Memo 型、ExportPayload.memos | +10 |
| `src/lib/constants.ts` | DB_VERSION=3, EXPORT_FORMAT_VERSION=2 | 2 |
| `src/lib/db.ts` | DBSchema memos, upgrade 追加分岐, memo CRUD, dateKey export, replaceAllData 拡張, memos-deleted-days meta | +110 |
| `src/lib/export.ts` | buildExportPayload に memos | +3 |
| `src/lib/github.ts` | syncPendingMemos/putMemoFile/syncPendingMemosBackground/registerOnlineSync 拡張 | +100 |
| `src/App.tsx` | /log, /log/new, /log/:memoId | +6 |
| `src/features/bookshelf/BookshelfPage.tsx` | h1→HeaderTabs, FAB | +10 |
| `src/features/bookshelf/BookshelfPage.module.css` | .fab/.fabIcon, .body padding-bottom | +25 |
| `src/lib/db.test.ts` | memo CRUD / v2→v3 移行 / replaceAllData memos保持 | +追加 |
| `src/lib/export.test.ts` | memos / version=2 | +追加 |
| `src/lib/github.test.ts` | 日付別生成 / BACKUP_PATH_RE 非マッチ / memos非import | +追加 |

## 設計詳細

### D1. 型（types/index.ts）🔵
```ts
export interface Memo {
  id: string;
  content: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  syncStatus: SyncStatus;
}
export interface ExportPayload {
  version: number;
  exportedAt: ISODateString;
  volumes: Volume[];
  pages: Page[];
  memos: Memo[]; // v2+。読み手は payload.memos ?? [] でフォールバック（旧v1互換）
}
```

### D2. db.ts memo 層 🔵
DBSchema 追加・upgrade 追加分岐は A2 の通り。関数（Key Links＝本番呼び出し元を明記）:

| 関数 | シグネチャ | Key Link（本番呼出元） |
|---|---|---|
| `addMemo` | `(content:string):Promise<Memo>` | useMemoAutoSave 初回保存 |
| `getMemo` | `(id:string):Promise<Memo\|undefined>` | MemoEditorPage 編集ロード |
| `getAllMemos` | `():Promise<Memo[]>` | LogListPage, buildExportPayload, syncPendingMemos |
| `updateMemo` | `(id:string,content:string):Promise<Memo\|undefined>` | useMemoAutoSave 編集保存（get→無ければ no-op で undefined） |
| `deleteMemo` | `(id:string):Promise<void>` | MemoListItem 長押し削除（A12 の再生成誘発込み） |
| `getPendingMemos` | `():Promise<Memo[]>` | syncPendingMemos |
| `markMemosSyncedByDay` | `(dateKey:string, ids:string[]):Promise<void>` | syncPendingMemos（生成時 id 集合のみ synced） |
| `getDeletedMemoDays` / `addDeletedMemoDay` / `removeDeletedMemoDay` | meta `memos-deleted-days` 操作 | deleteMemo / syncPendingMemos |
| `dateKey` | export 化（挙動不変） | LogListPage, github |
| `replaceAllData` | `(volumes, pages, memos?)` memos 未指定で memos 無触 | importFromGitHub（省略呼出） |

### D3. github.ts memo 同期 🟡
- `buildMemoFileContent(memosOfDay: Memo[]): string` = createdAt 昇順、各 `## HH:MM:SS\n{content}\n` 連結（時刻は dateKey と同じローカル時刻基準）
- `syncPendingMemos()`:
  1. settings/online ガード（syncPendingPages 同型）
  2. `getPendingMemos()` → `dateKey(createdAt)` でユニーク日集合 D
  3. 各 d∈D: `getAllMemos()` から d の全メモ取得→ソート→本文生成→**生成に使った memo id 配列を保持**→`putMemoFile('memos/'+d+'.md', content)`→成功で `markMemosSyncedByDay(d, ids)`
  4. `getDeletedMemoDays()` の各 d: 空内容 PUT（U1）→成功で `removeDeletedMemoDay(d)`
  5. backoff リトライは syncPendingPages 同型、`{synced, failed}` 返却（memo は件数=メモ数で集計）
- `syncPendingMemosBackground()` fire-and-forget ヘルパ。`registerOnlineSync` の online ハンドラに追加。
- `BACKUP_PATH_RE` は volumes 専用のまま（memos/*.md は parseBackupPath で null→tree 解析でスキップ＝既存挙動維持、誤import回避）。

### D4. useMemoAutoSave 🟡
useEditorAutoSave 構造踏襲。`(memoId, content)`。pendingRef/lastSavedRef/timer。
- memoId===null & `content.trim()!==''` 初回: `const m = await addMemo(content)` → コールバック `onCreated(m.id)` を呼び、MemoEditorPage が `navigate('/log/'+m.id,{replace:true})`
- memoId!==null: `updateMemo(memoId, content)`
- flush()/unmount timer 解除。保存後 `syncPendingMemosBackground()` fire-and-forget。

### D5. MemoEditorPage 🟡
- `useParams<{memoId?:string}>()`。`/log/new`=新規（memoId なし）、`/log/:memoId`=編集
- 編集: `getMemo(memoId)` undefined → `navigate('/log',{replace:true})`（幽霊メモ回避, Skeptic C7）
- textarea 罫線なしプレーン、自動フォーカスなし、明朝
- ヘッダー: 左 `.app-header-link` 戻る（新規=遷移元へ・編集=`/log`へ。遷移元は location.state or 既定 `/`）。編集時ヘッダー右に createdAt 控えめ表示（YYYY/MM/DD HH:MM, 0.7rem, opacity 0.3）。新規（未保存）時は非表示
- popstate ガード（EditorPage 同型、StrictMode 二重防止 ref）→ flush→ navigate(戻り先, replace)
- useMemoAutoSave 配線。新規初回作成で URL を /log/:id に replace

### D6. LogListPage + MemoListItem 🟡
- `.app-header` に HeaderTabs。`.body` overflow-y:auto
- `getAllMemos()` → createdAt 降順 → `dateKey` でグルーピング（新しい日が上）
- 日付見出し `YYYY/MM/DD`（formatRange 同表記）, font-family-ui, 0.75rem, opacity 0.5, margin-top 1.5rem
- MemoListItem: 行=`HH:MM`（opacity 0.4, 0.7rem, インライン先頭）+ 本文プレビュー 2行 clamp（opacity 0.85, 明朝）。空メモは「（空のメモ）」opacity 0.3。タップ→`/log/:id`。長押し（VolumeCard 作法丸ごと流用: LONG_PRESS_MS/move tolerance/click guard/onContextMenu preventDefault/confirm）→ `deleteMemo`→再ロード
- 空状態: 「まだメモがありません」`.empty` 作法（opacity 0.5, 中央, margin-top 4rem, font-family-ui）

### D7. HeaderTabs + FAB 🟡
- HeaderTabs: `useLocation().pathname` 判定（`/log` 始まり=メモ、else 本棚）。Link 2本。選択 opacity 0.85 / 非選択 0.3、transition 120ms、font-family-ui 0.8rem。区切り「/」opacity 0.2
- FAB（Fab.tsx, BookshelfPage に配置）: `position:fixed; right:max(1rem, env(safe-area-inset-right)+0.5rem); bottom:max(1.25rem, env(safe-area-inset-bottom)+0.75rem)`、52px 円、bg --color-accent、border 1px --color-rule、鉛筆 SVG stroke currentColor 1.5（BookshelfMenu 統一）、press scale(0.94)+opacity 0.8 150ms、影 0 2px 8px rgba(0,0,0,0.3)、aria-label「メモを書く」、onClick `navigate('/log/new', {state:{from:'/'}})`。`.body` に padding-bottom 追加でカード最下段の被り回避

## マイルストーン分割（垂直スライス・依存順）

### M1 — データ基盤（土台、TDD）
「内部: メモを保存・取得・削除でき、既存日記が無破壊で v3 移行される」
- **M1-T1**（TDD）: Memo 型 / ExportPayload.memos / constants（DB_VERSION=3, EXPORT_FORMAT_VERSION=2）
- **M1-T2**（TDD・RED→GREEN）: db.ts DBSchema memos + upgrade 追加分岐 + dateKey export
- **M1-T3**（TDD）: memo CRUD（addMemo/getMemo/getAllMemos/updateMemo/deleteMemo/getPendingMemos/markMemosSyncedByDay）+ memos-deleted-days meta + replaceAllData(memos?) 拡張
- 依存: T1→T2→T3

受入条件:
- 🔵 旧スキーマ（`indexedDB.open(DB_NAME,2)` で volumes/pages/meta 構築・データ投入）→ close → `getDB()`（v3）昇格後、既存3ストアのデータが全件無傷で読める
- 🔵 新規ユーザー（DBなし）→ v3 open で4ストア生成・memos 空
- 🔵 addMemo→getMemo 往復一致、createdAt===updatedAt（新規）、syncStatus='pending'
- 🔵 updateMemo は存在しない id で undefined・DB 不変（削除を尊重）
- 🔵 deleteMemo 後 getMemo undefined、当日他メモがあれば1件が pending 化（A12）、当日全削除なら memos-deleted-days に当日 dateKey
- 🔵 getPendingMemos が pending のみ返す
- 🔵 replaceAllData(volumes,pages)（memos 省略）で既存 memos 件数不変
- 🔵 dateKey は export され既存挙動不変（既存 findPageByDate/getDateSetInMonth のテスト緑維持）

Key Links: M1 単体では本番パス未接続（M2 以降で接続）。CRUD は M2/M3/M4 から呼ばれる。

### M2 — メモを書ける（垂直、TDD）
「ユーザーが本棚右下FABからメモ入力画面を開き、本文を書くと暗黙保存され、戻れる」
- **M2-T1**: App.tsx に /log/new・/log/:memoId ルート（一時的に MemoEditorPage スタブでも可）
- **M2-T2**（TDD）: useMemoAutoSave（初回非空で addMemo→onCreated、以後 updateMemo、flush、冪等、unmount 解除）
- **M2-T3**（TDD）: MemoEditorPage（新規/編集兼用、getMemo undefined→/log replace、popstate flush、戻るリンク、編集時 createdAt 控えめ表示、罫線なし textarea、自動フォーカスなし）
- **M2-T4**: Fab.tsx + BookshelfPage に FAB 配置 + .body padding-bottom
- 依存: M1→M2-T1→{T2→T3}→T4

受入条件:
- 🔵 `/log/new` で textarea に文字入力→2秒後 addMemo され getAllMemos に1件、URL が `/log/:id` に replace
- 🔵 `/log/new` で何も入力せず戻る→ getAllMemos 0件（空メモ不生成, U3）
- 🔵 `/log/:memoId`（既存）で content ロード、編集→2秒後 updateMemo、updatedAt 更新
- 🔵 `/log/不正id`→`/log` へ replace 遷移
- 🔵 戻る/popstate で flush 後遷移（2秒以内入力分が保存される）
- 🔵 自動フォーカスしない（textarea が document.activeElement でない）
- 🟡 編集時 createdAt が控えめ表示、新規未保存時は非表示
- 🔵 FAB タップで `/log/new` 遷移、FAB は scroll 非追従・カード最下段非被り

Key Links: FAB onClick→navigate('/log/new')→MemoEditorPage→useMemoAutoSave→db.addMemo/updateMemo→syncPendingMemosBackground（M4 で実体、M2 時点は no-op でも可だが import 配線は M4）。

### M3 — メモを振り返れる・消せる（垂直、TDD）
「ユーザーがヘッダータブでメモ一覧へ行き、日付ごと時系列でメモを見て、タップで編集、長押しで削除できる」
- **M3-T1**: HeaderTabs + CSS（本棚/メモ、選択 opacity）+ HeaderTabs.test
- **M3-T2**: BookshelfPage の h1「本棚」→ HeaderTabs 置換（既存 BookshelfPage.test 回帰確認・必要なら更新）
- **M3-T3**: App.tsx に `/log`=LogListPage ルート
- **M3-T4**（TDD）: LogListPage（getAllMemos→降順→dateKey グルーピング、日付見出し、空状態、HeaderTabs）
- **M3-T5**（TDD）: MemoListItem（時刻インライン+本文2行clamp、空メモプレースホルダ、タップ→/log/:id、長押し→deleteMemo→再ロード、VolumeCard 長押し作法流用）
- 依存: M2→M3-T1→{T2,T3}→T4→T5

受入条件:
- 🔵 `/log` で memos が日付グルーピング・日付降順・各日内 createdAt 降順表示
- 🔵 タブ「本棚」「メモ」で `/`⇔`/log` 相互遷移、選択中タブが opacity 0.85
- 🔵 BookshelfPage に h1「本棚」が無く HeaderTabs が表示（既存 BookshelfPage.test の該当アサーション更新）
- 🔵 メモ0件で「まだメモがありません」表示・クラッシュなし
- 🔵 メモ行タップ→`/log/:id` 編集遷移
- 🔵 メモ行長押し（LONG_PRESS_MS）→confirm→deleteMemo→一覧から消える、誤クリック遷移しない（click guard）
- 🟡 空メモ行は「（空のメモ）」プレースホルダ
- 🔵 削除後 last 1件・全削除でも一覧正常（空状態へ）

Key Links: HeaderTabs Link→react-router、MemoListItem onClick→navigate、長押し→db.deleteMemo（A12 誘発）。LogListPage←App route。

### M4 — メモをバックアップできる（垂直、TDD）
「ユーザーがメモを JSON エクスポートでき、GitHub に日付別ファイルで自動バックアップされる」
- **M4-T1**（TDD）: export.ts buildExportPayload に memos、export.test を version=2/memos 配列で更新
- **M4-T2**（TDD）: github.ts buildMemoFileContent + putMemoFile + syncPendingMemos + syncPendingMemosBackground
- **M4-T3**: registerOnlineSync に syncPendingMemosBackground 追加、useMemoAutoSave の保存後 fire-and-forget 接続確認
- **M4-T4**（TDD）: A12 削除日反映（deleteMemo→memos-deleted-days→syncPendingMemos 空PUT→removeDeletedMemoDay）
- **M4-T5**: github.test に BACKUP_PATH_RE が memos/ 非マッチ・importFromGitHub が memos 非破壊（replaceAllData memos 省略）テスト
- 依存: M3→M4-T1→M4-T2→M4-T3→M4-T4→M4-T5

受入条件:
- 🔵 buildExportPayload.version===2、memos 配列を含む（既存 export.test 緑維持・新規アサーション）
- 🔵 同日複数メモ→`memos/YYYY-MM-DD.md` が `## HH:MM:SS\n本文` を時刻昇順で連結（モックoctokit）
- 🔵 本文生成→PUT 間に追加された pending メモは synced 化されず次回再生成対象（生成時 id 集合のみ markSynced, Skeptic C2）
- 🔵 当日全削除→memos-deleted-days 経由で空内容PUT→成功で deleted-day 除去（U1）
- 🔵 online イベントで syncPendingMemos が発火（registerOnlineSync 拡張）
- 🔵 `BACKUP_PATH_RE` が `memos/2026-05-17.md` に非マッチ（誤import回避）
- 🔵 importFromGitHub 後も既存ローカル memos 件数不変（U2, replaceAllData memos 省略）
- 🔵 settings 無 or オフラインで syncPendingMemos が {0,0} 早期return（syncPendingPages 同型）

Key Links: useMemoAutoSave 保存後→syncPendingMemosBackground→syncPendingMemos→putMemoFile（octokit）+db.markMemosSyncedByDay。online→registerOnlineSync→syncPendingMemosBackground。buildExportPayload→db.getAllMemos→exportAllData（SettingsPage 既存ボタン）。

## エッジケース洗い出し（網羅）

| # | エッジ | 対策 | M |
|---|---|---|---|
| E1 | v2→v3 で既存 diary 破壊 | upgrade 追加分岐のみ・既存3ストア無触・移行テスト | M1 |
| E2 | v1 ユーザーが直接 v3 へ（v2 スキップ） | contains ガードで volumes/pages/meta も memos も生成（既存方式が元々全 store contains ガード） | M1 |
| E3 | 同日複数メモのファイル再生成中に新メモ追加 | 生成時 id 集合のみ markSynced、新規は pending 残存→次回再生成 | M4 |
| E4 | メモ削除で GitHub に古い内容残存 | A12: 当日他メモ1件 pending 化 or memos-deleted-days→空PUT | M1/M4 |
| E5 | 当日全メモ削除 | memos-deleted-days→空内容PUT（U1） | M1/M4 |
| E6 | オフラインでメモ作成→online復帰 | registerOnlineSync に syncPendingMemosBackground 追加 | M4 |
| E7 | autosave 2秒 debounce 中に戻る/popstate | MemoEditorPage popstate ガード+戻るリンクで flush | M2 |
| E8 | 空メモ量産（/log/new で書かず離脱） | 初回非空入力で初めて addMemo（U3） | M2 |
| E9 | 既存メモを全消し編集 | 保持（削除は長押し明示）、一覧で「（空のメモ）」 | M2/M3 |
| E10 | /log/:memoId 不正/削除済み id 直リンク | getMemo undefined→/log replace | M2 |
| E11 | 削除後 最後の1件/空一覧 | 空状態表示・クラッシュなし | M3 |
| E12 | タブ状態とブラウザ戻る履歴干渉 | 各画面 popstate ガードはマウント時のみ有効・独立（EditorPage と衝突しない） | M2/M3 |
| E13 | StrictMode 二重マウント | useMemoAutoSave timer unmount 解除 + popstate guard ref（EditorPage 同型） | M2 |
| E14 | syncPendingPages と syncPendingMemos 並走 | shaCache path 単位非衝突（volumes/.. vs memos/..）、octokit 別インスタンス、backoff 吸収 | M4 |
| E15 | ExportPayload 型変更の波及 | replaceAllData memos optional・importFromGitHub 省略呼出で型エラーなし | M1 |
| E16 | export.test の version 期待回帰 | 定数参照で自動追従、memos アサーション追加 | M4 |
| E17 | HashRouter ディープリンク /log/:id | HashRouter は静的ホスティングで動作（既存方針）、不正 id は E10 | M2 |
| E18 | 編集中に同メモ別経路削除 | updateMemo は get→無ければ no-op（put で復活させない） | M1 |
| E19 | dateKey export 化で既存利用箇所回帰 | 挙動不変・既存 findPageByDate/getDateSetInMonth テスト緑維持 | M1 |
| E20 | 秒同一の同日2メモのファイル見出し衝突 | `## HH:MM:SS` が同一になり得るが本文連結順は createdAt 安定ソート・id tiebreak、表示上問題なし（観測ログ目的に許容） | M4 |

## テスト方針

- **db.test.ts**: v2→v3 移行（旧スキーマ構築→昇格→無傷検証）/ memo CRUD 全関数 / updateMemo no-op / deleteMemo の A12 誘発 / replaceAllData memos 保持 / dateKey export 後の既存テスト緑
- **export.test.ts**: version===2 / memos 配列 / 既存 volumes/pages アサーション維持
- **github.test.ts**: buildMemoFileContent 時刻順連結 / syncPendingMemos（モック octokit, 生成時 id のみ markSynced）/ memos-deleted-days 空PUT / BACKUP_PATH_RE memos 非マッチ / importFromGitHub memos 非破壊 / settings無・オフライン早期return
- **HeaderTabs.test.tsx**: パス別選択状態、Link href
- **MemoEditorPage.test.tsx**: 新規初回保存→URL replace / 空のまま離脱で不生成 / 編集ロード / 不正id→/log / popstate flush / 自動フォーカスなし
- **LogListPage.test.tsx**: 日付グルーピング降順 / 空状態 / タップ遷移 / 長押し削除 / 空メモプレースホルダ
- TDD 順序: RED（テスト先行）→GREEN→Refactor。M1-T2/T3, M2-T2/T3, M3-T4/T5, M4-T1/T2/T4 は TDD 必須。
- CSS の文字列マッチテストは作らない（脆くROI低、目視 Verify）
- 全 M 完了後: `npm run typecheck` / `npm run test:run` / `npm run build` 全緑

## ロールバック

- マイルストーン単位コミット。M1 は内部のみ（UI 未接続）なので revert 安全。
- DB_VERSION 3 適用後にロールバック（DB_VERSION 2 へ戻す）は idb の version downgrade 不可 → **DB_VERSION は戻さない**。memos ストアは存在しても既存3ストア動作に無影響なので、UI 層（M2-M4）の revert のみで機能無効化可能。memos ストアは残置（無害）。
- EXPORT_FORMAT_VERSION 2 で出力した JSON を version=1 期待の旧コードで読む可能性は本サイクルでは無し（JSON import UI 未実装）。
- 各マイルストーン revert 時の依存: M4→M3→M2 の逆順で revert 可能。M1 revert は M2-M4 revert 後のみ（型・DB 依存）。

## 実装時の注意事項

- **既存日記の不可侵**: db.ts upgrade で volumes/pages/meta のコードは1文字も変更しない。memos 追加分岐のみ末尾に足す。移行テストを最初に書く（M1-T2 RED）。
- **静けさ厳守**: 4色のみ（新規色トークン作らない）、トランジション ≤200ms、通知/バッジ/件数カウンタ/ストリーク禁止、保存ボタン/トースト禁止、長押しヒント非表示。
- **既存資産流用**: VolumeCard 長押し作法・EditorPage popstate ガード・useEditorAutoSave 構造・github backoff/shaCache・.app-header-link CSS をコピー流用（汎用リファクタしない＝回帰面積最小）。
- **TS strict / I/O**: 全 TS strict 準拠。github は b64encode 既存流用（UTF-8 安全）。
- **互換性**: replaceAllData の memos は optional 末尾引数（既存 importFromGitHub 呼出を壊さない）。ExportPayload.memos は必須だが読み手フォールバック方針をコメント明記。
- **回帰確認**: M3-T2 で BookshelfPage の h1 削除に伴い既存 BookshelfPage.test.tsx の「本棚」h1 アサーションを更新（タブ表示で代替確認）。
- **コミット粒度**: マイルストーン内タスク単位。TDD タスクは RED コミット→GREEN コミット推奨。

## 自己レビューループ（Plan Check）

### チェック1回目
1. **完全性**: 合意要件（Memo型/DB v3/memos store/タブ/FAB/入力画面/一覧/長押し削除/ルート4本/GitHub日付別/JSON後方互換/静けさ/テスト）→ 全て M1-M4 のタスクに対応。✅
2. **実行可能性**: 各タスクに変更対象ファイル・関数シグネチャ・受入条件を明記。曖昧な「○○を修正」なし。✅
3. **依存整合性**: M1→M2→M3→M4、各 M 内 T 依存明記。dateKey export(M1)→LogList(M3)/github(M4) 整合。replaceAllData 拡張(M1)→importFromGitHub 非破壊(M4) 整合。✅
4. **リスク対応**: Skeptic Critical C1(E1/M1移行テスト)・C2(E3/生成時id集合)・C3(E4-E5/A12)に対策タスクあり。✅
5. **テスト方針**: 各タスクにTDD/受入条件、テスト方針節で網羅。✅
6. **スコープ逸脱**: 「やらないこと」に JSON import UI/memos逆復元/汎用リファクタ/仮想スクロール明記。U4 見送り明記。✅

**判定: 6/6 合格。ループ終了。**

## 未解決事項

なし（実装可能）。ただし U1-U4 はユーザー判断事項として明示。推奨案で実装着手可能だが、U1（全削除日のGitHub反映）・U2（GitHub復元時メモ保持）はデータ保全に関わるため、M4 着手前にユーザー確認を推奨。U3（空メモ）・U4（memos逆復元見送り）は推奨案で進行して問題なし。

### 将来課題（記録のみ）
- importFromGitHub での memos/*.md 逆復元（U4）
- JSON インポートUI実装時の version=1 後方互換有効化
- メモ件数増大時の一覧仮想スクロール
- メモの簡易検索（非目標だが要望が出れば別サイクル）
