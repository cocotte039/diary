# 実装計画: メモ一覧ページ ハンバーガーメニュー + メモカレンダー + ペン FAB

確信度凡例: 🔵確実 / 🟡推測 / 🔴未確定

## チーム構成

タスク特性: 既存本棚側パターン（BookshelfMenu/Calendar/Fab/モーダル作法）の横展開 + 新規 DOM スクロール挙動。UI/UX 影響大・回帰リスク中・新規ロジック小。
→ 標準3名（Pragmatist / Skeptic / Aesthete）を並列起動。

## Goal

LogListPage（メモ一覧 = 観測ログ画面）に、本棚側と同作法で以下3機能を追加する:
1. メモ専用ハンバーガーメニュー（項目=カレンダー / 設定）
2. メモ専用カレンダー（全画面モーダル, memos ストア対象, 日記 pages とは別管理）。日付タップで /log の該当日付グループへ自動スクロール
3. メモ作成用ペン FAB（タップで /log/new, 戻り先=/log）

日記側（BookshelfPage / BookshelfMenu / Calendar.tsx / EditorPage）の挙動は不変。「静けさ」原則（4色厳守・色追加なし・transition ≤200ms・バッジ/件数/通知なし）を維持。

## Context（実読確認・確信度付）

- 🔵 `LogListPage.tsx`: header に `<HeaderTabs />` のみ。`groups: Map<string, Memo[]>`（L43-49）を `[...groups.entries()].map(([dk, items]) => <section key={dk}>)`（L61-68）でレンダ。Fab・メニュー・モーダル無し。`useCallback/useEffect/useState` import 済。
- 🔵 `BookshelfPage.tsx`: `showCalendar` state（L30）、Esc 閉じる useEffect（L75-83）、モーダルオーバーレイ（L152-172, role=dialog/aria-modal/aria-label、`onClick e.target===e.currentTarget` で背景閉じ、close ボタン）、`<Fab />`（L175）。
- 🔵 `BookshelfMenu.tsx`: `open` state + `rootRef`、pointerdown 外部閉じ + Escape 閉じ useEffect（L19-33）、trigger（aria-haspopup=menu/aria-expanded）、`role="menu"` + `role="menuitem"`、設定は `<Link to="/settings">`。Props=`{onCreateNew, onOpenCalendar}`。
- 🔵 `Calendar.tsx`: `year/month` state、`getDateSetInMonth(year,month)` で `hitDates:Set<string>`（L21-30）、prev/next 月送り、`onPick(day)` → `findPageByDate` → navigate。ドット `hitDates.has(key)`。key 形式 `YYYY-MM-DD`（zero-pad）。
- 🔵 `Fab.tsx`: 固定 props 無し。`navigate('/log/new', { state: { from: '/' } })`（L20）固定。SVG 鉛筆。CSS は `BookshelfPage.module.css` の `.fab/.fabIcon`（L140-164, position:fixed, z-index:50）を共用。
- 🔵 `MemoEditorPage.tsx` L48-51: `fromState = location.state?.from ?? '/'`; `backTo = isNew ? fromState : '/log'`。→ 新規メモの戻り先は遷移元 from で決まる。FAB から `from:'/log'` を渡せば一覧へ戻る。StrictMode 二重 pushState ガード ref 実装済（L53-54）。
- 🔵 `db.ts`: `dateKey(iso)`（L492-498, ローカル年月日 zero-pad）。`getDateSetInMonth(year,month)`（L535-549, `db.getAll('pages')` をローカル年月フィルタ → `set.add(dateKey(...))`）。`getAllMemos()`（L678-682, `db.getAll('memos')` createdAt 昇順）。memos ストア存在確認済。
- 🔵 `HeaderTabs.tsx`: header 内 nav のみ。BookshelfPage では header 内に `<HeaderTabs />` + `<BookshelfMenu />` 並置。LogListPage は HeaderTabs のみ → 同様に MemoMenu 並置すればよい。
- 🔵 `LogListPage.module.css`: `.body` は `overflow-y:auto`（L16-22）。scrollIntoView のスクロールコンテナは `.body`。FAB 用 padding-bottom 無し（本棚 .body は FAB 分の padding-bottom あり L18-19 / メモ側は現状無し → FAB 追加で最下段被り懸念）。
- 🔵 `BookshelfPage.module.css`: モーダル `.calendarOverlay`（fixed/inset:0/rgba(0,0,0,0.6)/z-index:100/fadeIn 200ms）, `.calendarPanel`（max-width:360px）, `.calendarClose`（44px）。Fab CSS もここに在る → メモ側で再利用するには CSS の所在を決める必要（下記 Skeptic 論点）。
- 🟡 `.whiteboard/` 直下にアクティブ md 無し（全アーカイブ済）→ アーカイブ作業不要。

