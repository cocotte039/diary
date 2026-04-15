# Pragmatist 分析 — 1ページ文字数上限撤廃

## 観点
最短経路・既存コード削除範囲・dead code 判定・ROI 優先・情報構造

## 1. 削除対象コード（🔵 grep で実地確認済み）

### 1.1 EditorPage.tsx

| 箇所 | 行 | 削除/変更内容 |
|---|---|---|
| `import { splitAtCharLimit }` | L26 | 削除（EditorPage から参照消滅） |
| `checkOverflowAndNavigate` 関数定義 | L200-243 | 関数ごと削除 |
| `handleChange` 内の `checkOverflowAndNavigate(value)` 呼び出し | L266 | 削除 |
| `handleCompositionEnd` 内の `checkOverflowAndNavigate(e.currentTarget.value)` | L288 | 削除（compositionEnd ハンドラ自体は残すが本体から同呼び出しを除去、空関数なら削除） |
| `handleBeforeInput` | L301-332 | 関数ごと削除（最終ページロック廃止） |
| `onBeforeInput={handleBeforeInput}` | L552 | 削除 |
| `insertDate` 内の `checkOverflowAndNavigate(nextValue)` | L409 | 削除 |
| `pendingCursorPosRef` | L96 | 削除（自動遷移が消えるので不要） |
| 関連する `useEffect` 内の pendingCursorPos 復元ロジック | L125-136 | 削除 |
| `isComposingRef` | L93 | **残す**（swipe IME ガード L456、keyDown L440 で使用中） |
| `handleCompositionStart` / `handleCompositionEnd` | L281-291 | **残す**（上記 ref 更新用）。ただし compositionEnd 内の再判定呼び出しは消える |

### 1.2 progressPct 計算 (L417-420)

```ts
// 現状
const progressPct = Math.min(
  100,
  Math.round((text.length / CHARS_PER_PAGE) * 100)
);
```
→ **変更なし**。`Math.min(100, ...)` で既に clamp されており 1200 字超は 100% 固定（要件通り）。

### 1.3 pagination.ts

`splitAtCharLimit` の参照箇所を grep で再確認:
- `src/lib/pagination.ts:64` 定義
- `src/lib/pagination.test.ts:8,89-137` テスト
- `src/features/editor/EditorPage.tsx:26,205` 呼び出し（本件で削除）

→ EditorPage から呼び出しが消えると **dead code**。**関数削除 + テスト削除** を推奨。
ただし `splitIntoPages` / `joinPages` / `saveVolumeText` / `countPages` / `getPageNumber` / `countLogicalLines` / `getScrollTopForCursor` は以下から引き続き参照される:
- `splitIntoPages` → `db.saveVolumeText` (db.ts L224) → `export.test.ts` / `db.test.ts` 経由
- その他は `useEditorCursor` などから参照

→ **維持**。

### 1.4 CHARS_PER_PAGE 定数

`CHARS_PER_PAGE = 1200` は以下で引き続き使用:
- `src/features/editor/EditorPage.tsx` progressPct 計算
- `src/lib/pagination.ts` splitIntoPages / countPages / getPageNumber（saveVolumeText 経由で DB 層が使用）
- `src/types/index.ts` L34 コメント

→ **維持**。ただし `types/index.ts` L34 のコメント「本文（\n 区切り、最大 CHARS_PER_PAGE=1200 文字）」は「最大」が嘘になるため「目安 1200 文字、上限なし」に書き換え。

## 2. 25 行ごと罫線強調の実装最短経路

### 2.1 CSS のみ（🔵 最短）

`src/styles/notebook.css` の `.notebook-surface` に 2 枚目の repeating-linear-gradient レイヤーを重ねる:

```css
background-image:
  /* 25 行ごとの強調罫線（視覚上の区切り、ごくわずかに濃い） */
  repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(25 * var(--line-height-px) - 1px),
    rgba(255, 255, 255, 0.14) calc(25 * var(--line-height-px) - 1px),
    rgba(255, 255, 255, 0.14) calc(25 * var(--line-height-px))
  ),
  /* 既存: 1 行ごとの通常罫線 */
  repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--line-height-px) - 1px),
    var(--color-rule) calc(var(--line-height-px) - 1px),
    var(--color-rule) var(--line-height-px)
  );
background-size: 100% calc(25 * var(--line-height-px)), 100% var(--line-height-px);
```

強調罫線の opacity は **0.14**（既存 `--color-rule` の 0.08 から +0.06、1-2 トーン濃い）。値は Aesthete と最終調整。

### 2.2 判断のポイント

