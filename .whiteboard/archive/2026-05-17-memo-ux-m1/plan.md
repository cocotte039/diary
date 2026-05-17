# 実装計画: 観測ログ（メモ）機能 UX 改善

> 本ファイルは Analyst Lead のみ記入。策定中（分析チーム出力待ち）。

## Goal

PWA日記アプリ「ノート」の観測ログ（メモ）機能の UX を、デザイン原則「静けさ」を維持したまま改善する。

合意済み 5 改善:
1. FAB（ペンアイコン）位置を中程度上昇（親指リーチ改善）
2. メモ編集ページ自動フォーカス（新規/編集とも）
3. ゴシック化（明朝→`--font-family-ui`、罫線追加はしない）
4. 一覧タップの背景ハイライト（opacity→淡背景、≤200ms）
5. 右エッジスワイプで戻る追加（左上「戻る」存置）

## Context（実読済み・確信度付き）

- 🔵 FAB CSS: `src/features/bookshelf/BookshelfPage.module.css` `.fab` L139-160。現状 `bottom: max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))`。FAB 本体 `src/features/bookshelf/Fab.tsx`（純表示、navigate('/log/new', {state:{from:'/'}})）
- 🔵 MemoEditorPage `src/features/log/MemoEditorPage.tsx`: ready/flush/backTo/popstate ガード構造。textarea L160-170（ref 無し）。冒頭 docstring L29「自動フォーカスなし（静けさ）」/ L52-53 StrictMode 二重 pushState ガード ref。flush は useMemoAutoSave 由来
- 🔵 MemoEditorPage CSS `src/features/log/MemoEditorPage.module.css`: `.textarea` L49-65 明朝 `'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif` L58。docstring L1-6 に明朝言及
- 🔵 一覧 `src/features/log/MemoListItem.tsx`: Pointer ベース長押し/タップ。`navigate('/log/'+id, {state:{from:'/log'}})`。CSS `LogListPage.module.css` `.row:active{opacity:0.8}` L44-46、`.preview` 明朝 L67
- 🔵 スワイプ作法 `src/features/editor/EditorPage.tsx` L288-331: onTouchStart/onTouchEnd, `SWIPE_THRESHOLD_PX`(=50, constants.ts L38), 水平優位 `|dx|>|dy|*2`, `isComposingRef` ガード, ルート div に `onTouchStart/onTouchEnd`
- 🔵 `src/styles/global.css` L20 `--font-family-ui: system-ui,-apple-system,'Hiragino Sans',sans-serif`、L12 `--color-rule: rgba(255,255,255,0.08)`、4色パレット L9-16
- 🔵 既存テスト: MemoEditorPage.test.tsx / LogListPage.test.tsx / BookshelfPage.test.tsx

## チーム構成

タスク特性: 小規模 UI/UX 改善（CSS 値変更 + 軽量イベント配線）。新規ロジック少、回帰/触覚・認知体験リスクが論点。
→ 分析チーム 3 名（Pragmatist / Skeptic / Aesthete）並列起動。

---

## 分析統合（3視点）

### 合意点
- 全 5 変更は「静けさ」4色・≤200ms・通知/バッジ無しを維持（Aesthete 🔵）。新規色追加なし。
- FAB・ゴシック化・フォーカスは ROI 高、低リスク（Pragmatist）。
- スワイプは EditorPage ロジックをコピー実装（共通化はしない＝非目標「日記 EditorPage 変更しない」抵触回避、2 箇所目で抽象化が定石）（Pragmatist 🔵）。

