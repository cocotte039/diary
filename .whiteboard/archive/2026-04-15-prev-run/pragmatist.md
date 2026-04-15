# Pragmatist 視点 — 仕様改善5件（2026-04-15）

## 視点宣言

実用性・最短経路・シンプルさ・情報構造・設定分離。
合意済み要件をベースに「最小コードで最大効果」「既存パターン流用」「壊れにくい構造」を優先する。

---

## 1. 罫線均一化（①）

### 評価: 🔵 ROI 極大・リスクほぼ無し

現状 `notebook.css` L29-46 で 2 層 `repeating-linear-gradient` を重ねているが、強調レイヤーを丸ごと外せばよい。

**推奨実装**:

```css
.notebook-surface {
  /* ...font/color は維持... */
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--line-height-px) - 1px),
    var(--color-rule) calc(var(--line-height-px) - 1px),
    var(--color-rule) var(--line-height-px)
  );
  background-size: 100% var(--line-height-px);
  background-attachment: local;
  padding: 0 var(--padding-page);
  background-position: 0 0;
}
```

- `background-size` から長軸（`* 15`）を削除
- レイヤー 1 のコメント説明文（L19-28）も削除
- `--color-page-divider` 自体は `--color-page-divider-end`（冊終わり付近）等で他用途あり → トークン定義は維持

### 罠

- `--color-page-divider` が他で使われていないか grep で要確認 (`global.css` 定義は維持)
- `LINES_PER_PAPER` の役割は変わらない（紙の高さ規定）

---

## 2. 日付挿入時のスクロール保持（②）

### 評価: 🔵 単純な scrollTop 保存・復元

合意済みの設計で `surfaceRef.current?.scrollTop` を rAF 内で復元するのが正解。
既存 `insertDate` (L359-380) は `setText(nextValue)` → `requestAnimationFrame(focus + setSelectionRange)` の構造。
**`setText` で React 再レンダーが走り、textarea の高さが `useLayoutEffect` で再計算され、scrollTop がリセットされる**ため scroll 戻りが起きている。

**推奨実装**:

```ts
const insertDate = useCallback(() => {
  const el = textareaRef.current;
  if (!el) return;
  const stamp = formatToday();
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const nextValue = el.value.slice(0, start) + stamp + el.value.slice(end);
  // 🔵 surface (.surface) の scrollTop を保存
  const savedScrollTop = surfaceRef.current?.scrollTop ?? 0;
  setText(nextValue);
  const nextPos = start + stamp.length;
  requestAnimationFrame(() => {
    const cur = textareaRef.current;
    if (!cur) return;
    cur.focus();
    const clamped = Math.max(0, Math.min(nextPos, cur.value.length));
    cur.setSelectionRange(clamped, clamped);
    // 🔵 scrollTop を復元（focus / setSelectionRange の副作用を打ち消す）
    if (surfaceRef.current) surfaceRef.current.scrollTop = savedScrollTop;
  });
  onSelectionChange(nextPos);
  if (isComposingRef.current) return;
  checkOverflowAndNavigate(nextValue);
}, [onSelectionChange, checkOverflowAndNavigate]);
```

### 注意

- 🟡 `useLayoutEffect`（L230-235）は `[text, ready]` 依存。`setText` 後のレンダーで `ta.style.height = 'auto' → scrollHeight` が走るが、これは textarea 自身の高さ調整であって `.surface.scrollTop` は別物。`focus()` のブラウザ標準動作で textarea がビューポートに入るよう自動スクロールされる挙動を rAF 内で打ち消すのが本筋
- 🔵 `focus()` を先、`setSelectionRange` を後、`scrollTop = saved` を最後、の順に並べる
- 🔵 オーバーフロー遷移が発火するケース（既存 1200 字近く + 日付挿入）は遷移先で別ページが描画されるので scrollTop 復元は無意味になる。`if (overflow.length > 0)` で復元をスキップしてもよいが、判定が複雑になるので **常に復元**でよい（無害）

---

## 3. 本棚並び順修正（③）

### 評価: 🔵 1 行の修正

`BookshelfPage.tsx` L44 を変更:

```ts
// 旧
vs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
// 新
vs.sort((a, b) => b.ordinal - a.ordinal);
```

### 根本原因（推測）

- `crypto.randomUUID()` での冊作成 + 同 ms 内連続作成だと `createdAt` が同じになり、`localeCompare` の安定性が undefined になる（V8 の sort は stable だが、入力順が安定とは限らない）
- `ordinal` は `db.ts` L149-150 で `Math.max(...) + 1` で単調増加するため、降順ソートは確実に「新しい順」になる

### 注意

- VolumeCard の表示は `volume.ordinal` をそのまま使うため、表示文字列も整合する
- 既存テスト（BookshelfPage.test.tsx の M4-T5 等）は `ordinal` 順を前提にした assert ではないので、回帰しない（`new RegExp("ノート 1")` 等は表記そのものなので影響なし）

---

## 4. 新ノート作成 UI のメニュー統合（④）

### 評価: 🔵 削除 + メニュー内項目化

合意済み: `NewVolumeCard.tsx` を削除し、ハンバーガーメニューから起動。
`handleCreateNew` の本体（confirm + rotateVolume）は維持。

### 推奨実装

`BookshelfMenu.tsx` を新設し、以下のシグネチャ:

```tsx
interface Props {
  onCreateNew: () => void;       // BookshelfPage.handleCreateNew
  onOpenCalendar: () => void;    // setShowCalendar(true) 相当
}
```