- `background-attachment: local` は継承されるので追加指定不要
- 25 行ちょうどの罫線位置 = 通常罫線と同じ Y 座標 → 通常罫線の上にピッタリ重なって発色強化になる（ズレなし）
- CSS 変数化は不要（25 は固定マジックナンバーで良い。後で変えたければ 1 箇所書き換え）

## 3. テスト変更の最短経路

### 3.1 削除するテスト（EditorPage.test.tsx）

| describe / it | 行範囲 | 理由 |
|---|---|---|
| `EditorPage IME composition guard (M6-T2)` の `composition 中は 1201 字の入力で navigate しない` | L412-424 | 自動遷移廃止 |
| `EditorPage IME composition guard (M6-T2)` の `compositionEnd で最新値が 1201 字なら遷移する` | L426-438 | 自動遷移廃止 |
| `EditorPage IME composition guard (M6-T2)` の `composition 無しで 1201 字の change は即 navigate する` | L453-463 | 自動遷移廃止 |
| `EditorPage auto next-page on overflow (M6-T3)` describe 全体 | L466-551 | 自動遷移廃止 |
| `EditorPage final page lock (M6-T4)` describe 全体 | L553-651 | 最終ページロック廃止 |
| `EditorPage date insertion` の `日付挿入で 1200 字を超える場合、次ページへ自動遷移する` | L808-823 | 自動遷移廃止 |
| `EditorPage progress bar (M4-T3)` の `1300 文字の既存ページをロード → aria-valuenow=100（clamp）` | L863-873 | **残す**（progressPct clamp の要件に合致） |

**残すテスト**: composition 中の PageDown テスト（L440-451）は IME ガード自体が残るので維持。

### 3.2 新規テスト（EditorPage.test.tsx）

```tsx
describe('EditorPage no auto-navigation on overflow (char-limit-removal)', () => {
  it('1201 字入力しても遷移しない（現ページに留まる）', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(CHARS_PER_PAGE + 1) } });
    await new Promise((r) => setTimeout(r, 250));
    expect(pathname).toBe(`/book/${v.id}/1`);
    expect(textarea.value.length).toBe(CHARS_PER_PAGE + 1);
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

  it('1200 字超でも進捗バーは 100 に clamp される', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(CHARS_PER_PAGE + 300) } });
    const bar = screen.getByTestId('page-progress');
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '100'));
  });
});
```

### 3.3 pagination.test.ts の対応

`splitAtCharLimit` describe ブロック全体（L89-137）を削除。他の describe は維持。

### 3.4 notebook.css の罫線強調テスト

CSS テストは vitest 向かないので、**Verify 工程の目視確認** で吸収。ただし存在チェックとして以下を追加する案もある:

```ts
// src/styles/notebook.css の内容を fs で読み、`25 *` を含むかチェック
```

→ ROI 低い（CSS ファイル文字列マッチは脆い）。**不要**。

## 4. 配線検証ポイント

- `splitAtCharLimit` 削除後、grep で参照なしを確認
- `handleBeforeInput` 削除後、EditorPage.tsx 内で `onBeforeInput` 属性が無いことを確認
- `pendingCursorPosRef` 削除後、参照箇所がゼロであることを確認

## 5. ROI 評価

| タスク | 効果 | 実装コスト | ROI |
|---|---|---|---|
| 自動遷移ロジック削除 | UX 問題の根本解消 | 低（関数丸ごと削除） | 極高 |
| 最終ページロック削除 | 1200 字超の書き込み解放 | 低（関数丸ごと削除） | 高 |
| 25 行ごと強調罫線 | 書く位置の把握 | 低（CSS 1 箇所） | 中〜高 |
| dead code / 旧テスト削除 | コードベース健全化 | 低 | 中 |

## 6. フェーズ分割の提案

**M1 のみの単一マイルストーン** を推奨。垂直スライス「ユーザーは 1200 字超を書いて任意のタイミングでページを切り替えられる」。サブタスクで順序:

- T1: 旧テスト削除（RED 化を防ぐため先行、dead code 化したコードを含むテスト除去）
- T2: 新規テスト追加（RED 確認）
- T3: EditorPage 自動遷移/ロック削除（GREEN 化）
- T4: splitAtCharLimit 削除 + pagination.test.ts 更新
- T5: 25 行ごと強調罫線 CSS 追加
- T6: types/index.ts のコメント修正
- T7: 実機 Verify

## 7. 懸念事項（Pragmatist 観点）

- 既存の `isComposingRef` は swipe/key IME ガードで使い続けるため、composition ハンドラは完全削除できない。→ `handleCompositionEnd` は ref 更新のみに減らす。
- `handleCompositionStart` は変更不要、`handleCompositionEnd` は `checkOverflowAndNavigate` 呼び出しを削除して `isComposingRef.current = false` のみに。
- ファイル長が 564 行 → 約 470 行に短縮できる見込み。可読性向上。
