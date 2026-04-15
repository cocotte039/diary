# Plan — UX 改善 7+ 項目（2026-04-15）

## 目的

既存日記アプリ（React + Vite + TS、IndexedDB 永続化）に対し、Android 実機で顕在化している UI/UX 問題を包括的に解消する。

## 合意済み要件

| ID | 要件 | 確信度 |
|----|------|------|
| R1 | Android で textarea focus 後スクロール時もヘッダーを画面上部に固定維持 | 🔵 |
| R2 | `LINES_PER_PAGE` を 30 → 60。罫線も 60 本。既存データはそのまま | 🔵 |
| R3 | 15/30/45 行目の罫線を少し濃く | 🔵 |
| R4 | 本棚の日付範囲を `YYYY/MM/DD 〜 YYYY/MM/DD`。書きかけは `YYYY/MM/DD 〜` | 🔵 |
| R5 | NewVolumeCard の文言を「新しいノート」へ | 🔵 |
| R5b | VolumeCard の「第N冊」表記を「N」のみに。削除ダイアログ・aria-label からも「冊」を除去、aria は「ノート N」形式に統一 | 🔵 |
| R6 | Calendar の `dateKey()` / `getDateSetInMonth()` をローカル日付ベースに | 🔵 |
| R7 | 日記を開いたとき、`volume.status === 'active'` なら末尾、`completed` なら先頭にカーソル配置（localStorage 復元がなければ） | 🔵 |
| R8 | Android の拡大鏡がヘッダー領域に出る問題を解消（R1 と合わせて構造改修） | 🔵 |
| R9 | EditorPage ヘッダーを `grid-template-columns: 1fr auto 1fr` で真中央寄せ | 🔵 |
| R10 | 視覚行（折り返し込み）60 行を超えたら次ページへ遷移。`scrollHeight / line-height-px` 方式 | 🟡 |

## 設計方針

### D1 ヘッダー構造改修（R1/R8/R9 を同時解決）

**現状**: `.app-header` が `position: fixed; top:0` で textarea の上に被さり、textarea は `padding-top: var(--header-height) + env(safe-area-inset-top)` でヘッダー分下げて罫線も `background-position-y` 補正している。Android で focus → scroll 時にヘッダーが上に流れる / 空ページ時にキャレットがヘッダー境界に出て拡大鏡が出る。

**改修**: `.app-header` から `position: fixed` を削除し、`.root`（flex-column）内の通常子要素に戻す。`.textarea` の `padding-top` / `background-position` ハックも撤廃。`.surface` は `flex: 1; min-height: 0` で残り高さを占有。

- 3 画面（Editor / Bookshelf / Settings）の `.app-header` に同時適用
- BookshelfPage / SettingsPage は既に `padding-top: var(--header-height)` を持っている可能性があるので併せて確認・撤廃
- `--header-height` トークンはそのまま高さ定義として残す（flex 子要素の高さとして利用）

### D2 LINES_PER_PAGE = 60

- `src/lib/constants.ts` の `LINES_PER_PAGE` を 30 → 60 へ
- `LINES_PER_VOLUME` は自動追従
- `splitAtLine30` の**関数名**は維持（内部で `LINES_PER_PAGE` を使っているはず。要確認）。ただし名前が紛らわしいので `splitAtMaxLines` に改名検討
- 既存の 30 行埋まったページはそのまま残る（新規入力時に 60 行までスペースがある状態）

### D3 罫線 15/30/45 行目を濃く

`notebook.css` に追加 linear-gradient レイヤーを重ねる：

```css
background-image:
  /* 強調罫線 15/30/45 行目 */
  repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--line-height-px) * 15 - 1px),
    var(--color-page-divider) calc(var(--line-height-px) * 15 - 1px),
    var(--color-page-divider) calc(var(--line-height-px) * 15)
  ),
  /* 通常罫線 */
  repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--line-height-px) - 1px),
    var(--color-rule) calc(var(--line-height-px) - 1px),
    var(--color-rule) var(--line-height-px)
  );
background-size: 100% calc(var(--line-height-px) * 60), 100% var(--line-height-px);
```

※ 60 行目は最終行なのでページ切れ目。15/30/45 目を強調する周期 15 行の gradient を上に重ねる。

### D4 日付範囲フォーマット

`VolumeCard.formatRange(pages, isActive)`:

```ts
function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function formatRange(pages: Page[], isActive: boolean): string {
  if (pages.length === 0) return '';
  const sorted = [...pages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = new Date(sorted[0].createdAt);
  const last = new Date(sorted[sorted.length - 1].updatedAt);
  if (isActive) return `${fmt(first)} 〜`;
  return `${fmt(first)} 〜 ${fmt(last)}`;
}
```

### D5 文言・表記

- NewVolumeCard ラベル: `新しい冊` → `新しいノート`
  - aria-label: `新しい冊を作る` → `新しいノートを作る`
- VolumeCard 表示: `第{ordinal}冊` → `{ordinal}`
  - aria-label: `第${volume.ordinal}冊 ${range}` → `ノート ${volume.ordinal} ${range}`
- 削除ダイアログ:
  - `この冊を削除します` → `このノートを削除します`
  - `この冊と全 ${n} ページを削除します` → `このノートと全 ${n} ページを削除します`

