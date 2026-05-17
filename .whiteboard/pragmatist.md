# Pragmatist 分析（実用性・最短経路・シンプルさ）

> Analyst Lead が実読のうえ実用視点で記述（Task 不可環境のため自己実施）。

## タスク別評価

### 1. FAB位置上昇 — ROI 高 🔵
- 最短: `.fab` の `bottom` 1 行差し替え。`max(3.5rem, calc(env(safe-area-inset-bottom) + 3rem))`。
- 定数化不要（CSS の単発レイアウト値、constants.ts は JS 共有値専用）。過剰設計回避。
- 推定 1 行 + コメント 1 行更新。

### 2. 自動フォーカス — ROI 高 🔵
- 最小形: `textareaRef` 追加 + 既存ロード useEffect とは別に `ready` 依存 useEffect で `ref.current?.focus()`。
- rAF 不要（🟡）: 単純 focus はレイアウト確定後で十分。ただし編集時カーソル末尾配置を行うなら `setSelectionRange` を focus 直後に同期実行で足りる（EditorPage L275 の rAF はテキスト差替え後の復元用で文脈が異なる）。
- StrictMode 二重 effect 耐性: focus は冪等（二度呼んでも無害）。pushState ガードのような ref 不要。
- 既存 docstring L29「自動フォーカスなし（静けさ）」を実態へ更新（必須、嘘コメント化防止）。

### 3. ゴシック化 — ROI 高 🔵
- 2 ファイル各 1 行: `MemoEditorPage.module.css` L58 / `LogListPage.module.css` L67 を `var(--font-family-ui)` に。
- docstring/コメント更新: `MemoEditorPage.module.css` L1-6・L57、`MemoEditorPage.tsx` L28、`LogListPage.module.css` L58。「明朝」「素の紙=明朝」記述の事実整合（必須）。
- 罫線追加は非目標。スコープ厳守。

### 4. タップ背景ハイライト — ROI 中 🔵
- `.row:active` の `opacity:0.8` → `background-color` + `transition`。`.row` に `transition: background-color 150ms ease;` 追加、`:active` で淡色背景。
- 既存色のみ使用（新規色禁止）。`--color-rule`(rgba .08) は薄いが「静けさ」準拠。値は Aesthete 推奨に従う。
- 推定 4-5 行。

### 5. 右スワイプ戻る — ROI 中 🟡
- スワイプロジック共通化の是非: 現状 EditorPage のみ。**コピー実装で十分**（🔵）。理由: (a) ロジック差異あり（EditorPage は左右両方向 goPage、メモは右のみ navigate）、(b) 抽象化フックは 2 箇所目で導入が定石、(c) 共通化すると EditorPage 既存挙動への回帰リスク（非目標「日記 EditorPage 変更しない」に抵触可能）。
- 最短: `MemoEditorPage` に `touchStartXRef/YRef` + `onTouchStart/onTouchEnd`、`styles.root` div に配線（EditorPage はルート div 配線、同型）。
- IME ガード: MemoEditorPage は現状 `isComposingRef` を持たない。textarea に `onCompositionStart/End` で ref を立てる必要あり（追加配線）。EditorPage から作法のみ流用。
- 右(dx>0)→`await flush()`→`navigate(backTo)`: 既存 `handleBack` と同一パターン流用可（DRY: 内部処理を共通関数 `goBack()` に抽出し handleBack とスワイプ両方から呼ぶ）。
- 左スワイプ無反応（🟡 推奨）: メモは 1 画面、誤遷移防止で妥当。

## 推奨実装順（単一マイルストーン M1）
CSS 独立タスク（1,3,4）→ TSX タスク（2,5）。1,3,4 は相互独立で並行可。2 と 5 は同一ファイル MemoEditorPage.tsx のため連続実装し競合回避。

## 懸念
- 既存テスト `MemoEditorPage.test.tsx` L117-121 が自動フォーカス前提と矛盾 → テスト更新必須（Skeptic 詳述）。
- スワイプ共通関数 `goBack()` 抽出時、`handleBack` の `e.preventDefault()` は MouseEvent 固有 → 抽出は「flush→navigate の async 部」のみに留める。
