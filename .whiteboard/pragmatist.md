# Pragmatist 分析（実用性・最短経路・情報構造）

## 要件別分析

### R1 メモ編集を Klee One + 日記罫線に
- 🔵 最短経路: textarea の className を `notebook-surface notebook-textarea ${styles.textarea}` にする（EditorPage.tsx L391 と同パターン）。`.notebook-surface` が font-family/line-height/罫線/左右padding/背景を全て持つので、`styles.textarea` の独自指定（font-family/font-size/line-height/letter-spacing/padding）は削除する。
- 🔵 残すべき styles.textarea プロパティ: `flex:1 1 auto; width:100%; background-color/color`（surface flex 用）、`-webkit-tap-highlight-color:transparent`。border/outline/resize は notebook-textarea が持つので削除可。
- 🟡 罫線ベースライン整合の難所: notebook.css は `padding: 0 var(--padding-page)`（上下0）＋`background-position:0 0`＋`background-attachment:local`。メモは `.surface`(overflow-y:auto) が外側スクロール、textarea は内側で flex 伸長。EditorPage は textarea 自身 `notebook-surface` 付きで .surface スクロール → 同型にすれば罫線は文字と同期する（background-attachment:local が effect）。独自 padding:1rem を捨て上下0にすると1行目から罫線基準で揃う。
- 🟡 自由高さ維持: `var(--page-height-px)`(60行min-height) を入れないので、textarea は flex:1 1 auto で .surface 高さに追従。短文時は textarea が surface いっぱい＝罫線が画面全体に出る（EditorPage と同じ挙動、要件「自由高さ維持」と矛盾せず＝ページ概念を入れないだけ）。スクロールは内容超過時のみ.surface が処理。
- 🔵 推定変更: MemoEditorPage.tsx 1行（className）、MemoEditorPage.module.css ~10行削減。テスト L157 の更新必須（後述）。

### R2 メモ一覧本文フォント
- 🔵 最短: LogListPage.module.css の `.preview` `.emptyMemo` から `font-family: var(--font-family-ui);` 行のみ削除 → global の body 継承(--font-family=Klee One)。`.empty`(0件メッセージ)はメタUIなので要件外＝判断保留（要件は preview/emptyMemo のみ明記、empty は --font-family-ui 維持が一貫＝R2'と同列）。
- 🔵 `.dateHeading`/`.time` は --font-family-ui 維持（R2' 合意）＝変更なし。
- 🔵 推定変更: 2行削除のみ。最小。

### R3 設定「閉じる」
- 🔵 SettingsPage.tsx: `useLocation` を react-router-dom から追加 import。`const from = (useLocation().state as {from?:string}|null)?.from ?? '/';` を計算。`<Link to="/" className="app-header-link">本棚</Link>` を `<Link to={from} className="app-header-link" aria-label="設定を閉じる">閉じる</Link>` に。
- 🔵 BookshelfMenu.tsx L63 `<Link to="/settings" ...>` に `state={{ from: '/' }}` 追加。MemoMenu.tsx L57 同様に `state={{ from: '/log' }}`。
- 🟡 「閉じる」実装は navigate(-1) でなく明示 to={from}（履歴汚染回避・直接遷移要件「直接戻れる」に忠実）。リンクのままで十分（onClick 不要）。
- 🔵 推定変更: 3ファイル各1-3行。

### R4 本棚⇔メモ スワイプ共通フック
- 🔵 新規 src/hooks/useSwipeNavigation.ts。API 案:
  `useSwipeNavigation({ onSwipeLeft?: ()=>void; onSwipeRight?: ()=>void; disabled?: boolean }) => { onTouchStart, onTouchEnd }`
  内部: touchStartX/Y ref、isComposing は不要（一覧画面に IME 入力欄なし）だが要件で IME ガード流用指定 → document.activeElement や composition 監視は過剰。一覧にtextareaなし＝IME 発生せず。要件「IME ガード流用」は EditorPage ロジック流用の意で、実害なし。安全側で isComposing ref を内部に持ち onComposition 監視は省略（一覧に入力欄ゼロ）。→ 判断: IME ガードは「ロジック構造の流用」に留め、一覧では実質 no-op で可（Skeptic 確認事項）。
- 🔵 判定ロジックは EditorPage L316-331 をコピー流用（|dx|<SWIPE_THRESHOLD_PX 棄却、|dx|<=|dy|*2 棄却、dx<0=左/dx>0=右）。EditorPage 自体は不変（共通化で巻き込まない＝EditorPage はコピー元のまま据置、フックへ移行しない）。
- 🔵 BookshelfPage: `const swipe = useSwipeNavigation({ onSwipeLeft: ()=>navigate('/log'), disabled: showCalendar });` を root div に `{...swipe}` で展開。useNavigate 追加 import。
- 🔵 LogListPage: `useSwipeNavigation({ onSwipeRight: ()=>navigate('/'), disabled: showCalendar })`。useNavigate 追加。
- 🔵 死蓄防止: フックは BookshelfPage.tsx / LogListPage.tsx の2箇所で実呼出（grep 検証可）。
- 🔵 推定変更: 新規フック ~40行、Bookshelf/LogList 各 ~4行。

## マイルストーン分割評価
- M1 メモ罫線+フォント（R1）: 独立、垂直スライス「ユーザーがメモを日記と同じ見た目で書ける」。テスト更新含む。
- M2 メモ一覧フォント（R2）: 独立、最小。「一覧本文が手書き体になる」。
- M3 設定閉じる（R3）: 独立。「設定から元画面へ戻れる」。3ファイル横断だが小。
- M4 スワイプ切替（R4）: 独立、最大。「親指で本棚⇔メモ切替できる」。
- 🔵 4 つは相互依存なし＝並列実装可。推奨順は ROI/リスク順: M2(最小) → M3 → M1 → M4(最大・回帰要注意)。ただし全て独立なので順不同で可。各 M が垂直スライスとして単独で動作・コミット可能。M1+M2 はメモ視覚統一として連続実装が自然（テスト整合まとめやすい）。

## 推奨実装方針
1. notebook クラス流用は className 追加＋module.css 減算（増やさず削る＝静けさ・最小差分）
2. 共通フックは EditorPage を据置きコピー流用（EditorPage 不変制約を破らない最短）
3. R3 はリンク to={from} で十分（onClick/navigate ロジック不要）
4. テスト L157 は R1 と論理的に矛盾＝「notebook クラスを持つ」検証へ書換（削除でなく更新＝規約準拠）

## リスク・懸念（Pragmatist 観点）
- 🟡 R1 で .surface の overflow-y:auto と textarea の flex:1 1 auto。短文で罫線が全面に出る挙動は EditorPage と同一なので新規リスク低。ただし MemoEditorPage の .surface は `display:flex` で textarea を伸ばす設計＝ height:auto でなく flex 伸長。EditorPage は textarea に min-height(--page-height-px) があり構造差。メモは min-height 入れない→ textarea が surface に flex で 100% フィット → スクロールは内容>surface 時のみ。問題なし（むしろシンプル）。
- 🟡 R4 IME ガード: 一覧画面に入力欄なし＝実害ゼロ。フック内で composition 監視を実装すると過剰。構造流用に留める。
- 🟢 R3 リロード時 state 喪失は '/' フォールバックで安全（仕様内）。

## 確信度サマリ
- 🔵 R1 className 方式 / R2 行削除 / R3 リンク方式 / R4 フック2箇所配線・EditorPage据置
- 🟡 R1 罫線ベースライン実機確認要（CSS のみ jsdom 検証不可）/ R4 IME ガード省略可否
- 🔴 なし