## 多視点分析統合

### 合意点（3視点一致）🔵
- MemoMenu / MemoCalendar は BookshelfMenu / Calendar.tsx の**複製改変**で実装（共通化は分岐増・非目標抵触で却下）。Pragmatist 主導, Skeptic/Aesthete 異論なし。
- メモカレンダーの視覚は日記カレンダーと**完全同一**（ドット色 `--color-text`/opacity 0.6/3px、月送り、fade-in 200ms、overlay rgba(0,0,0,0.6)）。色/アニメ追加なし=静けさ厳守。
- Fab.tsx `from?:string`（既定 '/'）追加で本棚完全不変。MemoEditorPage の backTo ロジックは流用（変更不要）。
- スクロールは `scrollIntoView({behavior:'auto', block:'start'})`（瞬間移動）。`?.` で null 安全。
- getMemoDateSetInMonth は getDateSetInMonth(db.ts L535-549) と一字一句同型のローカル年月比較（JST 境界ズレ防止）。

### 対立点と裁定
- **scroll タイミング（rAF 1回 vs 二重 rAF）**: Pragmatist=rAF 1回（最小）, Skeptic=二重 rAF 推奨（state 反映後の描画フレーム保証 + overlay チラつき回避）。
  → 裁定: **二重 rAF 採用**。理由: 対象 section は常時マウントだが overlay unmount と scroll の視覚順序を安定させる効果があり、コスト微小（数行）でリスク低減。Skeptic の C1 を優先。🟡（実装後テストで 1回で十分なら簡略化可）
- **空メモ日の無反応実装**: Skeptic=onPick 内 `if(!hitDates.has(key)) return` 明示ガード必須（メモ版は findPageByDate フォールバックが無い）。Aesthete=無反応で正・追加フィードバック禁止。
  → 裁定: 明示 early return 採用。視覚フィードバックは追加しない（静けさ）。🔵
- **LogListPage .header の align-items**: Aesthete=baseline 追加で本棚と視覚一致。Pragmatist=言及なし。
  → 裁定: `align-items: baseline` 追加採用（本棚ヘッダーとの一貫性, 低コスト）。🟡

### 採用しない案（見送り）
- Calendar/BookshelfMenu の props 兼用・共通化リファクタ（分岐増・非目標「日記側不変」抵触）🔵
- Fab CSS の共通 CSS 切り出し / Fab.tsx の bookshelf→shared 移動（スコープ外。技術的負債としてのみ記録）🔵
- モーダル focus trap / body スクロールロック（本棚未実装 = 本棚同水準に留める。新規実装は一貫性崩れ + スコープ膨張）🔵
- ドット無し日セルの opacity 低下（日記カレンダーと挙動差 = 一貫性崩れ）🔵
- per-date ルート新設（合意済非目標、単一ページ + scroll で実現）🔵

---

## マイルストーン分割（垂直スライス, Wave 付）

### Wave 0: 基盤（独立・並行可）
- **T0-1** 🔵 db.ts: `getMemoDateSetInMonth(year, month)` 追加。getDateSetInMonth L535-549 をコピーし `db.getAll('pages')`→`db.getAll('memos')`、`p.createdAt`→`m.createdAt` のみ変更。スキーマ変更なし。
  - テスト: db レイヤテストがあれば同型追加。なければ MemoCalendar 経由で間接検証。
- **T0-2** 🔵 Fab.tsx: `interface Props { from?: string }` 追加、`Fab({ from = '/' })`、`navigate('/log/new', { state: { from } })`。CSS import 現状維持。
  - テスト: Fab 単体（引数なし→state.from==='/'、from='/log'→'/log'）。BookshelfPage 既存 FAB テスト緑維持。

