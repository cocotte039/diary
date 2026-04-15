# Plan — 1ページ当たり文字数上限の撤廃（2026-04-16）

## Goal

1. `CHARS_PER_PAGE`（1200 字）による**自動次ページ遷移を撤廃**する。
2. **最終ページロック**（1200 字超の `preventDefault`）を撤廃し、上限なしで書き続けられるようにする。
3. ユーザー任意タイミングでのページ切り替えを既存 `goPage` 経路（スワイプ / 矢印ボタン / PageUp/PageDown）で行う UX に一本化する。
4. 書く位置の把握補助として **25 行ごとに罫線をごくわずかに濃くする** 視覚アンカーを追加する。
5. 進捗バーは `Math.min(100, ...)` により 1200 字超で 100% 固定を維持する（現状のロジックで成立）。

**ユーザー原依頼**: スマホ表示で端末幅により最終行が中途半端な位置で次ページに送られる UX 問題を解消する。

## チーム構成

- **Pragmatist**: 削除範囲の最短経路、dead code 判定、既存テスト影響範囲、ROI 優先
- **Skeptic**: 超長文パフォーマンス、IME ガードの残置判断、既存データ互換、`saveVolumeText` の影響、退行リスク
- **Aesthete**: 25 行強調罫線の具体デザイン（0.14 opacity）、進捗バー 100% 固定の心理、記述リズムの変化

## Context（確認済みコード・現状）

### 削除対象の起点

- **`src/features/editor/EditorPage.tsx`**
  - L26: `import { splitAtCharLimit } from '../../lib/pagination'`
  - L93-96: `isComposingRef` / `pendingCursorPosRef`（前者残置・後者削除）
  - L125-136: 初期ロード useEffect 内の pendingCursorPos 復元処理
  - L200-243: `checkOverflowAndNavigate` 関数
  - L266: `handleChange` 内 `checkOverflowAndNavigate(value)` 呼び出し
  - L285-291: `handleCompositionEnd` 内 `checkOverflowAndNavigate(e.currentTarget.value)` 呼び出し（ref リセットは残す）
  - L301-332: `handleBeforeInput`（最終ページロック）
  - L409: `insertDate` 内 `checkOverflowAndNavigate(nextValue)` 呼び出し
  - L552: `onBeforeInput={handleBeforeInput}`

- **`src/lib/pagination.ts`**: `splitAtCharLimit` 関数（L56-75）は EditorPage 削除後 dead code 化 → 削除

- **`src/lib/pagination.test.ts`**: `splitAtCharLimit` describe（L89-137）は関数削除に伴い削除

- **`src/features/editor/EditorPage.test.tsx`**: 以下の旧仕様テスト合計 **約 10 テスト + 2 describe** を削除
  - `EditorPage IME composition guard (M6-T2)` の 3 件（composition 中の自動遷移関連、L412-438, L453-463）
  - `EditorPage auto next-page on overflow (M6-T3)` describe 全体（L466-551, 6 テスト）
  - `EditorPage final page lock (M6-T4)` describe 全体（L553-651, 5 テスト）
  - `EditorPage date insertion` の `日付挿入で 1200 字を超える場合、次ページへ自動遷移する`（L808-823）
  - **維持**: `composition 中の PageDown は遷移しない`（L440-451）、`progress bar` 全 5 件、その他全テスト

### 維持・変更なしの箇所

- `CHARS_PER_PAGE = 1200`（constants.ts）: 進捗バー計算・`splitIntoPages` の分割単位として維持
- `PAGES_PER_VOLUME = 60`: 維持
- `splitIntoPages` / `joinPages` / `saveVolumeText`: `db.ts` から参照、通常編集経路では使われないが維持
- `isComposingRef` / `handleCompositionStart` / `handleCompositionEnd`（ref リセットのみに縮小）: スワイプ（L456）と PageUp/PageDown（L440）の IME ガードで使用継続
- `progressPct = Math.min(100, Math.round((text.length / CHARS_PER_PAGE) * 100))`: 100 clamp は現状のまま正しい
- `useLayoutEffect` の `textarea.style.height = scrollHeight`（L250-255）: 長文対応の自動伸張ロジック維持

### 罫線 CSS（`src/styles/notebook.css`）

