# Skeptic 分析（リスク・エッジケース・回帰）

> Analyst Lead が実読のうえ批判的視点で記述（Task 不可環境のため自己実施）。

## Critical

### C1. 既存テスト回帰: 自動フォーカステスト矛盾 🔵 Critical
`src/features/log/MemoEditorPage.test.tsx` L117-121:
```
it('マウント時 textarea が document.activeElement でない（自動フォーカスなし）')
  expect(document.activeElement).not.toBe(ta);
```
自動フォーカス実装で**確実に失敗**。
対策: このテストを「ready 後 textarea が自動フォーカスされる」へ書き換え（新規/編集両ケース）。docstring も更新。→ 専用タスクで対応（plan に明記）。

### C2. 右スワイプ戻り時の flush 未完了で入力ロスト 🔵 Critical
スワイプで `navigate(backTo)` を flush 前に呼ぶと直近入力（2 秒 debounce 内）が消える。
対策: `handleBack` と同じく `await flush()` 後に `navigate`。flush は冪等・await 可能（useMemoAutoSave L115-121 確認済み）。スワイプ用と handleBack で async 後処理を共通関数化。

## Major

### M1. IME 変換中スワイプ → 誤遷移 🔵 Major
MemoEditorPage は現状 `isComposingRef` 不在。日本語入力中の指の動きで誤って backTo 遷移し変換中テキスト喪失リスク。
対策: textarea に `onCompositionStart`/`onCompositionEnd` で `isComposingRef` を立て、`onTouchEnd` 冒頭で `if (isComposingRef.current) return`（EditorPage L322 同型）。

### M2. textarea 内テキスト選択/カーソル移動とスワイプ競合 🟡 Major
EditorPage は textarea 上でも発火許容（水平優位 2:1 + 閾値 50px で誤発火抑制）。メモも同方針なら、テキスト選択ドラッグ（横方向長押しドラッグ）が右スワイプ誤判定→戻り得る。
評価: EditorPage で既に許容運用実績あり、`SWIPE_THRESHOLD_PX=50` + `|dx|>|dy|*2` で実害低と判断。ただしメモは「戻る＝画面離脱」で誤爆コスト大（ページ送りより重い）。
緩和（🟡 推奨）: 既存作法そのまま流用（追加ガードは過剰）。ただし backTo 遷移前に flush するため最悪でも入力は保存される（C2 対策が緩和を兼ねる）。

### M3. 自動フォーカス時 iOS Safari スクロール飛び/キーボード即時展開 🟡 Major
編集ページを「読む」目的で開いた場合もキーボード即展開＝認知ノイズ（静けさ抵触懸念）。スクロール飛び（focus 時 scrollIntoView）も。
評価: ユーザー要件で新規/編集とも自動フォーカス明示合意済 → 仕様として受容。
緩和: `focus({ preventScroll: true })` 指定でスクロール飛び抑制（🔵 低コスト）。

### M4. 編集時カーソルが本文先頭/末尾 🟡 Major
`focus()` 単独だと選択範囲はブラウザ依存（多くは先頭 or 全選択）。編集再開時は末尾カーソルが自然。
対策: 編集時(`!isNew` かつ content 非空)は `setSelectionRange(len, len)` を focus 直後に。新規は空なので不要。

## Minor

### m1. StrictMode 二重 effect 🔵 Minor
focus 二重呼び出しは冪等・無害。pushState ガードは既存 `historyGuardInstalledRef` で対処済（本変更は触れない）。スワイプ touch ハンドラは addEventListener ではなく JSX prop なので二重登録なし。→ 追加対策不要。

### m2. ゴシック化でレイアウトずれ 🟡 Minor
`font-family` のみ変更。`font-size`/`line-height`/`letter-spacing` は CSS 変数で不変。明朝→sans の字幅差で `.preview` 2 行 clamp の改行位置が僅かに変わるが機能影響なし。許容。

### m3. FAB 上昇による重なり回帰 🔵 Minor
bookshelf 配下に A2HS バナー要素なし（grep 0 件）。FAB は z-index:50 fixed。+2.25rem 上昇でも一覧スクロール末尾は body padding-bottom:2rem 確保（LogListPage は別画面、FAB は BookshelfPage のみ）。重なり実害低。

### m4. テスト assert のフォント名/opacity 依存 🔵 Minor
- `BookshelfPage.test.tsx` FAB テスト L492-517: aria-label と遷移のみ、bottom 値非依存 → 回帰なし。
- `LogListPage.test.tsx`: タップ遷移はクリックイベント、`:active` 背景・opacity 非依存 → 回帰なし。
- 明朝フォント名を assert するテストは全 3 ファイルに**存在せず** → ゴシック化で回帰なし。
- 唯一の回帰は C1 のみ。

## 検証必須
全変更後 `npm test`（vitest）グリーン、特に MemoEditorPage.test.tsx 全件。
