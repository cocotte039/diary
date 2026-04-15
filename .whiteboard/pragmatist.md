# Pragmatist 観点（要約）

## 最短経路の評価

- 要件は既に十分合意済み。「行→文字」への置換は機械的に実施可能。
- 視覚行オーバーフロー保険（scrollHeight 参照）を廃止できるため、`checkOverflowAndNavigate` の複雑度が下がる純減分あり。
- `LINES_PER_PAGE` → `CHARS_PER_PAGE` のリネームは、罫線や紙の高さ計算で使う「60 行」の用途と衝突する。罫線用定数は別名で残すのが合理的。

## 定数分離の提案

| 用途 | 新名 | 値 | 備考 |
|---|---|---|---|
| ページ文字上限 | `CHARS_PER_PAGE` | 1200 | 論理判定用 |
| 罫線・紙高さ | `LINES_PER_PAPER` | 60 | CSS `--lines-per-page` 同期 |
| 冊ページ数 | `PAGES_PER_VOLUME` | 60 | 50 → 60 |

- `LINES_PER_VOLUME` は廃止（ページ文字基準に移行すれば使わない）。他所で未使用か要確認（grep 済み: db.test.ts のみ `LINES_PER_PAGE` 使用、`LINES_PER_VOLUME` 参照なし）。
- `--lines-per-page` CSS トークンは 60 のまま（紙高さ用）、コメントを「罫線用の視覚行数」に書き換え。

## リファクタ最小化

- `splitAtLine30` → `splitAtCharLimit` にリネーム。内部実装は `text.slice(0, CHARS_PER_PAGE)` で圧倒的にシンプル化。
- `countLogicalLines`、`getScrollTopForCursor` は罫線・カーソル復元で使う可能性があるため温存（Reader 側で使用の可能性）。
- `getPageNumber`/`countPages`/`splitIntoPages`/`joinPages` は **Reader 画面で使われていないか grep 必須**。Editor はページ単位保存なので元々不要、ただし export 機能や将来の全文検索で使われる可能性がある。ユーザーの「既存冊は再ページングしない」要件を守るため、**既存コンテンツに対しては使わない**ことを明示。
  - 現実解: これらは `LINES_PER_PAGE` をグローバル再輸出しないことで機械的に壊れる → 連動して修正する（文字数ベースに書き換え、もしくは残すなら罫線用 `LINES_PER_PAPER` を参照）。

## スクロール構造の単純化

- textarea 内部スクロールを捨て、外側 `.surface` がスクロールするのは健全。iOS/Android のネイティブ挙動に委ね、罫線 `background-attachment: local` を活用すれば自然に動く。
- textarea 高さ: `useLayoutEffect` で `scrollHeight` → `style.height` 反映。ただし「紙高さ 60 行分を下限保証」する要求も残るため、現在の `ensurePaperHeight` ロジックは形を変えて維持。
  - 提案: 下限を CSS `min-height: var(--page-height-px)` で表現し、JS は `height: auto` のみ扱う。これで JS レイアウト測定が不要になる。

## プログレスバー実装

- `repeating-linear-gradient` で trak+tick を描くとクロスブラウザで安定。
- 進捗塗りは `width: ${pct}%` の子 div で。React state 不要（`useMemo` で算出）。
- 1200字ちょうどを 100% として扱う（`Math.min(text.length / 1200, 1) * 100`）。

## 自動ページ送りの簡素化

```ts
export function splitAtCharLimit(text: string): { keep: string; overflow: string } {
  if (text.length <= CHARS_PER_PAGE) return { keep: text, overflow: '' };
  return { keep: text.slice(0, CHARS_PER_PAGE), overflow: text.slice(CHARS_PER_PAGE) };
}
```

- 視覚行判定の分岐と scrollHeight 測定を完全に削除できる。
- `onBeforeInput` の最終ページロックも `nextValue.length > CHARS_PER_PAGE` に単純化。

## テスト更新

- `pagination.test.ts`: `splitAtLine30` → `splitAtCharLimit` に書き換え。CHARS_PER_PAGE-1 / ちょうど / +1 / 大量の 4 ケースで足りる。
- `EditorPage.test.tsx`: 「LINES_PER_PAGE+1 行で遷移」系テスト (行数ベース) を「1201字で遷移」に書き換え。`thirtyLines` などのヘルパは `longText(n)` に汎用化。
- `db.test.ts`: 3ページ生成テストが `LINES_PER_PAGE` に依存 → `CHARS_PER_PAGE` ベースに書き換え（`'x'.repeat(CHARS_PER_PAGE * 2.5)` 的に）。

## 優先度

1. 定数変更・pagination.ts 書き換え（土台）
2. EditorPage の overflow 判定・onBeforeInput 書き換え
3. スクロール構造改修（CSS）
4. プログレスバー追加
5. テスト更新
6. ビルド・リントで破壊検知

## ROI 高い見送り候補

- `splitIntoPages` / `joinPages` / `countPages` の削除は今回スコープ外でよい（既存冊の再ページングをしない合意に反する恐れ、および他所から参照があれば破壊）。罫線用 `LINES_PER_PAPER` を渡すか、呼び出し有無を grep で確認してから判断。