- 現状 L25-31: 1 行ごと罫線のみ（旧 15/30/45 行目強調は過去に廃止）
- 25 行ごと強調レイヤーを 2 枚目として追加（先頭 = 最前面）

## スコープ

### やること（🔵）

- EditorPage の自動次ページ遷移ロジック全削除（`checkOverflowAndNavigate` 関数と全呼び出し点）
- EditorPage の最終ページロック全削除（`handleBeforeInput` + onBeforeInput 配線）
- 関連する `pendingCursorPosRef` / `useEffect` 内復元コード削除
- `splitAtCharLimit` 関数とそのテスト削除
- 旧仕様テストの削除と新仕様テストの追加（TDD Red→Green）
- `src/styles/notebook.css` に 25 行ごと強調罫線レイヤー追加
- `src/types/index.ts` L34 のコメント修正（「最大 1200 字」→「目安 1200 字、上限なし」）
- Verify（実機確認）: スマホで 1200 字超書けること・進捗バー 100% 固定・25 行罫線の視認性・超長文パフォーマンス

### やらないこと（非目標）

- 既存冊の再ページング（🔵 合意済み）
- 明示的ページ区切り記号方式（🔵 合意済み）
- contenteditable 移行（🔵 合意済み）
- 進捗バー 100% 到達時の視覚変化追加（🟡 Aesthete 案 C、別サイクルで再検討）
- `saveVolumeText` の仕様変更（🔵 編集経路では未使用、復元経路のみ）
- GitHub 同期の最適化（🟡 長文化による転送量増、将来課題）
- `CHARS_PER_PAGE` 定数の削除（🔵 維持、進捗バー計算に使用）
- ライトテーマ対応の罫線トークン化（🟡 将来課題）

## 設計方針

### D1. 自動遷移ロジック削除（🔵）

`checkOverflowAndNavigate` 関数 + 全呼び出し点（`handleChange` / `handleCompositionEnd` / `insertDate`）を削除。

**理由**: ユーザー報告 UX 問題の根本原因。削除によりスマホでの「最終行中途半端」問題が解消。

### D2. 最終ページロック削除（🔵）

`handleBeforeInput` 関数 + `onBeforeInput` 属性配線を削除。

**理由**: 最終ページでも 1200 字超を書けるようにする（合意済み非目標の撤廃）。

### D3. pendingCursorPosRef 削除（🔵）

自動遷移が無くなるため不要。初期ロード useEffect（L100-141）内の pending 復元ブロックも削除。

### D4. IME ガードは維持（🔵）

`isComposingRef` / `handleCompositionStart` / `handleCompositionEnd`（ref 更新のみに縮小）は維持。
- スワイプ IME ガード（L456）
- PageUp/PageDown IME ガード（L440）

### D5. splitAtCharLimit 関数削除（🔵）

pagination.ts L56-75 の関数定義と pagination.test.ts L89-137 の describe を削除。

**配線検証**: 削除後に `grep splitAtCharLimit src/` で参照ゼロを確認する。

### D6. 25 行ごと強調罫線（🔵、Aesthete 主導）

`src/styles/notebook.css` の `.notebook-surface` の `background-image` を **2 レイヤー重ね** に変更:

```css
background-image:
  /* 25 行ごとの強調罫線（上レイヤー、通常罫線の Y にピッタリ重なり発色強化） */
  repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(25 * var(--line-height-px) - 1px),
    rgba(255, 255, 255, 0.14) calc(25 * var(--line-height-px) - 1px),
    rgba(255, 255, 255, 0.14) calc(25 * var(--line-height-px))
  ),
  /* 1 行ごとの通常罫線（下レイヤー、既存） */
  repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--line-height-px) - 1px),
    var(--color-rule) calc(var(--line-height-px) - 1px),
    var(--color-rule) var(--line-height-px)
  );
background-size:
  100% calc(25 * var(--line-height-px)),
  100% var(--line-height-px);
```

**色**: `rgba(255, 255, 255, 0.14)`（既存 `--color-rule` 0.08 から +0.06）。🟡 Verify で 0.12 / 0.14 / 0.16 を比較可能だが初期値は 0.14。

**配置**: 25 行目・50 行目の罫線が「通常罫線と同じ Y 座標」で重なる → 1 行ごとの連続性を崩さず発色のみ強化。