### Wave 1: メニュー + メモ作成導線（ユーザーが「メモ画面からメニューを開き設定へ行ける / ペンでメモ作成できる」）
- **T1-1** 🔵 MemoMenu.tsx 新規: BookshelfMenu.tsx を複製。open/rootRef/外部pointerdown/Escape useEffect（cleanup 必須）流用。menu 内項目を「カレンダー(button, onOpenCalendar)」「設定(Link to=/settings, onClick で setOpen(false))」の2つに削減。Props=`{ onOpenCalendar: () => void }`。trigger aria-haspopup/aria-expanded/aria-label 踏襲。
- **T1-2** 🔵 MemoMenu.module.css 新規: BookshelfMenu.module.css 複製（54行・改変なし）。
- **T1-3** 🔵 LogListPage.tsx: header に `<MemoMenu onOpenCalendar={() => setShowCalendar(true)} />` 並置（HeaderTabs の隣）。`<Fab from="/log" />` を root 直下末尾に配置（BookshelfPage L175 と同位置作法）。`showCalendar` state 追加（この Wave では open ハンドラのみ配線、モーダル本体は Wave2）。
- **T1-4** 🔵 LogListPage.module.css: `.header` に `align-items: baseline` 追加。`.body` の padding-bottom を BookshelfPage.module.css L18-19 同値（`calc(max(1.25rem, env(safe-area-inset-bottom)+0.75rem)+52px+1rem)`）へ変更（FAB 被り防止）。
  - Wave1 完了時点で動くもの: メモ画面のメニュー開閉・設定遷移・ペン FAB でのメモ作成（戻り先/log）。カレンダー項目は押せるが中身は Wave2。
  - テスト: MemoMenu 開閉（trigger click / 外部 pointerdown / Escape / 設定 Link → /settings）。Fab from='/log' 配線。

### Wave 2: メモカレンダー + 日付スクロール（ユーザーが「カレンダーからメモのある日へ瞬間移動できる」）
- **T2-1** 🔵 MemoCalendar.tsx 新規: Calendar.tsx を複製。year/month state・prev/next・cells 構築・JST 安全 key 生成・ドット表示を流用。`getDateSetInMonth`→`getMemoDateSetInMonth`。`onPick(day)` を `findPageByDate→navigate` 削除し `Props={ onPick: (dateKey: string) => void }` 化。**onPick 内で `if (!hitDates.has(key)) return;` early return**（空メモ日無反応・Skeptic C/合意）。Calendar の useNavigate import 除去。
- **T2-2** 🔵 MemoCalendar.module.css 新規: Calendar.module.css 複製（61行・改変なし、ドット視覚同一）。
- **T2-3** 🔵 LogListPage.tsx: 各日付 `<section>` に `id={`memo-date-${dk}`}` 付与（L62）。`showCalendar &&` のモーダルオーバーレイを BookshelfPage L152-172 複製作法で追加（role=dialog/aria-modal/aria-label="カレンダー"/背景 click 閉じ/close ボタン）。中身は `<MemoCalendar onPick={scrollToDate} />`。
- **T2-4** 🟡 LogListPage.tsx: `scrollToDate` useCallback 追加:
  ```tsx
  const scrollToDate = useCallback((dk: string) => {
    setShowCalendar(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(`memo-date-${dk}`)
          ?.scrollIntoView({ block: 'start', behavior: 'auto' })
      )
    );
  }, []);
  ```
  Escape でモーダル閉じる useEffect も BookshelfPage L75-83 同型で追加（cleanup 必須）。
- **T2-5** 🔵 LogListPage.module.css: BookshelfPage.module.css の `.calendarOverlay/.calendarPanel/.calendarClose/@keyframes fadeIn`（L86-132）をクラス名込みで複製（z-index:100 維持）。任意で section に `scroll-margin-top: 0.5rem`（上端詰まり回避, 静けさ範囲内）。
  - Wave2 完了時点で動くもの: メニュー→カレンダー→メモのある日タップ→モーダル閉→該当日付グループへ瞬間スクロール。空メモ日は無反応。
  - テスト: ドット日 click→モーダル閉+scrollIntoView(該当id) 呼出。ドット無し日 click→無反応。JST 境界シードでドット日と section id 一致。月境界(1↔12月)送り。

---

## テスト計画

### 共通セットアップ
- 🔵 全 LogListPage 系テストに `Element.prototype.scrollIntoView = vi.fn()` を beforeEach 設定（jsdom 未実装対策）。
- 🔵 既存 LogListPage.test.tsx の wipeDB/seedMemos/replaceAllData 作法・MemoryRouter 構成を踏襲。github mock 踏襲。

### 新規/更新テスト
| 対象 | ケース |
|---|---|
| Fab.test（新規 or 既存拡張） | 引数なし→state.from='/'; from='/log'→state.from='/log' 🔵 |
| BookshelfPage.test | 既存 FAB 遷移テスト緑維持（非回帰）🔵 |
| LogListPage.test | MemoMenu trigger click で開く / 外部 pointerdown で閉じる / Escape で閉じる / 設定 Link→/settings 🔵 |
| LogListPage.test | Fab 表示・from='/log' 配線（/log/new 遷移 state 確認）🔵 |
| LogListPage.test | カレンダー項目 click→モーダル open（role=dialog 出現）/ 背景 click・Escape・close ボタンで閉じる 🔵 |
| LogListPage.test | ドットのある日 click→モーダル閉+scrollIntoView が `#memo-date-YYYY-MM-DD` で呼出 🟡 |
| LogListPage.test | ドット無し日 click→scrollIntoView 未呼出・モーダル開いたまま（無反応）🔵 |
| LogListPage.test | JST 境界シード（UTC 2026-05-16T00:00:00Z 等, 既存 L117-138 流用）でカレンダードット日と section id が一致 🔵 |
| MemoCalendar.test（任意） | 月境界 prev(1月→前年12月)/next(12月→翌年1月)・ドット表示が getMemoDateSetInMonth 反映 🟡 |

