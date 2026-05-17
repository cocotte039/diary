# 実装計画: diary UX 改善（メモフォント/罫線・設定閉じる・本棚⇔メモ スワイプ）

策定者: Analyst Lead / 日付: 2026-05-18 / 状態: 分析中

## Goal（達成目標）

ユーザー依頼原文:
> ux改善をする。メモ機能のフォントは日記機能と同じにする。罫線も日記機能と同じように付ける。設定ページの右上は設定画面を閉じるボタンにして、その直前に開いていた本棚またはメモ一覧ページに直接戻れるようにする。本棚とメモ一覧ページはスマホを持ったときの親指で簡単に切り替えられるようにしたい。

合意済み要件（確信度付き・変更不可）:
- 🔵 R1: MemoEditorPage を Klee One(--font-family)＋日記同等罫線(notebook-surface/notebook-textarea)に。自由高さ維持（60行 min-height / page構造 var(--page-height-px) は持ち込まない、.surface 自由スクロール維持）
- 🔵 R2: LogListPage.module.css の .preview / .emptyMemo の font-family: var(--font-family-ui) を削除し global --font-family(Klee One) 継承。一覧に罫線なし
- 🟡 R2': .dateHeading・.time は UI メタ情報のため --font-family-ui 維持
- 🔵 R3: SettingsPage 右上 `<Link to="/">本棚</Link>` を「閉じる」化。location.state.from('/'|'/log')へ戻る、無ければ '/' フォールバック。BookshelfMenu の設定 Link に state={{from:'/'}}、MemoMenu に state={{from:'/log'}}
- 🔵 R4: 本棚⇔メモ一覧の左右スワイプ切替。HeaderTabs 併存。新規共通フック src/hooks/useSwipeNavigation 作成し BookshelfPage(左→/log)/LogListPage(右→/) のみ適用。編集画面の既存スワイプ不変。SWIPE_THRESHOLD_PX・水平優位2:1・IME ガード流用。showCalendar 中は無効

非機能・非目標:
- 🔵 静けさ維持（4色のみ・新規色なし・transition ≤200ms・バッジ/カウンタ追加なし）
- 🔵 日記側(EditorPage/notebook.css/日記 global 利用)は完全不変
- 🔵 下部タブバー新設しない / メモ一覧の罫線なし / DB・データモデル変更なし / メモにページ概念導入しない

## Context（現状コード把握・実読済み）

- notebook.css: `.notebook-surface`(font=--font-family / line-height / repeating-linear-gradient 罫線 / padding:0 var(--padding-page) / background-attachment:local / background-position:0 0) と `.notebook-textarea`(border/outline/resize none, width/height 100%, white-space:pre-wrap)
- MemoEditorPage.tsx: root div に onTouchStart/onTouchEnd 既存（右スワイプ戻る・SWIPE_THRESHOLD_PX・水平優位2:1・isComposingRef ガード）。`.surface`(flex:1 1 auto; overflow-y:auto; display:flex) 内に `<textarea className={styles.textarea}>`。className に notebook クラス未付与（テスト L157 が not.toMatch(/notebook-textarea|notebook-surface/) で現状を固定）
- MemoEditorPage.module.css: `.textarea` が flex:1 1 auto / font-family:var(--font-family-ui) / padding:1rem max(--padding-page,...) を独自指定。`.surface` は flex:1 1 auto; min-height:0; overflow-y:auto; display:flex
- LogListPage.module.css: `.preview` `.emptyMemo` `.empty` `.dateHeading` `.time` に font-family:var(--font-family-ui)
- SettingsPage.tsx L251-254: `<header className="app-header ...">` に `<h1>設定</h1>` + `<Link to="/" className="app-header-link">本棚</Link>`。useLocation 未 import
- BookshelfMenu.tsx L63-68 / MemoMenu.tsx L57-62: 設定 `<Link to="/settings" role="menuitem">` に state なし
- BookshelfPage.tsx: root div(`styles.root`、onTouch なし)、HeaderTabs+BookshelfMenu、`.body` overflow-y:auto、showCalendar state、calendarOverlay モーダル
- LogListPage.tsx: 同様に root div(onTouch なし)、HeaderTabs+MemoMenu、showCalendar state、calendarOverlay モーダル、Fab from="/log"
- EditorPage.tsx swipe: touchStartXRef/touchStartYRef/isComposingRef、onTouchStart/onTouchEnd を root div に。IME ガード・|dx|<SWIPE_THRESHOLD_PX 棄却・|dx|<=|dy|*2 棄却・dx<0 次/dx>0 前。**この実装は不変対象（R4）**
- App.tsx: HashRouter。`/`=Bookshelf, `/log`=LogList, `/log/new`・`/log/:memoId`=MemoEditor, `/settings`=Settings, `*`→`/`。`/bookshelf`→`/`
- HeaderTabs.tsx: 本棚/メモ Link、isLog=pathname==='/log'||startsWith('/log/')、aria-current で active 表現、opacity 強調
- global.css: `--font-family`='Klee One',...; `--font-family-ui`=system-ui,...; `.app-header-link`(font-family-ui/0.75rem/opacity 0.3→active 0.6)。`.app-header` flex/space-between
- constants.ts: SWIPE_THRESHOLD_PX=50。共通フック新設先 src/hooks/ は AGENTS.md 構造に存在（useAutoSave/useCursorRestore は M7 で削除済の可能性、現状要確認）
- テスト: vitest+RTL、vitest.config css:false（CSS Modules クラス名テスト不可、aria/testid で検証）、fileParallelism:false。MemoEditorPage.test.tsx に fireTouch/swipe ヘルパ、L157 notebook クラス不在テスト（R1 で更新必要）