### D7. types/index.ts コメント修正（🔵）

L34 の `本文（\n 区切り、最大 CHARS_PER_PAGE=1200 文字）` を `本文（\n 区切り、目安 1200 文字、上限なし）` に変更。

### D8. db.ts コメント補足（🟡、任意）

`saveVolumeText` L213 のコメントに「冊全文保存経路専用。通常編集は savePage を使う」と明記（Skeptic C3 対策）。Pragmatist 観点では ROI 低めだが、将来の回帰防止として記録。→ **M1-T4 の範囲で軽微に実施**。

### D9. テスト方針（🔵）

#### D9.1 削除するテスト

| ファイル | describe / it | 行範囲 |
|---|---|---|
| `EditorPage.test.tsx` | `IME composition guard` の 3 件（composition 中/確定時の自動遷移、change の自動遷移） | L412-438, L453-463 |
| `EditorPage.test.tsx` | `auto next-page on overflow (M6-T3)` describe 全体（6 テスト） | L466-551 |
| `EditorPage.test.tsx` | `final page lock (M6-T4)` describe 全体（5 テスト） | L553-651 |
| `EditorPage.test.tsx` | `date insertion` の `日付挿入で 1200 字を超える場合、次ページへ自動遷移する` | L808-823 |
| `pagination.test.ts` | `splitAtCharLimit (M10)` describe 全体（8 テスト） | L89-137 |

#### D9.2 新規追加するテスト（TDD Red→Green→Refactor）

`EditorPage.test.tsx` に新 describe を追加:

```tsx
describe('EditorPage: no auto-navigation nor final-page lock (char-limit-removal)', () => {
  it('1201 字入力しても遷移せず、text はそのまま保持される', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(CHARS_PER_PAGE + 1) } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
    expect(textarea.value.length).toBe(CHARS_PER_PAGE + 1);
  });

  it('5000 字を一気に入力しても遷移しない', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(5000) } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
    expect(textarea.value.length).toBe(5000);
  });

  it('最終ページで 1201 字入力しても preventDefault されない', async () => {
    const v = await ensureActiveVolume();
    const fullPage = 'あ'.repeat(CHARS_PER_PAGE);
    await savePage(v.id, PAGES_PER_VOLUME, fullPage);
    renderAt(`/book/${v.id}/${PAGES_PER_VOLUME}`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(fullPage));
    fireEvent.change(textarea, { target: { value: fullPage + 'x' } });
    expect(textarea.value).toBe(fullPage + 'x');
  });

  it('日付挿入で 1200 字超になっても現ページに留まる', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(CHARS_PER_PAGE) } });
    textarea.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole('button', { name: '今日の日付を挿入' }));
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
    expect(textarea.value.length).toBeGreaterThan(CHARS_PER_PAGE);
  });

  it('1200 字超でも進捗バー aria-valuenow は 100 固定', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(CHARS_PER_PAGE + 300) } });
    const bar = screen.getByTestId('page-progress');
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '100'));
  });
});
```

#### D9.3 維持するテスト

- `EditorPage progress bar (M4-T3)` の全 5 テスト（L826-874）。特に `1300 文字の既存ページをロード → aria-valuenow=100（clamp）` は仕様維持の要。
- `EditorPage IME composition guard (M6-T2)` の `composition 中の PageDown は遷移しない` テスト（L440-451）
- `pagination.test.ts` の `splitAtCharLimit` 以外の全 describe
- `constants.test.ts` の全テスト（`CHARS_PER_PAGE === 1200` 維持）
- その他 EditorPage 基本操作テスト全て

#### D9.4 25 行罫線 CSS テスト

**実施しない**。CSS の文字列マッチは脆く ROI 低い。**Verify 工程の目視確認**で吸収。

### D10. Verify チェックリスト（🔵、実機手動）

#### 機能面
- [ ] 1200 字超の入力でページ遷移が起きない（iOS Safari / Android Chrome）
- [ ] 最終ページで 1201 字を書き込める
- [ ] 日付スタンプ挿入で 1200 字超えても現ページに留まる
- [ ] 進捗バーが 1200 字到達で 100%、それ以降変化しない
- [ ] 手動ページ送り（スワイプ / 矢印ボタン / PageUp/PageDown）が従来通り動作
- [ ] 既存ページ（1200 字以下）が従来通り表示・編集できる