---

## エッジケース対応マトリクス

| エッジ | 対応 | 確信度 |
|---|---|---|
| モーダル閉鎖×スクロール競合 | 二重 rAF で state 反映後フレームに scroll 遅延（Skeptic C1） | 🟡 |
| 対象 section 不在（empty/ready=false/reload 中） | `?.scrollIntoView()` オプショナルチェイン null 安全（Skeptic C2） | 🔵 |
| StrictMode 二重リスナ | useEffect add/removeEventListener 対称（BookshelfMenu/Page 同型）。scroll は useCallback+rAF で useEffect 非依存 | 🔵 |
| 空メモ日タップ | onPick 内 `if(!hitDates.has(key)) return`。視覚フィードバック追加なし | 🔵 |
| 月境界(1↔12月) | Calendar.tsx prev/next の year 繰上下げロジック流用（実績あり） | 🔵 |
| JST 深夜境界 dateKey ズレ | getMemoDateSetInMonth を getDateSetInMonth と同型ローカル比較。dateKey 共通関数で section id と一致 | 🔵 |
| IME 変換中 Escape | メニュー/モーダルは textarea 非保持→IME 文脈なし。対応不要 | 🔵 |
| a11y | role=menu/menuitem/dialog/aria-modal/aria-label 本棚同水準。focus trap/scroll lock は本棚同様未実装で揃える | 🔵 |
| 本棚 Fab 非回帰 | `<Fab/>` 引数なし→from='/' で現状完全同一。回帰テストで担保 | 🔵 |
| FAB 最下段被り | LogListPage .body padding-bottom を本棚同値へ（T1-4） | 🔵 |
| z-index 競合 | overlay 100 > FAB 50（モーダル中 FAB 背後で正）。menu 50 と FAB 50 は領域非重複 | 🔵 |

---

## ロールバック

- 🔵 全変更は加算的（新規ファイル + 既存への追記）。リスク高い順の戻し単位:
  - Wave2 のみ revert: MemoCalendar*.{tsx,css} 削除、LogListPage の showCalendar モーダル/scrollToDate/section id/Escape useEffect・LogListPage.module.css モーダル CSS を除去 → Wave1（メニュー+FAB）は維持可能。
  - Wave1 revert: MemoMenu*.{tsx,css} 削除、LogListPage の MemoMenu/Fab 配線・.header/.body CSS を戻す。
  - T0-2 revert: Fab.tsx props 削除（既定挙動 '/' に戻る）。本棚影響なし（元々 '/' 固定だったため）。
  - T0-1 revert: getMemoDateSetInMonth 削除（他から未参照なら無害）。
- 🔵 DB スキーマ変更なし → データ移行/ロールバック不要。
- 🔵 各 Wave 末でテスト緑を確認してから次 Wave へ（破壊的変更なし）。

---

## 技術的負債メモ（今回スコープ外・将来対応）
- 🟡 Fab.tsx が `bookshelf/` 配下のまま & CSS が BookshelfPage.module.css に同居。`shared/` への移動 + 専用 CSS 化は別タスク（今回は import 現状維持で機能実現を優先）。

---

## Plan Check（自己レビュー）

1. 完全性: メニュー/設定/カレンダー/別管理/日付スクロール/ペンFAB/Fab再利用/新db関数 → 全合意要件に Wave タスク対応済 🔵
2. 実行可能性: 各タスクに対象ファイル・関数・行番号・差分内容を具体記述 🔵
3. 依存整合性: Wave0(独立)→Wave1(T0-2依存)→Wave2(T0-1依存)。垂直スライスで各 Wave 単独動作 🔵
4. リスク対応: Skeptic Critical C1(二重rAF)/C2(?.null安全) を T2-4/エッジ表に反映 🔵
5. テスト方針: 各 Wave にテスト記述 + テスト計画表 + scrollIntoView モック方針明記 🔵
6. スコープ逸脱: 見送り案を明示列挙、共通化/移動/focus trap を除外しスコープ厳守 🔵

→ 全項目合格。未解決事項なし。確信度 🟡 残（scroll タイミング rAF 回数）は実装後テストで確定可・計画上はリスク緩和側（二重rAF）で確定。
