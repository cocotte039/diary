# Skeptic 分析（リスク・回帰・行動心理）

## Critical

### C1 既存テスト MemoEditorPage.test.tsx L157 が R1 と必ず矛盾 🔵
- 現象: `expect(ta.className).not.toMatch(/notebook-textarea|notebook-surface/)` が現状を「notebook クラス不在」で固定。R1 は notebook クラス付与＝このテストが必ず RED。
- 影響: R1 実装で既存テスト破壊。AGENTS.md「既存テスト削除・改変禁止（更新/追加のみ）」との緊張。
- 緩和策: 「削除」でなく「仕様変更に伴う検証の書換」＝ `expect(ta.className).toMatch(/notebook-textarea/)` 等へ更新。plan/spec で「R1 は体験統一仕様変更であり当該1テストは反転更新が正当」と明記し、コミットメッセージに理由記載。テスト名も「notebook クラスを持つ（日記と同一体験）」へ改名。M1 コミット内で同梱。
- 確信度: 🔵（コード実読で確定）

### C2 R1 罫線ベースラインずれ（jsdom で検証不能・実機リスク）🟡
- 現象: notebook.css は `padding:0 var(--padding-page)` 上下0＋`background-position:0 0`。現 .textarea は `padding:1rem ...`。上下 padding を 0 にすると1行目テキスト下端と1本目罫線の位置関係が変わる。.surface(overflow-y:auto)+textarea(flex:1 1 auto)+background-attachment:local の組合せが EditorPage(.surface スクロール+textarea min-height) と構造微差。
- 影響: 罫線と文字ベースラインが半行ずれる/1行目が罫線に食い込む可能性。CSS のため vitest(css:false) で検出不可＝実機/preview 確認必須。
- 緩和策: EditorPage の textarea ラッパ構造（.surface 直下 textarea に notebook-surface 付与、上下 padding は notebook 任せ）に厳密に合わせる。MemoEditorPage.module.css .textarea の上下 padding を notebook.css に委譲し独自に再付与しない。spec に「実機確認項目: 1行目罫線位置・スクロール時の罫線追従・空メモ時罫線」を必須チェックとして明記。ロールバックは className 1行 revert で即時可。
- 確信度: 🟡（CSS 静的解析では断定不可、構造同型化でリスク最小化）

## Major

### M-1 R3 リロード/直接URLで location.state 喪失 🔵
- 現象: HashRouter で /settings をリロード or 直接アクセスすると history.state が消え `state.from` undefined → '/' フォールバック。メモ一覧→設定→リロード→「閉じる」で本棚へ飛ぶ（メモ一覧に戻らない）。
- 影響: UX 劣化（軽微・例外経路）。データ破壊なし。
- 緩和策: 仕様として許容（fallback '/' は安全側）。spec に「リロード時は本棚へフォールバック＝既知の仕様」明記。代替（sessionStorage 記憶）は静けさ/最小主義に反し過剰＝見送り推奨。
- 確信度: 🔵

### M-2 R4 スワイプ vs 既存ジェスチャ競合 🟡
- 現象: BookshelfPage の VolumeCard は pointer events で長押し削除、LogListPage の MemoListItem はタップ遷移＋長押し削除。root div に onTouchStart/onTouchEnd 追加。横スワイプが長押し/タップを誤キャンセル、または逆。
- 影響: 長押し削除が暴発/不発、タップがスワイプ誤判定で遷移。
- 緩和策: スワイプ判定は touchEnd で完結し preventDefault しない（pointer/click を阻害しない）。|dx|<50 棄却＋|dx|<=|dy|*2 棄却で小移動・縦移動は無反応＝タップ/長押しと両立（EditorPage で実績ある閾値）。MemoListItem は longPressFiredRef でクリック抑止済、スワイプは navigate のみで干渉経路が分離。spec エッジに「カード上スワイプで長押し削除が出ないこと」を実機確認項目化。
- 確信度: 🟡（実機確認で確定）

### M-3 R4 showCalendar 中無効化の判定漏れ 🔵
- 現象: モーダル表示中に背後の root へスワイプが届き画面遷移＝モーダルが宙に浮く/二重遷移。
- 影響: モーダル中の誤遷移。
- 緩和策: フック引数 `disabled: showCalendar` を必ず渡し、onTouchEnd 冒頭で disabled なら即 return。両ページとも showCalendar state を渡す（grep で2箇所確認）。spec 受入条件に「showCalendar=true でスワイプ無反応」をテスト化（jsdom で state 制御可＝検証可能）。
- 確信度: 🔵