- ハンバーガーボタン (`button`, `aria-label="メニューを開く"`, `aria-haspopup="menu"`, `aria-expanded={open}`)
- ドロップダウン (`role="menu"`)
- メニュー項目 (`role="menuitem"`): 「新しいノート」「カレンダー」「設定（Link to="/settings"）」

`BookshelfPage.tsx` での結線:

```tsx
<header className={`app-header ${styles.header}`}>
  <h1 className={styles.title}>本棚</h1>
  <BookshelfMenu
    onCreateNew={handleCreateNew}
    onOpenCalendar={() => setShowCalendar(true)}
  />
</header>
```

### 削除対象

- `src/features/bookshelf/NewVolumeCard.tsx` (ファイル削除)
- `BookshelfPage.tsx` L17 import, L133 `<NewVolumeCard ...>`
- `BookshelfPage.module.css` L92-116 `.newCard*` ブロック

### テスト書き換え

- `BookshelfPage.test.tsx` L113-181 「冊が 1 件以上あると『新しいノート』ボタンが表示される」系 → メニューを開いてから `getByRole('menuitem', { name: '新しいノート' })` で取得し click する形に
- `confirm` 経路は変わらないので assert は維持

---

## 5. カレンダー UI のメニュー＋モーダル化（⑤）

### 評価: 🔵 既存 Calendar コンポーネントを overlay でラップ

合意済み: ヘッダーメニューから「カレンダー」項目で全画面モーダル表示。

### 推奨実装（最小構成）

`BookshelfPage.tsx` 内で `showCalendar` state は維持しつつ、表示位置を本棚下部から「fixed overlay」に移す。

```tsx
{showCalendar && (
  <div
    className={styles.calendarOverlay}
    role="dialog"
    aria-modal="true"
    aria-label="カレンダー"
    onClick={(e) => { if (e.target === e.currentTarget) setShowCalendar(false); }}
  >
    <div className={styles.calendarPanel}>
      <button
        type="button"
        className={styles.calendarClose}
        aria-label="カレンダーを閉じる"
        onClick={() => setShowCalendar(false)}
      >×</button>
      <Calendar />
    </div>
  </div>
)}
```

`BookshelfPage.module.css`:

```css
.calendarOverlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}
.calendarPanel {
  position: relative;
  background-color: var(--color-bg);
  border: 1px solid var(--color-rule);
  border-radius: 4px;
  padding: 1rem;
  max-width: 360px;
  width: 100%;
  max-height: calc(100dvh - 2rem);
  overflow-y: auto;
}
.calendarClose {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  opacity: 0.5;
}
```

### 削除対象

- `BookshelfPage.tsx` L137-145 `.calendarToggle` ボタンブロック
- `BookshelfPage.module.css` L125-131 `.calendarToggle`

### 注意

- 🟡 Esc キーで閉じるのは `useEffect` で `document.addEventListener('keydown', ...)` を `showCalendar` 依存で配線。BookshelfMenu の Esc 閉じと同じパターン
- 🔵 Calendar コンポーネント自体は無変更（日付タップで navigate するロジックは維持）。navigate されると BookshelfPage は unmount されるので overlay は自動消滅
- 🟡 ポータル不採用（プロジェクトに前例なし）。`.root` 内に置いても `position: fixed` なので位置・stacking は問題なし

---

## ヘッダーメニュー基盤（共通）

### 推奨実装

`src/features/bookshelf/BookshelfMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './BookshelfMenu.module.css';

interface Props {
  onCreateNew: () => void;
  onOpenCalendar: () => void;
}

export default function BookshelfMenu({ onCreateNew, onOpenCalendar }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="メニューを開く"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* SVG ハンバーガー (3 本線) */}
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setOpen(false); onCreateNew(); }}
          >新しいノート</button>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setOpen(false); onOpenCalendar(); }}
          >カレンダー</button>
          <Link
            to="/settings"
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >設定</Link>
        </div>
      )}
    </div>
  );
}
```

`BookshelfMenu.module.css`:

```css
.root { position: relative; }
.trigger {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text);
  opacity: 0.5;
  transition: opacity 120ms ease;
}
.trigger:active { opacity: 0.8; }
.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 160px;
  background-color: var(--color-bg);
  border: 1px solid var(--color-rule);
  border-radius: 4px;
  padding: 0.25rem 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  font-family: var(--font-family-ui);
  font-size: 0.875rem;
}
.item {
  padding: 0.75rem 1rem;
  text-align: left;
  color: var(--color-text);
  opacity: 0.75;
  background: transparent;
  border: none;
  display: block;
  text-decoration: none;
}
.item:hover, .item:focus-visible { opacity: 1; background-color: rgba(255,255,255,0.04); }
```

### 注意

- `BookshelfPage.tsx` の既存「設定」リンク (L115) はメニューに統合するため削除
- `header button { opacity: 0.3 }` (L26-31) のスタイル指定は `.trigger` 側で上書きする必要がある（CSS Module の specificity で勝てる）か、`.header button` の指定を限定する

---

## 全体ROI評価

| 項目 | 行数 | 効果 | リスク | 優先度 |
|---|---|---|---|---|
| ① 罫線均一化 | -10 | 中 | 極小 | 高 |
| ② スクロール保持 | +3 | 高 | 小 | 高 |
| ③ ordinal sort | +0/-0 | 高 | 極小 | 高 |
| ④ メニュー統合 | +120/-50 | 中 | 中 | 中 |
| ⑤ カレンダーモーダル | +60/-15 | 中 | 中 | 中 |
| 共通 BookshelfMenu | 上記④に含む | 高 | 中 | 中 |

- ①②③ は **独立して実装可能・即効性高い** → 先行
- ④⑤ は BookshelfMenu に依存 → メニュー基盤を先に作る
- テスト整備は最後にまとめる
