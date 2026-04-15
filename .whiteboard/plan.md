# Plan — 仕様改善 5 件（2026-04-15）

## Goal

ユーザー報告の 5 件を解消する:
1. 罫線の強調レイヤーを廃止し、すべて通常罫線で統一する
2. 日付挿入時にエディタが先頭にスクロールしてしまう不具合を解消する
3. 本棚で複数ノート作成時に並び順が不安定になる原因を修正する
4. 新ノート作成 UI を末尾カードからヘッダーメニュー項目に集約する
5. カレンダー UI を本棚下部ボタンからヘッダーメニュー＋全画面モーダルに変更する

## チーム構成

- Pragmatist: 最短経路・既存パターン流用・コスト最小化
- Skeptic: 既存テスト破壊回避・回帰リスク・エッジケース
- Aesthete: 静けさ原則・視覚整合・認知負荷の最小化

## Context（確認済みコード）

- `src/styles/notebook.css` L29-46: 2 層 `repeating-linear-gradient`（強調 + 通常）を `background-image` で重ねている
- `src/styles/global.css` L13: `--color-page-divider: rgba(255,255,255,0.15)`（強調罫線用、他用途あり）
- `src/features/editor/EditorPage.tsx` L359-380: `insertDate` が `requestAnimationFrame` 内で `focus()` + `setSelectionRange()` を実行（scrollTop 復元なし）
- `src/features/editor/EditorPage.tsx` L91: `surfaceRef` (`.surface` 外側スクロールコンテナ) は既に存在
- `src/features/bookshelf/BookshelfPage.tsx` L44: `vs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))` — createdAt が同 ms だと順序不定
- `src/features/bookshelf/BookshelfPage.tsx` L29 / L137-146: `showCalendar` state とトグルボタンブロック
- `src/features/bookshelf/NewVolumeCard.tsx`: 破線カード（削除対象）
- `src/features/bookshelf/BookshelfPage.module.css` L92-116 / L125-131: `.newCard*` `.calendarToggle` ブロック（削除対象）
- `src/features/bookshelf/Calendar.tsx`: navigate 機能あり、変更不要
- `src/types/index.ts` L18: `ordinal` は単調増加（db.ts で `Math.max + 1`）
- `src/lib/db.ts` L149-150 / L392-393: ordinal 採番ロジック（衝突しない）
- `src/features/bookshelf/BookshelfPage.test.tsx` L113-181: NewVolumeCard 関連テスト（書き換え対象）

## スコープ

### やること
- ① 強調罫線レイヤーの削除（`notebook.css`）
- ② `insertDate` での `surfaceRef.scrollTop` 保存・復元
- ③ 本棚並び順を `ordinal` 降順に変更（tie-break として `createdAt` 併用）
- ④ `NewVolumeCard.tsx` 削除、`BookshelfMenu.tsx` 新設
- ⑤ カレンダー表示を fixed overlay モーダルに変更（既存 `Calendar.tsx` は無変更）
- 共通: ヘッダーメニュー（ハンバーガー + ドロップダウン、`role="menu"`、外部クリック・Esc 閉じ）
- テスト: 既存テスト書き換え + ②③ TDD + ⑤ 新規テスト
- README 更新（仕様反映）

### やらないこと（非目標）
- EditorPage ヘッダーのメニュー統合
- カレンダー機能拡張（月送り、年送り等は現状維持）
- FAB（Floating Action Button）案、本棚上部固定リンク案など、合意済み以外の代替 UI
- 既存削除 confirm・長押し挙動の変更
- DB スキーマ・型定義変更（`ordinal` の運用は既存通り）
- 新しいデザイントークン追加（既存変数のみ使用）

## 設計方針

### D1. 罫線均一化（🔵）

`src/styles/notebook.css`:

```css
.notebook-surface {
  font-family: var(--font-family);
  font-size: var(--font-size);
  line-height: var(--line-height);
  letter-spacing: var(--letter-spacing);
  color: var(--color-text);
  background-color: var(--color-bg);

  /* 罫線: 1 行ごとに通常罫線（強調レイヤー廃止）。 */
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

- レイヤー 1（強調）の `repeating-linear-gradient` を削除
- 関連コメント（L19-28 の「2 層」「レイヤー 1」記述）を 1 行構成の説明に書き換え
- `--color-page-divider` トークン定義は他用途想定で **保持**（global.css L13 はそのまま）

### D2. 日付挿入時 scrollTop 保持（🔵）

`src/features/editor/EditorPage.tsx` の `insertDate` を以下に改修:

```ts
const insertDate = useCallback(() => {
  const el = textareaRef.current;
  if (!el) return;
  const stamp = formatToday();
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const nextValue = el.value.slice(0, start) + stamp + el.value.slice(end);
  // .surface (外側スクロールコンテナ) の scrollTop を保存
  // focus() / setSelectionRange() の副作用で scrollTop が 0 にリセットされる
  // ブラウザ標準挙動を打ち消すため、rAF 後に復元する
  const savedScrollTop = surfaceRef.current?.scrollTop ?? 0;
  setText(nextValue);
  const nextPos = start + stamp.length;
  requestAnimationFrame(() => {
    const cur = textareaRef.current;
    if (!cur) return;
    cur.focus();
    const clamped = Math.max(0, Math.min(nextPos, cur.value.length));
    cur.setSelectionRange(clamped, clamped);
    // scrollTop 復元（オーバーフローで navigate 発火時は surfaceRef.current が
    // 古い DOM のままだが、setText 経路で nextValue が overflow なら
    // checkOverflowAndNavigate で transitionLockRef がセットされて navigate される。
    // この rAF が走るときには次ページ遷移開始済みでも、surfaceRef は遷移前の DOM を
    // 指しているので scrollTop 設定は無害（直後に unmount される）。
    if (surfaceRef.current) surfaceRef.current.scrollTop = savedScrollTop;
  });
  onSelectionChange(nextPos);
  if (isComposingRef.current) return;
  checkOverflowAndNavigate(nextValue);
}, [onSelectionChange, checkOverflowAndNavigate]);
```

### D3. 本棚並び順（🔵）

`src/features/bookshelf/BookshelfPage.tsx` L44:

```ts
// ordinal 降順（最新を上）。同 ordinal はデータ異常時の保険として
// createdAt で tie-break することで安定化させる。
vs.sort((a, b) => {
  if (b.ordinal !== a.ordinal) return b.ordinal - a.ordinal;
  return b.createdAt.localeCompare(a.createdAt);
});
```

`src/types/index.ts` の `ordinal` JSDoc に「採番は単調増加・削除しても再利用しない」を追記。

### D4. ヘッダーメニュー基盤（🔵）

新規 `src/features/bookshelf/BookshelfMenu.tsx`:

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
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

`src/features/bookshelf/BookshelfMenu.module.css`:

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
  cursor: pointer;
  transition: opacity 120ms ease;
}
.item:hover, .item:focus-visible {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.04);
}
```

### D5. 新ノート作成のメニュー統合（🔵）

`src/features/bookshelf/BookshelfPage.tsx`:
- L17 `import NewVolumeCard from './NewVolumeCard';` を削除
- L29 `showCalendar` state は **維持**（モーダル制御に転用）
- L113-117 ヘッダー部を以下に置換:

```tsx
<header className={`app-header ${styles.header}`}>
  <h1 className={styles.title}>本棚</h1>
  <BookshelfMenu
    onCreateNew={handleCreateNew}
    onOpenCalendar={() => setShowCalendar(true)}
  />
</header>
```

- L133 `<NewVolumeCard onCreate={handleCreateNew} />` を削除
- L137-145 `.calendarToggle` ボタンブロックを削除（カレンダーモーダルへ置換）

`src/features/bookshelf/NewVolumeCard.tsx`: ファイル削除

`src/features/bookshelf/BookshelfPage.module.css`:
- L92-116 `.newCard*` ブロックを削除
- L125-131 `.calendarToggle` を削除
- L26-31 `.header button { opacity: 0.3 ... }` は BookshelfMenu の trigger と競合する可能性。`.header button` の指定を削除（BookshelfMenu 内に集約されたため不要）

### D6. カレンダーモーダル（🔵）

`src/features/bookshelf/BookshelfPage.tsx` 末尾の `{showCalendar && <Calendar />}` を以下に置換:

```tsx
{showCalendar && (
  <div
    className={styles.calendarOverlay}
    role="dialog"
    aria-modal="true"
    aria-label="カレンダー"
    onClick={(e) => {
      if (e.target === e.currentTarget) setShowCalendar(false);
    }}
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

Esc キーで閉じる useEffect を BookshelfPage に追加:

```ts
useEffect(() => {
  if (!showCalendar) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setShowCalendar(false);
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, [showCalendar]);
```

`src/features/bookshelf/BookshelfPage.module.css` に追加:

```css
.calendarOverlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
  animation: fadeIn 200ms ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.calendarPanel {
  position: relative;
  background-color: var(--color-bg);
  border: 1px solid var(--color-rule);
  border-radius: 4px;
  padding: 1rem;
  max-width: 360px;
  width: 100%;
  max-height: calc(100dvh - 4rem);
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
  color: var(--color-text);
  opacity: 0.5;
  transition: opacity 120ms ease;
  background: transparent;
  border: none;
  cursor: pointer;
}
.calendarClose:active { opacity: 0.8; }
```

### D7. テスト方針（🔵）

#### TDD 先行（②③）
- ② `EditorPage.test.tsx` に「日付挿入後 scrollTop が保持される」テストを **失敗状態で先に追加** → 修正
- ③ `BookshelfPage.test.tsx` に「同時刻 createdAt でも ordinal 降順」テストを **失敗状態で先に追加** → 修正

#### 実装と同時にテスト書き換え（①④⑤）
- ① 罫線は単体テスト不要（CSS 視覚 regression は手動）
- ④ NewVolumeCard 関連 5 ケースをメニュー経由に書き換え
- ⑤ カレンダーモーダル: 「メニューの『カレンダー』項目クリックで dialog が出現」「× で閉じる」「overlay クリックで閉じる」の 3 ケース追加

#### 既存テストの維持
- 長押し削除（L188-373）は影響なし
- BookshelfPage 自動作成・auto-create（L375-400）は影響なし

## 自己レビュー（Plan Check 1 回目）

- [x] 完全性: 5 件すべての要件にマイルストーンが対応（M1=①, M2=②, M3=③, M4=メニュー基盤, M5=④統合, M6=⑤モーダル, M7=テスト整備・README）
- [x] 実行可能性: 各タスクのファイル・関数・行数・コード断片を具体化
- [x] 依存整合性: M4 (BookshelfMenu) → M5/M6 が依存、それ以外は独立
- [x] リスク対応: Skeptic Critical 3 件すべて対策済み（C4.1 メニュー UX→ D4, C5.1 外クリック判定→ D6, C5.2 Esc 閉じ→ D6）
- [x] テスト方針: 各マイルストーンに検証コマンド記載
- [x] スコープ逸脱: EditorPage ヘッダー・FAB・カレンダー機能拡張は非目標で明記

## マイルストーン

---

### M1. 罫線均一化（🔵）

**目的**: notebook.css の強調罫線レイヤーを削除し、通常罫線のみで統一。

**タスク**:
- T1.1 `src/styles/notebook.css` を D1 設計どおり書き換え（強調レイヤー削除、コメント整理）
- T1.2 grep で `--color-page-divider` 使用箇所を確認し、必要なら JSDoc 補足
- T1.3 手動視覚確認（空ページ・1 行・満量）

**受入条件**:
- `notebook.css` の `background-image` が単一 `repeating-linear-gradient`
- `npm run build` で型・ビルド通過
- `npm run test` で既存テスト全グリーン
- 視覚確認: 罫線が均一（強調なし）

**検証コマンド**:
```
npm run build
npm run test
```

**依存 wave**: 0（独立）

**リスク**: 極小。CSS のみ。

---

### M2. 日付挿入時の scrollTop 保持（🔵）

**目的**: `insertDate` で scrollTop を保存・復元し、ページ最上部に戻る不具合を解消。

**タスク**:
- T2.1 `EditorPage.test.tsx` に「日付挿入後 scrollTop が保持される」テストを追加（失敗状態）
  - `await user.scroll(surface, 200)` 相当 → `scrollTop = 200` を直接設定
  - 日付挿入アイコンをクリック
  - rAF を `await new Promise(r => requestAnimationFrame(r))` で待機（or `waitFor`）
  - `surface.scrollTop` が 200 のままであることを assert
- T2.2 `EditorPage.tsx` の `insertDate` を D2 設計どおり改修
- T2.3 テストグリーン確認
- T2.4 JSDoc 更新: 「scrollTop 保持の意図」を明示

**受入条件**:
- 追加テストがグリーン
- 既存 EditorPage テストがグリーン
- `npm run build` 通過

**検証コマンド**:
```
npm run test -- src/features/editor/EditorPage.test.tsx
npm run build
```

**依存 wave**: 0（独立）

**リスク**:
- 🟡 jsdom の scrollTop 制御が想定通り動かない可能性（手動検証が最終確認）
- オーバーフロー時の rAF 競合 → JSDoc 明示で対応

---

### M3. 本棚並び順（🔵）

**目的**: ノートの並び順を ordinal 降順で安定化。

**タスク**:
- T3.1 `BookshelfPage.test.tsx` に「同時刻 createdAt でも ordinal 降順になる」テストを追加（失敗状態）
  - `replaceAllData` で同 `createdAt` の 3 冊を投入（ordinal 1, 2, 3）
  - レンダー後の `getAllByRole('link', { name: /ノート \d+/ })` の順序が `[3, 2, 1]` であることを assert
- T3.2 `BookshelfPage.tsx` L44 を D3 設計どおり変更
- T3.3 `src/types/index.ts` の `ordinal` JSDoc に単調増加性を追記
- T3.4 テストグリーン確認

**受入条件**:
- 追加テストがグリーン
- 既存 BookshelfPage テストがグリーン

**検証コマンド**:
```
npm run test -- src/features/bookshelf/BookshelfPage.test.tsx
```

**依存 wave**: 0（独立）

**リスク**: 極小。1 行修正 + tie-break。

---

### M4. ヘッダーメニュー基盤（🔵）

**目的**: 共通の `BookshelfMenu` コンポーネントを実装。M5/M6 の前提。

**タスク**:
- T4.1 `src/features/bookshelf/BookshelfMenu.tsx` 新規作成（D4 のコード）
- T4.2 `src/features/bookshelf/BookshelfMenu.module.css` 新規作成（D4 のスタイル）
- T4.3 まだ BookshelfPage には組み込まない（M5 で結線）。ただし import エラーが出ないようファイルだけ整える
- T4.4 単体テストはこの段階では追加しない（M5/M6 の統合テストで検証）

**受入条件**:
- ファイルが作成され、`npm run build` で型通過

**検証コマンド**:
```
npm run build
```

**依存 wave**: 0（M5/M6 の前提）

**リスク**:
- アクセシビリティ実装漏れ（`aria-haspopup`, `aria-expanded`, `role="menu"`, `role="menuitem"`）
  → コードレビューで確認

---

### M5. 新ノート作成のメニュー統合（🔵）

**目的**: `NewVolumeCard.tsx` を削除し、ヘッダーメニュー経由で新ノート作成。

**タスク**:
- T5.1 `BookshelfPage.tsx` に `BookshelfMenu` を import & 結線（D5）
  - L113-117 ヘッダー置換（h1 + BookshelfMenu）
  - L17 NewVolumeCard import 削除
  - L133 NewVolumeCard 利用箇所削除
  - L137-145 `.calendarToggle` ブロックは M6 で対応するが、ここで `setShowCalendar(true)` は BookshelfMenu の `onOpenCalendar` で呼ばれるよう **既に配線**
- T5.2 `NewVolumeCard.tsx` ファイル削除
- T5.3 `BookshelfPage.module.css` の `.newCard*` (L92-116) を削除
- T5.4 `BookshelfPage.module.css` の `.header button` (L26-31) スタイルを削除（BookshelfMenu に集約）
- T5.5 `BookshelfPage.test.tsx` の NewVolumeCard 関連テスト 5 ケース（L113-181）を書き換え:

```tsx
// 共通ヘルパー
async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
}

