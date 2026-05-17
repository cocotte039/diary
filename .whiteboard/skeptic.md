# Skeptic 分析（リスク・エッジ・回帰・タイミング）

確信度: 🔵 / 🟡 / 🔴。深刻度: Critical / Major / Minor。

## Critical

### C1. モーダル閉鎖とスクロールの競合（rAF 1回では不足の懸念）
🟡 `setShowCalendar(false)` は React state 更新 → 再レンダで MemoCalendar overlay が unmount。`requestAnimationFrame` コールバックは「次フレームの描画前」に走るため、React の commit + DOM 反映タイミングと競合しうる。
- 対象 section（`#memo-date-${dk}`）は元から DOM に存在（モーダルと別領域・常時マウント）するため "要素が無い" 問題は限定的。だが overlay が fixed/inset:0 で被さった状態のままスクロールが走ると視覚的に「スクロール → モーダル消える」順になり一瞬チラつく可能性。
- 緩和（推奨）: 二重 rAF（`requestAnimationFrame(() => requestAnimationFrame(() => scroll))`）で「state 反映後の次フレーム」にスクロールを遅延。setTimeout(0) より rAF が描画同期で安定。🟡
- 代替: `flushSync(() => setShowCalendar(false))` 後に同期 scroll。ただし flushSync は React 推奨度低くオーバーキル。二重 rAF を第一候補。🟡
- テスト方針: jsdom は scrollIntoView 未実装 → `Element.prototype.scrollIntoView` を vi.fn() でモックし「閉じた後に対象 id へ呼ばれた」ことを検証。rAF は jsdom で動く（または vi で flush）。

### C2. 対象 section 不在時の null 安全（empty / ローディング中）
🔵 `memos.length === 0` のとき `.empty` 描画で section が存在しない。また `ready=false`（初回/reload 中）も section 無し。
- ただしカレンダーにドットが出る = メモ存在 = section 存在 のはずだが、reloadKey 再読込中の競合で getElementById null になりうる。
- 緩和: `?.scrollIntoView()`（オプショナルチェイン）で null クラッシュ回避。スクロール不発でもクラッシュしない。🔵
- 追加緩和: 🟡 万一に備え対象が無ければ no-op（明示的 if）。要件「メモがある日のみドット→タップ可」なので実害は低いが防御的に。

## Major

### M1. StrictMode 二重実行（リスナ二重登録）
🔵 MemoMenu の pointerdown/Escape useEffect、LogListPage の Escape useEffect は cleanup（removeEventListener）を返せば二重登録は相殺される（BookshelfMenu/BookshelfPage 既存実装が同型で実績あり）。
- 必須: useEffect 内 addEventListener には**必ず**対応する removeEventListener を return。BookshelfMenu L29-32 / BookshelfPage L82 の作法を厳密踏襲。🔵
- scrollToDate は副作用を useCallback 内の rAF で行うのみ（useEffect 非依存）→ StrictMode 二重マウントの影響なし。🔵
- FAB navigate は onClick イベント駆動 → StrictMode 無関係。MemoEditorPage 側に既存の StrictMode 二重 pushState ガード ref（L53-54）あり、from 値変更は影響しない。🔵

### M2. 本棚 Fab 非回帰
🔵 Fab に `from?: string` 追加・既定 '/'。BookshelfPage は `<Fab />`（引数なし）→ from='/' → `navigate('/log/new',{state:{from:'/'}})` で**完全に現状と同一**。
- 回帰テスト: BookshelfPage.test.tsx の FAB 遷移テスト（あれば）が緑のままであること。無ければ「`<Fab />` で state.from==='/'」のユニットテスト追加。🔵
- MemoEditorPage backTo 分岐（isNew ? fromState : '/log'）: from='/log' 渡しで isNew 時 backTo='/log'。本棚経由は from='/' で従来通り。回帰なし。🔵

### M3. FAB で最下段メモが隠れる回帰
🔵 LogListPage.module.css `.body`（L16-22）は FAB 分 padding-bottom 未確保。BookshelfPage.module.css L18-19 の `calc(max(1.25rem, env(safe-area-inset-bottom)+0.75rem)+52px+1rem)` を移植必須。
- 未対応だと最後の日付グループ最終メモが FAB に被りタップ不能 → 機能回帰。🔵
- テスト: 視覚回帰は自動化困難。CSS 値の存在を実装レビューで担保 + 手動確認項目に明記。

