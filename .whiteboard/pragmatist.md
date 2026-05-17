# Pragmatist 分析（実用性・最短経路・再利用）

確信度: 🔵確実 / 🟡推測 / 🔴未確定

## 1. 新規 vs 再利用の線引き

### MemoMenu（新規 .tsx + .module.css）
🔵 BookshelfMenu を MemoMenu として複製改変が最短かつ安全。
- 理由: BookshelfMenu の props は `{onCreateNew, onOpenCalendar}`。メモ側は項目「カレンダー / 設定」のみで onCreateNew 不要。props が異なるため共通化すると条件分岐が増え可読性低下。
- CSS: `BookshelfMenu.module.css` は項目構造に依存しない汎用スタイル。複製でよい（54行と小さい）。共通 CSS 化は過剰。
- 差分: BookshelfMenu からトリガー/open/外部pointerdown/Escape ロジックをそのままコピーし、menu 内を「カレンダー(button)」「設定(Link to=/settings)」の2項目に削減。

### MemoCalendar（新規 .tsx + .module.css）
🔵 Calendar.tsx は本質的に「日記用」（findPageByDate→/read 遷移が密結合, L49-55）。props で兼用は分岐が深くなる。複製改変が最短。
- 流用: year/month state, prev/next, cells 構築, ドット表示, JST 安全な key 生成は完全流用。
- 改変点: `getDateSetInMonth` → `getMemoDateSetInMonth`、`onPick` を `findPageByDate→navigate` から `onPick?.(dateKey)` コールバックに置換（親 LogListPage が scroll 担当）。
- CSS: `Calendar.module.css`（61行）複製。ドット色/サイズは同一で流用（Aesthete 整合）。
- 🟡 兼用案の評価: Calendar に `mode: 'page'|'memo'` + `onPickDate?` を足す案も可能だが、findPageByDate/navigate の有無で実質別物。非目標「日記側 Calendar.tsx 不変」とも整合するため複製が正解。

## 2. Fab.tsx の from prop 化（最小差分）

🔵 最小差分:
```tsx
interface Props { from?: string }
export default function Fab({ from = '/' }: Props) {
  ...
  onClick={() => navigate('/log/new', { state: { from } })}
}
```
- BookshelfPage: `<Fab />` のまま（from 未指定 → 既定 '/'）→ 本棚完全不変。🔵
- LogListPage: `<Fab from="/log" />`。
- MemoEditorPage L48-51 は `location.state?.from ?? '/'` を読むだけ。from='/log' 渡しで新規メモ保存後 /log へ戻る（既存ロジック流用、変更不要）。🔵

## 3. getMemoDateSetInMonth 最小実装

🔵 db.ts に getDateSetInMonth（L535-549）同型で追加。スキーマ変更なし:
```ts
export async function getMemoDateSetInMonth(
  year: number, month: number
): Promise<Set<string>> {
  const db = await getDB();
  const memos = await db.getAll('memos');
  const set = new Set<string>();
  for (const m of memos) {
    const d = new Date(m.createdAt);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      set.add(dateKey(m.createdAt));
    }
  }
  return set;
}
```
- 🟡 getAllMemos 再利用案（sort 込み）より db.getAll 直叩きが getDateSetInMonth と完全対称で読みやすい。sort 不要（Set 化のため順序無関係）。getDateSetInMonth 同型を優先。

## 4. CSS の所在判断

🔵 Fab CSS（`.fab/.fabIcon`）は `BookshelfPage.module.css` L140-164 に在る。Fab.tsx は `import styles from './BookshelfPage.module.css'`。
- 判断: Fab.tsx は CSS import を変えず現状維持（BookshelfPage.module.css の .fab を引き続き使用）。LogListPage で `<Fab from="/log" />` するだけなら CSS 移動不要。**過剰リファクタ回避**。🔵
- 🟡 ただし「Fab が bookshelf ディレクトリ配下」という構造的違和感は残る。今回はスコープ外（移動は別タスク）。plan に技術的負債としてメモ。
- メモ側 .body に FAB 分の padding-bottom 追加が必要（LogListPage.module.css L16-22 は未確保 → 最下段被り）。本棚 .body L18-19 と同じ calc を移植。🔵

## 5. scrollIntoView 最小形

🔵 各 section に `id={`memo-date-${dk}`}` を付与（LogListPage.tsx L62）。
🟡 onPick ハンドラ:
```tsx
const scrollToDate = useCallback((dk: string) => {
  setShowCalendar(false);
  requestAnimationFrame(() => {
    document.getElementById(`memo-date-${dk}`)
      ?.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
}, []);
```
- behavior:'auto'（瞬間移動, 要件指定）。?. で null 安全。
- 🟡 rAF 1回で足りるか要検証（モーダル unmount 後のレイアウト確定タイミング）。Skeptic 判断に委ねる。

## 6. 変更ファイル一覧・推定行数・実装順序

| # | ファイル | 種別 | 推定行数 |
|---|---|---|---|
| 1 | src/lib/db.ts | 関数追加 | +15 |
| 2 | src/features/bookshelf/Fab.tsx | props 追加 | +3/-1 |
| 3 | src/features/log/MemoMenu.tsx | 新規 | ~55 |
| 4 | src/features/log/MemoMenu.module.css | 新規(複製) | ~54 |
| 5 | src/features/log/MemoCalendar.tsx | 新規 | ~75 |
| 6 | src/features/log/MemoCalendar.module.css | 新規(複製) | ~61 |
| 7 | src/features/log/LogListPage.tsx | 改変 | +40 |
| 8 | src/features/log/LogListPage.module.css | 改変(モーダル+fab padding) | +50 |

推奨実装順序（依存順, 垂直スライス）:
1. db.getMemoDateSetInMonth（独立・先行）
2. Fab from prop（独立・本棚不変確認）
3. MemoMenu + css（設定 Link は単独完結）
4. LogListPage に MemoMenu + Fab 配線（ここで「メニュー/設定/メモ作成」が動く = Wave1 完結）
5. MemoCalendar + css（getMemoDateSetInMonth 依存）
6. LogListPage に showCalendar モーダル + scrollToDate + section id（ここで「カレンダー→スクロール」が動く = Wave2 完結）

## やり過ぎ防止

- Calendar/BookshelfMenu の共通化リファクタは**やらない**（分岐増・非目標抵触）。
- Fab CSS の共通 CSS 切り出しは**やらない**（今回スコープ外, import 現状維持）。
- per-date ルートは**作らない**（単一ページ + scroll で実現, 合意済非目標）。
- body スクロールロック等の新規 a11y 強化は本棚に無いため**やらない**（Skeptic が必要と判断すれば別）。