// 例: 旧「冊が 1 件以上あると『新しいノート』ボタンが表示される」
it('メニューの「新しいノート」項目が表示される', async () => {
  await ensureActiveVolume();
  renderPage();
  await screen.findByRole('link', { name: /ノート 1/ });
  await openMenu();
  expect(
    screen.getByRole('menuitem', { name: '新しいノート' })
  ).toBeInTheDocument();
});
```

- T5.6 「設定」リンクの assert もメニュー経由に書き換え（既存テスト L376-381 の `queryByRole('link', { name: '書く' })` は影響なし）

**受入条件**:
- BookshelfPage テスト全グリーン
- `NewVolumeCard.tsx` ファイル不在
- 視覚確認: ハンバーガーメニューから「新しいノート」を選択し confirm → 冊増加

**検証コマンド**:
```
npm run test -- src/features/bookshelf/BookshelfPage.test.tsx
npm run build
```

**依存 wave**: 1（M4 完了後）

**リスク**:
- M4.3 既存テスト破壊 → T5.5 で書き換え
- M4.2 confirm 順序 → `setOpen(false)` 先、`onCreateNew` 後で対応（D4 実装どおり）

---

### M6. カレンダーモーダル化（🔵）

**目的**: 本棚下部「カレンダーを開く」ボタンを廃し、ヘッダーメニュー経由で全画面モーダル表示。

**タスク**:
- T6.1 `BookshelfPage.tsx` 末尾の `{showCalendar && <Calendar />}` を D6 のモーダル構造に置換
- T6.2 Esc 閉じ用の `useEffect` を追加（D6）
- T6.3 `BookshelfPage.module.css` に `.calendarOverlay` `.calendarPanel` `.calendarClose` を追加
- T6.4 `BookshelfPage.module.css` の `.calendarToggle` (L125-131) を削除
- T6.5 `BookshelfPage.test.tsx` にカレンダーモーダルテストを追加:

```tsx
describe('BookshelfPage calendar modal', () => {
  it('メニューの「カレンダー」項目で dialog が出現する', async () => {
    await ensureActiveVolume();
    renderPage();
    await screen.findByRole('link', { name: /ノート 1/ });
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'カレンダー' }));
    expect(await screen.findByRole('dialog', { name: 'カレンダー' })).toBeInTheDocument();
  });

  it('× ボタンで dialog が閉じる', async () => {
    await ensureActiveVolume();
    renderPage();
    await screen.findByRole('link', { name: /ノート 1/ });
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'カレンダー' }));
    const dialog = await screen.findByRole('dialog', { name: 'カレンダー' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'カレンダーを閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Esc キーで dialog が閉じる', async () => {
    await ensureActiveVolume();
    renderPage();
    await screen.findByRole('link', { name: /ノート 1/ });
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'カレンダー' }));
    await screen.findByRole('dialog', { name: 'カレンダー' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
```

**受入条件**:
- 追加テスト 3 ケースグリーン
- 既存テスト全グリーン
- 視覚確認: メニュー→「カレンダー」→ overlay 出現 → 日付タップで navigate or × で閉じる

**検証コマンド**:
```
npm run test -- src/features/bookshelf/BookshelfPage.test.tsx
npm run build
```

**依存 wave**: 1（M4 完了後、M5 と独立に並行可）

**リスク**:
- z-index 競合 → overlay 100, メニュー 50 で階層整理
- iOS Safari でモーダル内スクロールが効かない → `overflow-y: auto` で対応済み

---

### M7. 全体検証・README 更新（🔵）

**目的**: 回帰ゼロ確認、ドキュメント整合、リント・ビルド・全テスト通過。

**タスク**:
- T7.1 grep 確認: `NewVolumeCard` `.calendarToggle` `.newCard` の残留ゼロ
- T7.2 grep 確認: `--color-page-divider`（強調罫線関連）の使用箇所をリストアップし、不要なら削除
- T7.3 `README.md` 更新:
  - L15 「15/30/45 行目は少し濃い線」を削除（全行同一罫線に）
  - L21 「新ノート作成は本棚の『＋ 新しいノート』カードからのみ」を「新ノート作成・カレンダー・設定はヘッダーメニュー（ハンバーガー）から起動」に書き換え
  - L25 「カレンダー日付ジャンプ」記述をメニュー経由・モーダル化に対応した表現に更新
- T7.4 `.claude/loop/AGENTS.md` の記述があれば確認・更新（必要なら）
- T7.5 `npm run lint` / `npm run build` / `npm run test` 全部グリーン
- T7.6 手動検証: 5 件すべての受入条件を実機 or DevTools で確認

**受入条件**:
- `npm run lint` 警告・エラーゼロ
- `npm run build` 通過
- `npm run test` 全グリーン
- README 仕様反映

**検証コマンド**:
```
npm run lint
npm run build
npm run test
```

**依存 wave**: 2（M1〜M6 完了後）

---

## 依存関係まとめ（Wave）

```
Wave 0（並列実行可）
├ M1. 罫線均一化
├ M2. 日付挿入 scrollTop
├ M3. 本棚並び順
└ M4. BookshelfMenu 基盤

Wave 1（M4 完了後、M5 と M6 は並列）
├ M5. 新ノート作成統合
└ M6. カレンダーモーダル化

Wave 2（全完了後）
└ M7. 全体検証・README 更新
```

## 🟡 判断が必要な箇所（Build Agent への指針）

### 🟡 J1: jsdom での scrollTop テスト挙動（M2-T2.1）
jsdom は `Element.scrollTop` を一応サポートするが、実際に DOM レイアウトを行わないため、
**直接 setter で `scrollTop = 200` を設定 → assert で `scrollTop === 200` を確認** という素朴な方式で OK のはず。
うまくいかない場合の代替: `surfaceRef` を test-id (`data-testid="editor-surface"`) で取得して直接操作する（既に EditorPage に `data-testid="editor-surface"` がある）。

### 🟡 J2: BookshelfMenu の trigger 衝突防止（M5-T5.4）
既存 `.header button { opacity: 0.3 }` は BookshelfMenu の trigger に **不要に上書き**されてしまう。
- 案A: `.header button` 指定をまるごと削除（推奨。BookshelfMenu に集約されたため）
- 案B: `.title` 隣のメニューだけ specificity で勝つように `.header > div > button`（脆い）

**推奨**: 案A。M5-T5.4 で実施。

### 🟡 J3: モーダル fade-in アニメーションの是非
Aesthete 推奨は 200ms fade-in。Skeptic は「即時でも問題なし」。
- 採用: 200ms fade-in（合意「200ms トランジション準拠」を最大限活用、視覚的優しさ）
- 実装: `@keyframes fadeIn` で overlay の opacity 0→1

### 🟡 J4: ハンバーガーアイコンの opacity
- Aesthete 推奨: 0.5（既存リンク 0.3 より少し強め、機能発見性のため）
- 採用: 0.5

### 🟡 J5: モーダル背景色 (overlay)
- 候補A: `rgba(0, 0, 0, 0.6)`（黒オーバーレイ、視線集中）
- 候補B: `rgba(28, 28, 32, 0.85)`（背景色ベース、世界観統一）
- 採用: 候補A（`rgba(0, 0, 0, 0.6)`）。ノートの背景 `--color-bg` (#1c1c20) と微妙に違う色で「別の層」感を作る

### 🟡 J6: BookshelfMenu の単体テスト追加是非
- 採用: BookshelfPage の統合テスト経由で検証する（独立した unit test は追加しない）
- 理由: メニュー単体の挙動は BookshelfPage テストで全パス通る

### 🟡 J7: tie-break のための createdAt 採用
- Skeptic M3.2 推奨。データ異常時の保険。
- 採用（D3 設計どおり）

## リスクとロールバック案

### リスク

| ID | リスク | 緩和策 |
|---|---|---|
| R1 | jsdom で scrollTop が期待通り動かず M2 テストが書けない | テスト記述方法を試行錯誤、最終手段は手動検証で代替 |
| R2 | iOS Safari でモーダル overlay の `position: fixed` が上手く動かない | `100dvh` を使う、`overflow-y: auto` で内部スクロール |
| R3 | BookshelfMenu の外部クリック判定が `pointerdown` で iOS で不発 | `mousedown` + `touchstart` のフォールバック追加 |
| R4 | M5 でテスト書き換え漏れ → 既存テスト失敗多発 | grep で `NewVolumeCard` `新しいノートを作る` を全削除 |
| R5 | カレンダー Calendar.tsx 内で navigate されたとき overlay が残らないこと | BookshelfPage が unmount するため自動解消（既存挙動） |

### ロールバック案

各マイルストーンは独立コミット推奨。問題発生時はマイルストーン単位で `git revert` 可能。
- M1 単体: notebook.css のみ → revert 容易
- M2 単体: EditorPage.tsx のみ → revert 容易
- M3 単体: BookshelfPage.tsx 1 行 + types JSDoc → revert 容易
- M4-M6 はセット: BookshelfMenu / NewVolumeCard 削除 / モーダル化が連動するため、
  問題があれば 3 つ同時に revert する。途中状態だと UI が壊れる

## 実装時の注意事項

- 依存バージョンは変更しない（グローバル CLAUDE.md）
- コミットはユーザーの明示的合図があるまで行わない（マイルストーン単位で積み上げる）
- 静けさ原則: トースト・点滅・触覚フィードバックを追加しない
- アクセシビリティ:
  - メニュー: `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, `role="menuitem"`
  - モーダル: `role="dialog"`, `aria-modal="true"`, `aria-label`
  - 閉じるボタン: `aria-label="カレンダーを閉じる"`
- タップ領域: 44x44 を全インタラクティブ要素に確保
- z-index: メニュー 50, モーダル overlay 100
- カラー: 既存 4 色のみ使用、新規追加なし
- フォント: メニュー項目は `--font-family-ui`、本棚タイトルは `--font-family`（既存通り）

## 確信度マーカー総括

- 🔵 確実: 5 件の機能要件、設計方針、削除対象、テスト書き換え方針
- 🟡 推測あり: モーダル fade-in、外部クリック検知方式、ハンバーガー opacity、tie-break 採用
- 🔴 未確定: なし（合意済み）

## 未解決事項

なし。Plan Check 1 回目で全項目クリア。