#### 視覚面
- [ ] 25 行ごと罫線が視認できる（濃すぎず薄すぎず、0.14 が適切か確認）
- [ ] 強調罫線が通常罫線の Y 座標とピッタリ重なる（1 px ズレなし）
- [ ] スクロール時に罫線がテキストと同期する（`background-attachment: local`）
- [ ] iOS Safari / Android Chrome でレンダリング差がないか

#### パフォーマンス面（Skeptic C2）
- [ ] 5000 字入力時の入力遅延（60fps を大幅に下回らない）
- [ ] 10000 字入力時の入力遅延・スクロール性能
- [ ] 🟡 20000 字入力時（任意、極端ケース）

#### UX 心理面
- [ ] 「勝手にページが変わらない」違和感が 5〜10 分使って慣れるか
- [ ] 進捗バー 100% 固定が「書きすぎ警告」に見えないか（必要なら別サイクルで opacity 微変化を検討）

## 実装フェーズ

### M1: 1ページ文字数上限撤廃 + 25 行強調罫線（単一垂直スライス）

**垂直スライス原則**: M1 完了時点で「ユーザーは 1200 字超を書いて、任意のタイミングでページを切り替えられ、25 行ごとの視覚アンカーを持つ」。単体で価値を持つ完結した変更。

TDD 推奨順序（T1→T2→T3→T4 は Red→Green→Refactor）:

| タスク | 内容 | 変更対象 | 推定行数 | 確信度 | 依存 |
|---|---|---|---|---|---|
| **M1-T1** | 旧仕様テスト削除 | `EditorPage.test.tsx` L412-438, L453-463, L466-551, L553-651, L808-823 / `pagination.test.ts` L89-137 | −約 300 行 | 🔵 | なし |
| **M1-T2** | 新仕様テスト追加（RED） | `EditorPage.test.tsx` 末尾に新 describe | +約 70 行 | 🔵 | T1 |
| **M1-T3** | EditorPage 自動遷移/ロック削除（GREEN） | `EditorPage.tsx` L26/L96/L125-136/L200-243/L266/L288-291/L301-332/L409/L552 | −約 100 行 | 🔵 | T2 |
| **M1-T4** | splitAtCharLimit 削除 + 関連コメント整理 | `pagination.ts` L56-75 / `types/index.ts` L34 / `db.ts` L213 コメント | −約 25 行 | 🔵 | T3 |
| **M1-T5** | 25 行強調罫線 CSS 追加 | `notebook.css` L25-31 | +約 10 行 | 🔵 | なし（T3 と並列可） |
| **M1-T6** | typecheck + test:run 全緑確認 | - | 0 | 🔵 | T1-T5 |
| **M1-T7** | Verify（D10 チェックリスト） | なし（手動） | 0 | 🔵 | T6 |

### 各タスクの詳細

#### M1-T1: 旧仕様テスト削除

**変更対象**:
- `src/features/editor/EditorPage.test.tsx`: 以下 describe / it を削除
  - `EditorPage IME composition guard (M6-T2)` の 3 件（L412-424, L426-438, L453-463）← **describe 自体は残し `composition 中の PageDown` のみ残す**
  - `EditorPage auto next-page on overflow (M6-T3)` describe 全体 L466-551
  - `EditorPage final page lock (M6-T4)` describe 全体 L553-651
  - `EditorPage date insertion` の 1 件（L808-823）
  - 未使用 import があれば同時整理（`splitAtCharLimit` を test で import してる箇所はない）

**受入条件**:
- 削除後 `npm run test:run` が緑（T3 実装前なので、RED 化するテストがないこと = 削除対象が実装から参照されていないこと）
- 🔵 削除前後でテスト数が `約 −15 件` になる

**テスト方針**: このタスク自体がテスト削除なので、Red/Green の枠外。

#### M1-T2: 新仕様テスト追加（RED 確認）

**変更対象**: `src/features/editor/EditorPage.test.tsx` 末尾に D9.2 の新 describe を追加