## チーム構成

タスク特性: UX/視覚改修中心（フォント・罫線・体験統一）＋ナビゲーション設計（戻る state・スワイプ）＋回帰リスク（既存スワイプ/モーダル/IME/縦スクロール競合）。視覚・体験の比重が高く、回帰範囲も広い。

→ 標準3名（Pragmatist / Skeptic / Aesthete）を並列起動。Aesthete に体験統一(フォント/罫線/手書き体)・スワイプ操作感、Skeptic に回帰(既存スワイプ・モーダル中・IME・直接URL/リロード・縦スクロール競合)、Pragmatist に最短経路・notebook クラス流用・共通フック設計を重点配分。

## 対立点と判断

| 論点 | Pragmatist | Skeptic | Aesthete | 裁定 |
|---|---|---|---|---|
| R1/R2 体験分離の破棄 | 要望優先・最短で統一 | 設計意図逆転（Mi-1, コメント残置で混乱） | 世界観統一の価値>分離（支持） | 🔵 統一採用。設計意図コメントを「ユーザー要望により世界観統一」へ更新（Mi-1 緩和） |
| テスト L157 notebook 不在 | 反転更新（削除でなく更新） | Critical C1（必ず RED）削除禁止規約と緊張 | - | 🔵 反転更新（toMatch /notebook-textarea/ + テスト名改名）。spec/コミットで「仕様変更に伴う検証反転＝正当」明記。M1 同梱 |
| R1 罫線ベースライン | className＋module.css 減算で最短 | Critical C2（jsdom 検証不可・実機ずれ） | 上下padding notebook 委譲必須（位相） | 🔵 EditorPage 構造へ厳密同型化（上下padding 0 を notebook 委譲、独自再付与禁止）。実機確認を受入条件化。1行 revert ロールバック |
| R2 .empty/.emptyMemo | empty も維持が一貫 | Mi-2 .empty はスコープ外維持 | .empty/.dateHeading/.time=ゴシック維持／.emptyMemo は要件通り Klee化 | 🔵 .preview/.emptyMemo のみ font-family 削除（要件遵守）。.dateHeading/.time/.empty は --font-family-ui 維持 |
| R3 リロード state 喪失 | '/' fallback で安全 | Major M-1 UX劣化だが許容 | 文脈尊重価値 | 🔵 '/' フォールバック仕様として許容・spec 明記。sessionStorage 等は静けさ違反＝見送り |
| R3 実装手段 | リンク to={from}（navigate(-1)不採用） | 履歴汚染回避で to={from} 支持 | 直接遷移＝文脈尊重 | 🔵 `<Link to={from}>` 直接遷移。onClick/navigate ロジック不要 |
| R4 IME ガード | 一覧に入力欄なし＝構造流用のみ実害ゼロ | 構造流用なら可 | - | 🔵 EditorPage 判定ロジックをコピー流用。一覧に入力欄なしのため composition 監視は実装するが実質 no-op（流用一貫性のため形は残す） |
| R4 EditorPage 共通化 | EditorPage 据置コピー流用（不変制約） | フックを EditorPage は import しない（grep 確認）| - | 🔵 新規フックは Bookshelf/LogList のみ。EditorPage/MemoEditorPage は1文字も変更しない |
| R4 視覚フィードバック | - | 方向メンタルモデル M-4 | 瞬間遷移・フィードバック無し（静けさ） | 🔵 アニメ/インジケータ無し瞬間遷移。HeaderTabs opacity が遷移後状態を提示 |