### D6 Calendar 日付ズレ修正

`src/lib/db.ts`:

```ts
function dateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

`getDateSetInMonth`:

```ts
export async function getDateSetInMonth(year: number, month: number): Promise<Set<string>> {
  const db = await getDB();
  const pages = await db.getAll('pages');
  const set = new Set<string>();
  for (const p of pages) {
    const d = new Date(p.createdAt);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      set.add(dateKey(p.createdAt));
    }
  }
  return set;
}
```

### D7 カーソル位置 active=末尾 / completed=先頭

`EditorPage.tsx` の初回ロード useEffect:

- `getPage()` の後に `useEditorCursor` が localStorage を見て `setSelectionRange` する
- 既存フローでは `pendingCursorPosRef` が null なら useEditorCursor 任せ
- 変更: **localStorage にそのページのキーがまだ無く、かつ pendingCursorPosRef が null** の場合に限り、volume.status を取得して end/start に配置
- Volume 取得は `getVolume(volumeId)` を db.ts に（なければ追加）

判定順:
1. `pendingCursorPosRef.current != null` → その位置（既存の自動次ページ遷移後）
2. localStorage に位置あり → それを復元（useEditorCursor 内）
3. それ以外 → volume.status === 'active' なら `text.length`、そうでなければ 0

### D8 ページ番号中央寄せ

`EditorPage.module.css` の `.header` を `display: grid; grid-template-columns: 1fr auto 1fr` に変更し、`.app-header` の `justify-content: space-between` は 3 画面共通で grid に変更可能か検討。影響範囲: Bookshelf / Settings のヘッダーは `justify-content` ベースだが、grid 化しても崩れないはず（単にアイテムの並びが変わるだけ）。

**慎重策**: EditorPage の `.header` のみ grid 化し、`.app-header` のベースは現状維持。

### D9 visual row 判定（R10, 🟡）

`checkOverflowAndNavigate(value: string, el: HTMLTextAreaElement)`:

```ts
const scrollH = el.scrollHeight;
const rows = Math.round(scrollH / LINE_HEIGHT_PX);
if (rows > LINES_PER_PAGE) {
  // overflow 発生。どこで分割するか？
}
```

**分割方針**:
- 論理行（`\n`）ベースで分割すると折り返しのみの overflow は検出できない → 行末での分割は困難
- シンプル解: visual row オーバーを検知したら、**最後に入力された文字（または改行）を次ページへ持ち越す**
- 具体的には: value の末尾から遡り、最後の「折り返し or 改行の直後」を見つけて分割

**推奨実装**:
- 入力を受けた直後、textarea の scrollHeight を rAF で計測
- rows > 60 なら overflow = 「末尾に入力された分」= 差分（前回 value との diff）を次ページに持ち越す
- keep = 前回の value（60 行に収まっていた最後の状態）
- ただし貼り付け・複数文字入力もあるので、厳密には prev value を保存しておく必要あり

**簡易実装（今回採用）**:
- onChange 時の新 value で scrollHeight を計測
- rows > 60 なら overflow を「末尾から最も近い改行以降の全文字」と定義
- それもなければ「末尾 1 文字」
- 実装のシンプルさを優先。ユーザーが改行を入れない長文を書き続けるケースでは、末尾 1 文字ずつ持ち越す挙動になるが、許容範囲

**onBeforeInput**:
- 50 ページ目の末尾ロック時、visual row 超過を先読みキャンセル
- シンプルには「現 rows が既に 60 かつ挿入入力がある」なら preventDefault

## マイルストーン

### M1: 構造改修（ヘッダー固定・罫線・中央寄せ・定数）
R1 / R2 / R3 / R8 / R9 をまとめて変更。最もインパクトが大きい。

- T1.1: `LINES_PER_PAGE = 60` へ変更 + 既存テスト更新
- T1.2: `notebook.css` に 15/30/45 行目強調罫線を追加
- T1.3: 3 画面の `.app-header` から `position: fixed` 撤廃 + `.textarea` / `.surface` の padding/background 調整
- T1.4: EditorPage `.header` を grid 中央寄せに

### M2: 本棚の文言・日付
R4 / R5 / R5b。

- T2.1: VolumeCard の `第N冊` → `N`、`formatRange` を新形式に、aria-label を `ノート N` に
- T2.2: NewVolumeCard の文言を `新しいノート` に、aria-label も同様
- T2.3: 削除ダイアログの文言から `冊` を除去

### M3: Calendar 日付ズレ
R6。

- T3.1: `dateKey` / `getDateSetInMonth` をローカル日付ベースに修正 + テスト

### M4: カーソル位置
R7。

- T4.1: `db.ts` に `getVolume(id)` が無ければ追加
- T4.2: EditorPage の初回ロードで volume.status を参照し、localStorage 復元がないときは active=末尾/completed=先頭にカーソルを置く

### M5: visual row 判定
R10（🟡）。

- T5.1: `checkOverflowAndNavigate` を visual row 計測に改修（scrollHeight/line-height-px）
- T5.2: `onBeforeInput` 側でも visual row 超過を先読みキャンセル

### M6: 検証・リグレッション
- T6.1: 全テスト実行（vitest）
- T6.2: `npm run build` で型・ビルド通過確認
- T6.3: README 整合性チェック