**受入条件（RED）**:
- 🔵 `npm run test:run` で**新 describe 内の 5 テスト中、以下が FAIL する**:
  - `1201 字入力しても遷移せず、text はそのまま保持される` → 自動遷移が残っているので pathname が `/2` に変化 → FAIL
  - `5000 字を一気に入力しても遷移しない` → 同上 → FAIL
  - `最終ページで 1201 字入力しても preventDefault されない` → `handleBeforeInput` が残っているので value が `fullPage + 'x'` にならない可能性あり
  - `日付挿入で 1200 字超になっても現ページに留まる` → 自動遷移で pathname が `/2` → FAIL
  - `1200 字超でも進捗バー aria-valuenow は 100 固定` → progressPct は現状 clamp 済み → **PASS**（このテストは現状も通る = Green）

**注記**: 進捗バーテストは最初から Green だが、回帰防止のため残す。

#### M1-T3: EditorPage 自動遷移/ロック削除（GREEN）

**変更対象**: `src/features/editor/EditorPage.tsx`

**削除する要素**:
1. L26: `import { splitAtCharLimit } from '../../lib/pagination';`
2. L94-96: `pendingCursorPosRef` の宣言
3. L125-136: 初期ロード useEffect 内の pending 復元ブロック
4. L190-243: `checkOverflowAndNavigate` 関数（JSDoc 含む）
5. L266: `handleChange` 内の `checkOverflowAndNavigate(value);` 呼び出し
6. L285-291: `handleCompositionEnd` 内の `checkOverflowAndNavigate(e.currentTarget.value);` 呼び出し
   → 残すのは `isComposingRef.current = false;` のみ
7. L293-332: `handleBeforeInput` 関数（JSDoc 含む）
8. L408-409: `insertDate` 内の `checkOverflowAndNavigate(nextValue);` 呼び出しと IME ガード分岐
9. L552: `onBeforeInput={handleBeforeInput}` 属性

**受入条件（GREEN）**:
- 🔵 `npm run test:run` 全緑（M1-T2 の FAIL が全 PASS に転じる）
- 🔵 `npm run typecheck` エラーなし（未使用 import / unused-ref の警告なし）
- 🔵 grep で以下が 0 件:
  - `checkOverflowAndNavigate`
  - `pendingCursorPosRef`
  - `handleBeforeInput`
  - `splitAtCharLimit`（EditorPage.tsx 内）

**テスト方針**: 既存・新規テスト全緑化。自動遷移と最終ページロックの新仕様が GREEN。

#### M1-T4: splitAtCharLimit 削除 + コメント整理

**変更対象**:
- `src/lib/pagination.ts` L56-75: `splitAtCharLimit` 関数削除（JSDoc 含む）
- `src/types/index.ts` L34: コメント修正
  - 変更前: `本文（\n 区切り、最大 CHARS_PER_PAGE=1200 文字）`
  - 変更後: `本文（\n 区切り、目安 1200 文字、上限なし。進捗バー計算でのみ参照）`
- `src/lib/db.ts` L213: コメント補足
  - 変更前: `アクティブな Volume のテキスト全体を CHARS_PER_PAGE (1200 字) ごとに分割し、`
  - 変更後: `アクティブな Volume のテキスト全体を CHARS_PER_PAGE (1200 字) ごとに分割し、` の次行に `* 注意: 冊全文保存経路（DB 復元等）でのみ使用。通常の編集経路では savePage を使う。` を追加

**受入条件**:
- 🔵 grep で `splitAtCharLimit` が src/ 配下に残っていない（関数定義・import・テスト 全てゼロ）
- 🔵 `npm run test:run` 全緑
- 🔵 `npm run typecheck` エラーなし

**テスト方針**: T1 で関連テストは既に削除済みなので、追加作業なし。

#### M1-T5: 25 行強調罫線 CSS 追加

**変更対象**: `src/styles/notebook.css` L25-31（`.notebook-surface` の `background-image` / `background-size`）

**差分**: D6 の通り 2 レイヤー重ねに変更。

**受入条件**:
- 🔵 `npm run test:run` 全緑（CSS 変更はテストに影響しない）
- 🔵 `npm run build` 成功
- 🟡 Verify で 25 行目・50 行目の罫線が視認できること（濃度 0.14 が適切であること）

**テスト方針**: CSS テストは作らず、Verify で目視確認。

#### M1-T6: typecheck + test:run 全緑