## マイルストーン分割（垂直スライス・全 M 独立並列可）

実装推奨順（ROI/リスク昇順）: M2 → M3 → M1 → M4。各 M 単独で動作・コミット可能。

### M1: メモ編集を日記と同一体験に（R1）
「ユーザーがメモを日記と同じ手書き体＋罫線で書ける」
- M1-T1 🔵 MemoEditorPage.tsx: textarea className を `` `notebook-surface notebook-textarea ${styles.textarea}` `` に変更（EditorPage L391 同パターン）。設計意図コメント（L1-7 module.css / L26-36 tsx）を「ユーザー要望により日記と体験統一（Klee One+罫線）」へ更新（Mi-1）。
  - 受入: 🔵 textarea が notebook-surface/notebook-textarea を持つ。🔵 EditorPage/notebook.css/global.css 不変。
- M1-T2 🔵 MemoEditorPage.module.css: `.textarea` から font-family/font-size/line-height/letter-spacing/上下含む padding/border/outline/resize を削除（notebook へ委譲）。残すのは `flex:1 1 auto; width:100%; background-color:var(--color-bg); color:var(--color-text); -webkit-tap-highlight-color:transparent` のみ。左右 padding も notebook の `0 var(--padding-page)` へ委譲（独自再付与禁止＝C2）。`.surface` は不変（flex:1 1 auto; min-height:0; overflow-y:auto; display:flex）。
  - 受入: 🟡 上下 padding 独自指定が無い（C2 ベースライン）。🔵 自由高さ維持（var(--page-height-px)/min-height 60行を導入しない）。
- M1-T3 🔵 MemoEditorPage.test.tsx L155-158: `not.toMatch` を `expect(ta.className).toMatch(/notebook-textarea/)` へ反転、テスト名を「notebook クラスを持つ（日記と同一体験）」へ。コミットメッセージに反転理由明記。他テスト不変。
  - 受入: 🔵 当該テスト緑、MemoEditorPage.test.tsx 全緑、full-suite 回帰なし。
- 実機確認（受入の一部）: 🟡 1行目テキストと1本目罫線の位置／スクロール時罫線追従／空メモ罫線／長文(100行)罫線。

### M2: メモ一覧本文を手書き体に（R2）
「ユーザーが一覧でメモ本文を日記と同じ手書き体で読める」
- M2-T1 🔵 LogListPage.module.css: `.preview` と `.emptyMemo` から `font-family: var(--font-family-ui);` の行のみ削除（global body の --font-family=Klee One 継承）。`.dateHeading`/`.time`/`.empty` は変更しない（メタ情報＝ゴシック維持／情報階層）。
  - 受入: 🔵 .preview/.emptyMemo に font-family 宣言が無い。🔵 .dateHeading/.time/.empty は --font-family-ui のまま。🔵 一覧に罫線追加なし。
  - テスト方針: 🟡 vitest css:false で CSS 検証不可＝CSS 静的差分レビュー＋実機目視（一覧本文が手書き体）。テスト追加なし（既存 LogListPage.test 回帰のみ）。