### M4. JST 深夜境界の dateKey ズレ
🔵 getMemoDateSetInMonth は getDateSetInMonth L535 同型（`new Date(createdAt)` のローカル getFullYear/getMonth で月フィルタ + `dateKey()` で key 化）。dateKey はローカル日付（db.ts L492-498）。LogListPage の groups も `dateKey(m.createdAt)`（L45）使用 → カレンダーの key と section id の dk が**同一関数由来で一致**。
- リスク: 月フィルタを `getFullYear/getMonth`（ローカル）でなく UTC やスライスで実装すると、JST 00:00-08:59 のメモが前月扱いになりドット欠落 + scroll 先 mismatch。
- 緩和: 必ず getDateSetInMonth と一字一句同じローカル比較ロジックにする。🔵
- テスト: LogListPage.test.tsx L117-138 と同じ「UTC境界 createdAt」シードで、カレンダーのドット日と section id が一致することを検証。

### M5. 空メモ日タップ無反応
🔵 MemoCalendar はドット有無 `hitDates.has(key)` で表示。onPick はセル onClick で発火するが、ドット無し日もボタン自体は存在（Calendar.tsx L82-92 と同型: 全日ボタン）。
- 要件「メモ無い日はタップ無反応」を満たすには、onPick 内で `if (!hitDates.has(key)) return;` early return が必須（日記 Calendar は findPageByDate が null で実質無反応だが、メモ版は明示ガード要）。🔵
- テスト: ドット無し日セル click → scrollIntoView モックが呼ばれない + モーダル閉じない（無反応）。

## Minor

### Mi1. IME 変換中の Escape 誤発火
🟡 メニュー/モーダルは textarea を持たない（MemoCalendar は月送りボタンのみ、MemoMenu はボタン/Link のみ）→ IME 変換コンテキストなし。MemoEditorPage の isComposing ガードは textarea 起因で本件は無関係。対応不要。🔵
- ただし将来カレンダーに入力欄が増えた場合は要再検討（今回スコープ外）。

### Mi2. z-index 競合
🔵 FAB z-index:50（BookshelfPage.module.css L155）、カレンダー overlay z-index:100（L96）。メニュー .menu z-index:50。
- overlay(100) > FAB(50) なのでモーダル表示中 FAB は背後（クリック不可）→ 正しい挙動。🔵
- メニュー(50) と FAB(50) は同一画面同時表示。メニューはヘッダー直下ドロップダウン、FAB は右下固定で領域非重複 → 競合実害なし。🔵
- 新規 LogListPage モーダル CSS は BookshelfPage.module.css の overlay/panel/close をクラス名含め複製し z-index:100 維持。

### Mi3. a11y
🔵 本棚同水準を踏襲: メニュー trigger に aria-haspopup/aria-expanded/aria-label、menu に role=menu、項目 role=menuitem。モーダルに role=dialog/aria-modal/aria-label/閉じるボタン aria-label。
- 🟡 本棚はモーダル open 時の body スクロールロック・focus trap **未実装**。メモ側のみ新規実装すると一貫性崩れ + スコープ膨張。本棚同水準（= 未実装のまま）に留める。focus trap は非目標扱い。
- スクロール後の focus 移動は要件外（瞬間移動のみ）。focus は維持で可。

### Mi4. reloadKey 再読込との競合
🟡 削除後 reload（reloadKey++）中にカレンダー open → getMemoDateSetInMonth は DB 直読みで最新反映。日付タップ時 section が再レンダ未完なら C2 の null 安全で吸収。実害低。🔵

## 回帰テスト方針サマリ
1. Fab 単体: 引数なし→state.from='/'、from='/log'→state.from='/log'。🔵
2. BookshelfPage 既存 FAB テスト緑維持。🔵
3. LogListPage: MemoMenu 開閉（pointerdown外/Escape/項目click）、設定 Link が /settings へ。
4. MemoCalendar: ドット日 click → モーダル閉 + scrollIntoView(該当id) 呼出（モック）。ドット無し日 click → 無反応。
5. JST 境界シードでドット日と section id 一致。
6. scrollIntoView は jsdom 未実装 → 全テストで `Element.prototype.scrollIntoView = vi.fn()` を beforeEach 設定。