**受入条件**:
- 🔵 `npm run typecheck`: exit 0
- 🔵 `npm run test:run`: 全テスト PASS（削除 × 約 15、追加 × 5、他全て維持）
- 🔵 `npm run build`: 成功

#### M1-T7: Verify（実機チェックリスト D10）

**受入条件**: D10 の機能面 6 項目 + 視覚面 4 項目 + パフォーマンス面 2 項目が OK。UX 心理面は「違和感が慣れる範囲」。

## 配線検証ポイント

| 検証項目 | コマンド | 期待結果 |
|---|---|---|
| splitAtCharLimit の参照消滅 | `grep -r splitAtCharLimit src/` | 0 件 |
| checkOverflowAndNavigate の参照消滅 | `grep -r checkOverflowAndNavigate src/` | 0 件 |
| handleBeforeInput の参照消滅 | `grep -r handleBeforeInput src/features/editor/` | 0 件 |
| pendingCursorPosRef の参照消滅 | `grep -r pendingCursorPosRef src/` | 0 件 |
| onBeforeInput 属性の消滅 | `grep onBeforeInput src/features/editor/EditorPage.tsx` | 0 件 |
| isComposingRef の参照維持 | `grep -n isComposingRef src/features/editor/EditorPage.tsx` | 3+ 件（compositionStart/End, keyDown, touchEnd で使用） |
| CHARS_PER_PAGE の残置 | `grep -n CHARS_PER_PAGE src/features/editor/EditorPage.tsx` | progressPct 計算のみ |
| 25 行罫線 CSS の追加 | `grep "25 \* var" src/styles/notebook.css` | 2 件（background-image と background-size） |

## リスクとその対策

| # | リスク | 深刻度 | 対策 |
|---|---|---|---|
| R1 | 超長文ページ（1万字+）の textarea パフォーマンス低下 | High | **Verify で 5k/10k 字を実機測定**。問題があれば別サイクルで rAF throttle 等を検討。本サイクルでは `useLayoutEffect` 依存配列 `[text, ready]` で最小化 |
| R2 | ユーザー任意ページ送りのタイミングが分からず混乱 | High | 25 行ごと強調罫線で視覚アンカーを提供。Verify で主開発者（ユーザー）が慣れるかを確認。説明追加は静けさ原則に反するので避ける |
| R3 | 進捗バー 100% 固定が「書きすぎ警告」に見える | Medium | 色・アニメーション追加せず現状維持。違和感が残れば別サイクルで opacity 微変化を検討（Aesthete 案 C） |
| R4 | pendingCursorPosRef 削除漏れで dead code 残存 | Medium | typecheck 実行、grep で全参照削除を確認 |
| R5 | IME ガード（isComposingRef）削除による回帰 | Medium | **残置する**（スワイプ・PageUp/PageDown で使用中）。handleCompositionEnd 内の自動遷移呼び出しのみ削除し ref リセットは残す |
| R6 | 既存 1200 字超データの不整合 | Low | 現状 1200 字超のページは存在し得ない（最終ページロックで制御されていた）。新仕様後は存在し得るが、progressPct は clamp 済み・表示は textarea の自動伸張で対応 |
| R7 | `saveVolumeText` が 1200 字超を分割 | Low | 編集経路は `savePage` を使うため該当せず。DB 復元経路のみの話なので本サイクルでは変更なし。コメント補足で将来の回帰防止 |
| R8 | 25 行強調罫線の濃度が実機で適切でない | Low | Verify で 0.12 / 0.14 / 0.16 を比較、違和感あれば小修正コミット |
| R9 | 25 行強調罫線がスクロール時に位置ズレ | Low | `background-attachment: local` を既存罫線と共有、同じ挙動になる想定。Verify で実機確認 |
| R10 | 削除したテストが実は隠れた仕様を担保していた | Low | 削除対象は全て「自動遷移」「最終ページロック」の廃止仕様に紐付く。これらは仕様自体を廃止するため担保不要 |

## 見送り事項とその理由