### M3: 設定を「閉じる」で元画面へ（R3）
「ユーザーが設定を開いた元画面（本棚/メモ一覧）へ直接戻れる」
- M3-T1 🔵 BookshelfMenu.tsx L63: 設定 `<Link to="/settings" ...>` に `state={{ from: '/' }}` 追加。
- M3-T2 🔵 MemoMenu.tsx L57: 設定 `<Link to="/settings" ...>` に `state={{ from: '/log' }}` 追加。
- M3-T3 🔵 SettingsPage.tsx: `useLocation` を react-router-dom import に追加。`const from = (useLocation().state as { from?: string } | null)?.from ?? '/';`。L253 を `<Link to={from} className="app-header-link" aria-label="設定を閉じる">閉じる</Link>` に。
  - 受入: 🔵 本棚→設定→閉じる で `/`。🔵 メモ一覧→設定→閉じる で `/log`。🔵 直接URL/リロード→閉じる で `/`（fallback、仕様）。🔵 .app-header-link スタイル維持。
  - テスト方針: 🔵 SettingsPage.test（または新規）で MemoryRouter に state を持たせ「閉じる」リンクの to を検証。state 無し→ '/'。jsdom で検証可。既存テスト不変。

### M4: 本棚⇔メモ一覧 親指スワイプ切替（R4）
「ユーザーが親指の左右スワイプで本棚とメモ一覧を切り替えられる」
- M4-T1 🔵 新規 `/home/cocotte/dev/diary/src/hooks/useSwipeNavigation.ts`。
  - API: `useSwipeNavigation(opts: { onSwipeLeft?: () => void; onSwipeRight?: () => void; disabled?: boolean }): { onTouchStart: (e: React.TouchEvent) => void; onTouchEnd: (e: React.TouchEvent) => void }`
  - 内部: touchStartX/Y ref、isComposing ref（onComposition は呼び元で配線しないため実質 false 固定＝EditorPage 判定構造の流用一貫性のため形だけ保持）。判定は EditorPage L316-331 をコピー: disabled なら return／start null return／|dx|<SWIPE_THRESHOLD_PX(src/lib/constants) return／|dx|<=|dy|*2 return／dx<0→onSwipeLeft／dx>0→onSwipeRight。preventDefault しない（click/長押し非干渉＝M-2）。
  - 受入: 🔵 純粋関数的フック、EditorPage/MemoEditorPage を import しない（grep 確認）。🔵 SWIPE_THRESHOLD_PX を constants から import（新規定数増やさない）。
- M4-T2 🔵 BookshelfPage.tsx: `useNavigate` import 追加。`const swipe = useSwipeNavigation({ onSwipeLeft: () => navigate('/log'), disabled: showCalendar });` を root `styles.root` div に `{...swipe}` 展開。
- M4-T3 🔵 LogListPage.tsx: `useNavigate` import 追加。`useSwipeNavigation({ onSwipeRight: () => navigate('/'), disabled: showCalendar })` を root div に展開。
- M4-T4 🔵 テスト: BookshelfPage.test / LogListPage.test に swipe ヘルパ（MemoEditorPage.test L168-189 fireTouch/swipe 作法を流用）で「左/右スワイプで navigate」「縦優位/閾値未満で無反応」「showCalendar=true で無反応」を追加。useSwipeNavigation 単体テストも可。既存テスト不変。
  - 受入: 🔵 本棚で水平左スワイプ→/log、メモ一覧で水平右スワイプ→/。🔵 |dx|<50 or 縦優位 or showCalendar で無反応。🔵 既存スワイプ(EditorPage/MemoEditorPage)・既存テスト回帰なし。死蓄なし（フック→2画面で実呼出 grep 確認）。