### M-4 R4 スワイプ方向のメンタルモデル 🟡
- 現象: HeaderTabs は「本棚 / メモ」の左→右並び。本棚で左スワイプ→メモ、メモで右スワイプ→本棚（要件指定）＝コンテンツが指と逆 or 同方向どちらの直感か曖昧。「本棚が左・メモが右」空間配置なら、本棚で左フリック（左の物を引き出す＝右の物=メモへ）は iOS の「次へ」(左スワイプで進む)と整合。
- 影響: 体感の良し悪し（破壊リスクなし）。要件で方向は確定済（本棚左→/log, メモ右→/）＝実装はその通り。
- 緩和策: 要件確定方向で実装。HeaderTabs 併存で発見性は担保＝スワイプ方向が直感外でもタブで救済可。実機体感確認のみ。
- 確信度: 🟡

## Minor

### Mi-1 R1/R2 体験分離設計の意図的破棄 🔵
- 現象: MemoEditorPage.module.css L1-7・MemoEditorPage.tsx L28-30 コメントが「日記=罫線/メモ=素の紙、ゴシックで差別化＝体験分離」を明示設計。R1/R2 はこれを意図的に覆す。
- 影響: 設計意図の逆転。ユーザー要望が最優先＝正当だが、コメント残置すると将来の混乱源。
- 緩和策: 当該コメントを「ユーザー要望により日記と体験統一（Klee One+罫線）」へ更新。R1 コミットで同梱。
- 確信度: 🔵

### Mi-2 R2 .empty(0件メッセージ)の扱い 🟡
- 現象: 要件は .preview/.emptyMemo のみ明記。.empty も font-family:var(--font-family-ui)。.empty を変えると0件画面が手書き体に。
- 影響: 軽微。.empty はメタUI＝.dateHeading/.time と同列で --font-family-ui 維持が一貫。
- 緩和策: .empty は変更しない（R2 スコープ外＝本文のみ統一の原則維持）。plan で明記。
- 確信度: 🟡

### Mi-3 R1 空メモ/超長文の罫線見え方 🟡
- 現象: 自由高さ＋notebook 罫線。空メモ→罫線が surface 全面に出る（EditorPage と同じ・許容）。超長文→.surface スクロールで background-attachment:local により罫線追従（notebook.css コメント通り設計済）。
- 影響: 視覚のみ。EditorPage で実績あり＝新規リスク低。
- 緩和策: 実機確認項目化（空メモ・10行・100行）。
- 確信度: 🟡

## エッジケース一覧
- 直接URL /settings → state なし → 「閉じる」が '/' へ（仕様・許容）🔵
- /settings リロード → 同上 🔵
- 設定→「閉じる」連打 → to={from} へ複数 navigate（リンク＝冪等、履歴は増えるが実害小）🟡
- スワイプ開始後モーダルを開く（タイミング競合）→ touchEnd 時に disabled 評価＝最新 showCalendar 参照（クロージャ鮮度注意：フックは毎レンダ最新 disabled を引数受領＝OK）🟡
- IME 変換中スワイプ（一覧に入力欄なし＝発生しないが構造流用）→ 実害ゼロ 🔵
- 空メモ罫線 / 超長文スクロール罫線追従 🟡
- PWA standalone で「閉じる」→ history.state 喪失頻度は通常ブラウザと同等 🟡
- スワイプ中に指がカード/メモ行上 → touchEnd で navigate のみ、click は別途発火しうる（二重遷移注意：スワイプ成立時 navigate 先と click 先が異なると不整合）→ 緩和: スワイプ成立は |dx|>50 必須＝意図的横移動。tap は |dx| 小＝棄却。重なりは実機確認 🟡

## 回帰リスク
- EditorPage/MemoEditorPage 既存スワイプ: フックは新規ファイル、EditorPage/MemoEditorPage は import しない＝完全不変（grep で import 不在を確認すること）🔵
- MemoEditorPage.test.tsx L157 のみ更新、他テスト不変 🔵
- LogListPage/BookshelfPage の既存テスト: root に onTouch 追加で getByTestId 等は不変、スワイプ未発火なら挙動同一＝回帰なし（既存テストが touch を発火していないこと確認）🟡
- notebook.css/global.css/EditorPage は1文字も変更しない（日記不可侵）🔵

## 確信度サマリ
- Critical: C1🔵（テスト必反転）, C2🟡（罫線実機）
- Major: M-1🔵 M-2🟡 M-3🔵 M-4🟡
- 最重要緩和: C1=テスト反転更新を spec/コミットで正当化、C2=EditorPage 構造同型化＋実機確認必須＋1行ロールバック、M-3=disabled 引数必須＋テスト化