### 対立点と判断
- **ゴシック化のコンセプト喪失**（Aesthete 🟡「明朝＝素の紙」情緒喪失 vs 可読性）: ユーザー協議で確定済 + 観測ログは素早い記録/参照用途で可読性優先が妥当。日記(Klee One)との体験分離は sans でも保たれる。→ **採用**。docstring は「素の紙（ゴシック・可読性優先）」へ趣旨更新。
- **タップハイライト色** = `--color-rule`(薄すぎ Aesthete 🟡) vs `--color-accent`。→ Aesthete 推奨の **`--color-accent`(#3a3545)** 採用（新規色禁止に適合、知覚可能、press 中 150ms のみで強すぎない）。要件原文の「`--color-rule` 系」より知覚性を優先（判断根拠: 背景 #1c1c20 上で rule rgba .08 は不可視に近い）。
- **編集時カーソル位置**（Skeptic M4）: `focus()` 単独はブラウザ依存 → 編集時は末尾 `setSelectionRange(len,len)`。新規は空で不要。→ **採用**。

### Critical（必ず対策タスク化）
- **C1**: `MemoEditorPage.test.tsx` L117-121「自動フォーカスなし」テストが実装と矛盾し確実に失敗 → テスト書き換えタスク（T6）必須。
- **C2**: スワイプ戻り時 flush 前 navigate で入力ロスト → `await flush()` 後に navigate（handleBack と同パターン、T5 で対応）。

---

## 実装計画 — マイルストーン M1（単一）

小規模 UI/UX 改善。CSS 独立タスク（T1/T3/T4）→ TSX タスク（T2/T5）→ テスト（T6）。
T2/T5 は同一ファイル `MemoEditorPage.tsx` のため連続実装し競合回避。UI/CSS 値変更は実装先行、テスト可能なフォーカス/スワイプ挙動は実装後 T6 でテスト更新（既存テスト矛盾解消含む）。

### T1. FAB位置上昇 🔵 ROI高
- 変更: `src/features/bookshelf/BookshelfPage.module.css` `.fab`(L142)
  `bottom: max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))`
  → `bottom: max(3.5rem, calc(env(safe-area-inset-bottom) + 3rem))`
- コメント: L135-138 ブロックに位置調整意図を 1 行追記（親指リーチ）。
- 受入条件:
  - [ ] 🔵 `.fab` の bottom が新値
  - [ ] 🔵 `right`/`width`/`height`/色/transition 不変（静けさ維持）
  - [ ] 🔵 `BookshelfPage.test.tsx` FAB テスト(L492-517: aria-label/遷移) グリーン維持
- テスト方針: CSS 値のみ、専用テスト追加不要（既存遷移テストで回帰検知）。
- リスク: m3（重なり）= bookshelf に A2HS バナー無し、実害低。

### T2. メモ編集ページ自動フォーカス 🔵 ROI高
- 変更: `src/features/log/MemoEditorPage.tsx`
  - `const textareaRef = useRef<HTMLTextAreaElement>(null);` 追加
  - textarea(L160-170) に `ref={textareaRef}`
  - 新規 useEffect 追加（既存ロード effect とは分離）:
    ```ts
    useEffect(() => {
      if (!ready) return;
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus({ preventScroll: true });          // M3: スクロール飛び抑制
      if (!isNew && content.length > 0) {           // M4: 編集時カーソル末尾
        ta.setSelectionRange(content.length, content.length);
      }
    }, [ready, isNew]);                              // content 依存にしない（入力毎再フォーカス防止）
    ```
  - docstring L29「自動フォーカスなし（マウント時 focus しない, 静けさ）」→「ready 後 textarea を自動フォーカス（書く所作の摩擦最小化）。編集時はカーソル末尾」
- 関数シグネチャ: 追加 effect のみ、公開 API 変更なし。
- Key Links（本番配線）: `MemoEditorPage` は `App.tsx` ルート `/log/new`・`/log/:memoId` に配線済（既存）。textareaRef は同コンポーネント内 textarea に直結（dead code なし）。
- 受入条件:
  - [ ] 🔵 /log/new 描画後 textarea が `document.activeElement`
  - [ ] 🔵 /log/:id 描画・ロード後 textarea がフォーカス、カーソルが content 末尾
  - [ ] 🟡 StrictMode 二重 effect でエラー無し（focus 冪等）
  - [ ] 🔵 docstring が実態と一致
- テスト方針: T6 で既存「自動フォーカスなし」テストを「ready 後フォーカスされる（新規/編集・編集はカーソル末尾）」へ書換。
- リスク: M3（要件受容・preventScroll 対策済）、M4（末尾カーソル対策済）。

### T3. ゴシック化（罫線追加なし＝非目標厳守）🔵 ROI高
- 変更:
  - `src/features/log/MemoEditorPage.module.css` `.textarea`(L58)
    `font-family: 'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif;`
    → `font-family: var(--font-family-ui);`
    L57 コメント「明朝系（メモ=素の紙）。日記の Klee One…」→「ゴシック（可読性優先）。日記の Klee One 手書き体と差別化」
  - 同ファイル docstring L1-6「明朝フォントで日記と差別化」→「ゴシック（可読性優先）で日記と差別化」
  - `src/features/log/LogListPage.module.css` `.preview`(L67) 同様に `var(--font-family-ui)`、L58 コメント更新
  - `src/features/log/MemoEditorPage.tsx` docstring L28「明朝でない」言及なし（罫線記述のみ）→ 変更不要（確認: L28 は罫線文。フォント言及は CSS 側のみ）
- 受入条件:
  - [ ] 🔵 `.textarea`/`.preview` が `var(--font-family-ui)`
  - [ ] 🔵 罫線クラス追加なし（非目標厳守、`MemoEditorPage.test.tsx` L137-141 グリーン維持）
  - [ ] 🔵 `font-size`/`line-height`/`letter-spacing` 不変
  - [ ] 🔵 関連コメント/docstring が実態一致
- テスト方針: フォント名 assert するテスト無し（全 3 テスト確認済）→ 専用テスト不要、既存グリーン維持で十分。
- リスク: m2（字幅差で clamp 改行位置僅差、機能影響なし・許容）。

### T4. 一覧タップ背景ハイライト 🔵 ROI中
- 変更: `src/features/log/LogListPage.module.css`
  - `.row`(L38-43) に追加: `transition: background-color 150ms ease;`
  - `.row:active`(L44-46) `opacity: 0.8;` → `background-color: var(--color-accent);`
  - L25 付近コメントに「タップ時 accent 背景で控えめ触覚フィードバック（静けさ: 既存色・150ms）」
- 受入条件:
  - [ ] 🔵 `.row:active` が `background-color: var(--color-accent)`、opacity 指定削除
  - [ ] 🔵 `.row` に transition ≤200ms（150ms）
  - [ ] 🔵 新規色なし（既存 `--color-accent` 使用）
  - [ ] 🔵 `LogListPage.test.tsx` タップ遷移/長押しテスト グリーン維持（:active は click/pointer に非依存）
- テスト方針: CSS 値、専用テスト不要。既存タップ遷移テストで回帰検知。
- 注記: `border-radius` 追加は任意（Aesthete 提案）。最小変更優先で **background のみ**採用、border-radius は見送り（スコープ最小化）。

### T5. 右エッジスワイプで戻る 🟡 ROI中
- 変更: `src/features/log/MemoEditorPage.tsx`
  - ref 追加: `touchStartXRef`/`touchStartYRef`（`useRef<number|null>(null)`）、`isComposingRef`（`useRef(false)`）
  - 既存 `handleBack` の async 部（flush→navigate）を共通関数化:
    ```ts
    const goBack = useCallback(async () => {
      try { await flush(); } catch { /* 保存失敗でも遷移継続 */ }
      navigate(backTo);
    }, [flush, navigate, backTo]);
    const handleBack = useCallback((e: React.MouseEvent) => {
      e.preventDefault(); void goBack();
    }, [goBack]);
    ```
  - textarea に `onCompositionStart={() => { isComposingRef.current = true; }}`
    `onCompositionEnd={() => { isComposingRef.current = false; }}`
  - `styles.root` div（L135）に `onTouchStart`/`onTouchEnd`（EditorPage L291-331 同型）:
    ```ts
    const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0];
      touchStartXRef.current = t ? t.clientX : null;
      touchStartYRef.current = t ? t.clientY : null;
    };
    const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
      const sx = touchStartXRef.current, sy = touchStartYRef.current;
      touchStartXRef.current = null; touchStartYRef.current = null;
      if (sx == null || sy == null) return;
      if (isComposingRef.current) return;                 // M1: IME 中無効
      const t = e.changedTouches[0]; if (!t) return;
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dx) <= Math.abs(dy) * 2) return;       // 水平優位 2:1
      if (dx > 0) void goBack();                           // 右スワイプ→戻る（C2: goBack が flush）
      // 左スワイプは無反応（メモ1画面）
    };
    ```
  - import: `SWIPE_THRESHOLD_PX` from `../../lib/constants`
- 関数シグネチャ: `goBack: () => Promise<void>` 追加。`handleBack` は `goBack` 委譲に変更（外部 API 不変）。
- Key Links（本番配線）: `onTouchStart`/`onTouchEnd` は `styles.root` div（return 文の最上位要素、テストで data-testid="memo-editor-page"）に JSX prop 配線 → 本番レンダリングパスに直結。`goBack` は handleBack（戻るリンク onClick）と onTouchEnd の両方から呼ばれ dead code 無し。
- 受入条件:
  - [ ] 🔵 右スワイプ（dx>SWIPE_THRESHOLD_PX, 水平優位2:1）で `flush()` 後 `navigate(backTo)`
  - [ ] 🔵 戻るリンク click も従来通り flush→navigate（goBack 経由・挙動不変）
  - [ ] 🔵 IME 変換中（isComposingRef true）はスワイプ無反応（M1）
  - [ ] 🔵 左スワイプ無反応
  - [ ] 🔵 水平閾値未満/縦優位スワイプ無反応（縦スクロール干渉なし）
  - [ ] 🟡 既存 popstate ガード/StrictMode と非干渉（touch は JSX prop、addEventListener 不使用）
- テスト方針（T6 に集約）: MemoEditorPage.test.tsx に touch イベント発火テスト追加。JSDOM touch は `createEvent` + defineProperty で touches/changedTouches を強制（LogListPage.test の firePointer 作法を touch 用に応用）。ケース: 右スワイプ→backTo 遷移+保存 / 縦優位→無反応 / IME 中→無反応 / 既存戻るリンク回帰。
- リスク: M2（テキスト選択ドラッグ競合）= EditorPage 実績 + 50px/2:1 閾値 + goBack が flush で入力保護 → 追加ガード不要（過剰回避）。

### T6. テスト更新・追加（C1 解消含む）🔵 ROI高（回帰防止）
- 変更: `src/features/log/MemoEditorPage.test.tsx`
  - L117-121「マウント時 textarea が document.activeElement でない」を**削除**し、以下へ置換:
    - 「/log/new で ready 後 textarea が自動フォーカスされる」（`document.activeElement === ta`）
    - 「/log/:id（既存）で ready 後 textarea がフォーカスされカーソルが content 末尾」（`ta.selectionStart === ta.value.length`）
  - スワイプテスト追加（T5 テスト方針参照）: 右スワイプ戻り+保存 / 縦優位無反応 / IME 中無反応 / 戻るリンク回帰維持
- 受入条件:
  - [ ] 🔵 旧「自動フォーカスなし」テスト除去（実装と矛盾解消）
  - [ ] 🔵 新フォーカステスト（新規/編集）グリーン
  - [ ] 🔵 スワイプ全ケースグリーン
  - [ ] 🔵 既存他テスト（addMemo/flush/不正id/罫線なし/createdAt）全グリーン
- テスト方針: 既存 `renderAt` ヘルパ流用。touch は createEvent + defineProperty。fake timers 不使用（既存同様実時間 + AUTOSAVE_DEBOUNCE_MS+3000 タイムアウト）。

---

## エッジケース対応一覧

| ケース | 対応タスク | 方針 |
|---|---|---|
| IME 中スワイプ誤遷移 | T5 | `isComposingRef` ガード（onCompositionStart/End）🔵 |
| textarea 選択操作×スワイプ競合 | T5 | 50px 閾値+水平優位2:1+goBack flush で保護、追加ガード無し 🟡 |
| フォーカス時スクロール飛び | T2 | `focus({preventScroll:true})` 🔵 |
| StrictMode 二重 effect | T2/T5 | focus 冪等・touch は JSX prop で二重登録なし 🔵 |
| 編集時カーソル先頭飛び | T2 | `!isNew && content.length>0` で末尾 setSelectionRange 🔵 |
| スワイプ flush 前 navigate 入力ロスト | T5 | `goBack` で `await flush()` 後 navigate（C2）🔵 |
| FAB 上昇の重なり | T1 | bookshelf にバナー無し、実害低（m3）🔵 |
| 明朝→sans clamp 改行位置僅差 | T3 | 機能影響なし、許容（m2）🟡 |

## 見送り事項
- スワイプロジック共通化（フック抽出）: 2 箇所目だが EditorPage 挙動差大 + 非目標抵触リスク。コピー実装。
- `.row` border-radius 追加: スコープ最小化、background のみ。
- 左スワイプ動作: メモ 1 画面、無反応が正。
- 保存/キャンセル明示 UI、罫線追加、新規色: 非目標厳守。

## 検証コマンド
- 型/Lint: `npm run build`（tsc）/ `npm run lint`（存在すれば）
- テスト: `npm test`（vitest）— 特に `src/features/log/MemoEditorPage.test.tsx`・`LogListPage.test.tsx`・`src/features/bookshelf/BookshelfPage.test.tsx` 全グリーン
- 単体: `npx vitest run src/features/log/MemoEditorPage.test.tsx`
- 手動（実機/エミュ推奨）: FAB 親指到達 / 編集ページ即フォーカス（新規・編集でカーソル末尾）/ ゴシック表示 / 一覧タップ背景沈み / 右スワイプ戻り（IME 中無反応・入力保存確認）

---

## Plan Check（自己レビュー 1 回目）

1. 完全性: 合意 5 改善 → T1-T5、回帰対策 → T6。全受入条件カバー。✅
2. 実行可能性: 各タスクに変更ファイル・行番号・関数シグネチャ・差分コード明記。曖昧さなし。✅
3. 依存整合性: CSS(T1/T3/T4)独立、T2→T5 同ファイル連続、T6 は T2/T5 後。矛盾なし。✅
4. リスク対応: Critical C1→T6、C2→T5 goBack。Major M1/M3/M4 各タスクで対策明記。✅
5. テスト方針: 各タスクにテスト方針記載。CSS は既存回帰検知、挙動は T6 で明示。✅
6. スコープ逸脱: 見送り事項で非目標明記、border-radius/共通化を意図的除外。逸脱なし。✅

→ 全項目合格。未解決事項なし。実装フェーズ移行可。