## エッジケース対応表
| ケース | 対応 | 確信度 |
|---|---|---|
| /settings 直接URL/リロード | state 無し→'/' fallback（仕様・許容、spec 明記）| 🔵 |
| 設定「閉じる」連打 | Link 冪等、履歴増のみ実害小 | 🟡 |
| スワイプ中にモーダル開 | onTouchEnd 時に最新 disabled(showCalendar) 評価＝フック毎レンダ最新引数受領 | 🟡 |
| カード/メモ行上で横スワイプ | preventDefault しない＋|dx|>50 必須＝長押し/タップと両立。実機確認項目 | 🟡 |
| 縦スクロール vs スワイプ | |dx|<=|dy|*2 棄却で縦移動は無反応（EditorPage 実績閾値）| 🔵 |
| IME 変換中スワイプ | 一覧に入力欄なし＝発生せず。構造流用で形のみ保持 | 🔵 |
| 空メモ/超長文の罫線 | EditorPage と同一挙動（background-attachment:local 追従）。実機確認 | 🟡 |
| メモ罫線ベースラインずれ | EditorPage 構造同型化＋上下padding notebook 委譲。実機確認＋1行 revert | 🟡 |

## 実装時の注意事項
- 🔵 日記不可侵: EditorPage.tsx / notebook.css / global.css / 日記が使う既存 CSS 変数は1文字も変更しない。R1 は className 追加と MemoEditorPage 専用 module.css の減算のみ。
- 🔵 静けさ: 新規色トークン禁止／バッジ・件数カウンタ・トースト・スワイプアニメ/インジケータ禁止／transition 追加なし（瞬間遷移）。
- 🔵 DB/データモデル/メモのページ概念: 一切変更なし。
- 🔵 テスト規約: 削除禁止。M1-T3 は L157 の反転「更新」（削除でない）＝spec/コミットで仕様変更正当性を明記。他は追加のみ。fileParallelism:false 既設、fake-indexeddb×fake-timers 干渉箇所は触れない（本サイクルは editor 系テスト不変）。
- 🔵 死蓄関数防止: useSwipeNavigation の本番配線（BookshelfPage / LogListPage の2箇所）を grep 確認するまで M4 未完。
- 🟡 CSS 系受入（R1 罫線, R2 フォント）は vitest(css:false) で検証不可＝実機/preview 目視を受入条件に含める。
- 🔵 src/hooks/ ディレクトリ: 既存規約に沿い新規フックを配置（M7 で useAutoSave/useCursorRestore 削除済の可能性ありだがディレクトリ自体は構造上有効。実装時に存在確認し無ければ作成）。

## ロールバック
- M1: textarea className を元へ戻し module.css の削除分を git revert（1コミット revert で原状）。テスト反転も同コミット内＝一括 revert で整合。
- M2: module.css の font-family 2行を git revert（独立・最小）。
- M3: 3ファイルの追加分を git revert（state 付与・import・Link 変更）。
- M4: useSwipeNavigation 削除＋Bookshelf/LogList の3-4行 revert。EditorPage 無関係＝日記side影響ゼロ。
- 各 M 独立コミット＝個別 revert 可能。最もリスク高 M1(C2) は className 1行 revert で即時無害化。

## Plan Check（自己レビュー 1 回目）
1. 完全性: R1=M1, R2=M2, R3=M3, R4=M4 全要件にタスク対応 ✅
2. 実行可能性: 各タスクに対象ファイル・行・関数・className 具体記述 ✅
3. 依存整合性: 全 M 独立・相互依存なし、M1 内 T1→T2→T3 順序明示 ✅
4. リスク対応: C1→M1-T3 反転更新タスク化、C2→M1-T2 委譲＋実機受入、M-1→spec許容明記、M-3→M4 disabled 引数＋M4-T4 テスト ✅
5. テスト方針: M1-T3(反転), M3(state 検証 jsdom), M4-T4(swipe ヘルパ) 記述。M2 は CSS のため目視＋回帰（明記済）✅
6. スコープ逸脱: .empty 不変・EditorPage 不変・DB 不変・新規色なしを注意事項で固定。スコープ外タスクなし ✅

→ 全6項目合格。未解決事項なし。

## 未解決事項
なし（実機目視確認項目は受入条件として明示済。CSS 系は jsdom 限界のため Build/レビュー時に preview 目視で担保）。