| 項目 | 理由 |
|---|---|
| 進捗バー 100% 到達時の視覚変化（色・opacity・アニメ） | 静けさ原則との整合性を Verify で確認してから別サイクルで検討 |
| 超長文時の rAF throttle 最適化 | 現時点で問題発生の確証なし。Verify で実測してから判断 |
| `saveVolumeText` の分割ロジック書き換え | 編集経路では未使用、DB 復元経路のみなので影響なし |
| GitHub 同期の転送量最適化（長文ページ対応） | 1 ページが大きくなるだけで同期は成立、パフォーマンス問題が出たら別サイクル |
| CSS トークン化（`--color-rule-emphasis` 等） | ライトテーマ対応が必要になった時に実施 |
| 25 行強調罫線の CSS 存在確認テスト | CSS の文字列マッチはテストとして脆く、Verify の目視で十分 |
| 既存冊の再ページング機能 | ユーザー合意済み非目標 |
| 明示的ページ区切り記号方式 | ユーザー合意済み非目標 |
| contenteditable 移行 | ユーザー合意済み非目標 |

## 実装時の注意事項

- **TDD 順序**: M1-T1（旧テスト削除）→ M1-T2（新テスト RED）→ M1-T3（実装 GREEN）→ M1-T4（クリーンアップ）→ M1-T5（CSS、独立）→ M1-T6（全緑）→ M1-T7（Verify）
- **コミット単位推奨**:
  1. M1-T1: `test(editor): 1200字自動遷移・最終ページロック関連テスト削除`
  2. M1-T2: `test(editor): 1200字超でも遷移しないテスト追加（RED）`
  3. M1-T3: `feat(editor): 1200字自動次ページ遷移と最終ページロックを撤廃`
  4. M1-T4: `refactor: splitAtCharLimit 削除 / コメント整理`
  5. M1-T5: `style(editor): 25行ごと罫線強調レイヤーを追加`
- **import の整理**: `EditorPage.tsx` から `splitAtCharLimit` を削除、`useCallback`/`useLayoutEffect` 等は他で使うので残す
- **型チェック**: `useLayoutEffect` の import は残す（textarea 自動伸張で使用）
- **静けさ原則の遵守**: 自動遷移廃止・ロック廃止で「勝手な動き」が減る方向なので原則強化。25 行罫線は視覚追加になるが濃度 0.14 の「ほぼ気づかない」レベルで整合
- **IME ガード残置の注意**: `handleCompositionEnd` は関数本体が `isComposingRef.current = false` のみになる。冗長に見えても削除しない（スワイプ・キー遷移の IME ガードに必要）
- **JSDoc 更新**: `handleCompositionEnd` / `insertDate` の既存 JSDoc から「自動遷移」への言及を削除
- **回帰テスト**: Verify で既存ユーザー操作（基本編集・ページ送り・日付挿入・戻るボタン）が全て従来通り動くこと

## 自己レビューループ結果（Plan Check）

### チェック 1 回目

1. **完全性**: ✅ 受入条件 5 項目（自動遷移撤廃 / 最終ページロック撤廃 / 任意ページ送り / 25 行強調罫線 / 進捗バー 100% 固定）すべてにタスク対応あり
2. **実行可能性**: ✅ 変更対象ファイル・行番号・具体差分（D1-D8）を提示済み、タスクごとに受入条件明記
3. **依存整合性**: ✅ T1→T2→T3→T4 は TDD 順序、T5 は独立、T6→T7 は検証順序。矛盾なし
4. **リスク対応**: ✅ Skeptic の Critical C1-C9 すべてに対策タスクあり（25 行罫線／Verify／pendingCursorPosRef 削除確認／IME ガード残置方針／コメント補足）
5. **テスト方針**: ✅ D9 で削除・追加・維持を明記、TDD Red→Green 条件も明記
6. **スコープ逸脱**: ✅ 「やらないこと」「見送り事項」に非目標（既存冊再ページング／contenteditable 移行／opacity 微変化／rAF throttle 等）を明記

**判定**: 6/6 合格。ループ終了。

## 未解決事項

なし。実装フェーズへ進行可能。

### 将来課題（次回以降のスコープ候補、記録のみ）

- 進捗バー 100% 到達時の視覚変化（opacity 微減等）
- 超長文時の rAF throttle / virtualization
- GitHub 同期の 1 ページ大容量化への最適化
- ライトテーマ追加時の強調罫線トークン化（`--color-rule-emphasis`）
- スタンプ挿入の「日付ごと自動改ページ」設定項目
