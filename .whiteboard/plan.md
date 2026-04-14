# 実装計画 — diary UX 改善 (M8)

## Goal

ユーザー報告の 5 つの UX 課題を一括解消する。
1. ページの前後移動を textarea 上でも横スワイプで可能に
2. EditorPage / BookshelfPage / SettingsPage のヘッダーを上部固定
3. ヘッダーの左右余白を少し内側に（0.5rem → 1rem）
4. 余分な冊（ノート）の削除手段を用意
5. 本棚ページの上下スクロールを有効化

## Context（現状把握）

### 現行アーキテクチャ
- React 19 + Vite + TypeScript + HashRouter、IndexedDB v2 (idb)
- M4〜M7 で本棚中心 UX + 1 ページ = 1 textarea 独立 UI への刷新は完了済み
- `src/features/editor/EditorPage.tsx` は `goPage(delta)` 共通配線（flush → lastOpenedPage 更新 → 180ms フェード → navigate）で、ボタン/スワイプ/キー/自動ページングすべてこの経路
- `src/lib/db.ts` には `getVolume / getActiveVolume / rotateVolume / ensureActiveVolume` はあるが **`deleteVolume` は未定義**
- `src/styles/global.css` に `--header-height = 57.6px` と `.app-header-link` 共通クラスがあり、EditorPage はこれを使ってヘッダーを fixed 化済み
- `body { overflow: hidden }` が global.css に設定されており、BookshelfPage `.root` が `min-height: 100dvh` のままだと内部スクロールが効かない（5 番目の課題の根本原因）

### 合意済み要件
- FR1〜FR6（確信度すべて 🔵）は User Request セクション参照
- 非機能要件: 既存テスト全通過、autosave / ページめくりフェード / IME ガード / 30 行オートページング / 50 ページ目ロック の挙動を維持、静けさ原則
- 非目標: スワイプ追従アニメ、active/最終冊の削除ロック、全件削除

## チーム構成

| エージェント | 視点 | 出力 |
|---|---|---|
| Pragmatist | 最短経路 / 情報構造 / 設定分離 | `.whiteboard/pragmatist.md` |
| Skeptic | リスク / 回帰 / エッジケース | `.whiteboard/skeptic.md` |
| Aesthete | 視覚統一 / 認知負荷 / 静けさ | `.whiteboard/aesthete.md` |

---

## 設計決定（統合）

### D1: 長押し削除 UX — `window.confirm` 2 段階を採用（🔵）
- 実装コスト最小、`rotateVolume` の既存パターンを踏襲、静けさ原則に忠実
- モーダル/オーバーレイメニュー案は視覚ノイズ増加のため却下
- ページ 1 枚以上の冊: 2 段階 confirm、ページ 0 枚の冊: 1 段階のみ

### D2: 長押し検知 — Pointer Events（🟡 推奨）
- touch + mouse を一本化、デバッグ容易
- 閾値: `LONG_PRESS_MS = 500`, `LONG_PRESS_MOVE_TOLERANCE_PX = 10`（`constants.ts` に集約）
- 長押し成立時は click イベントを preventDefault して Link 遷移を抑止

### D3: deleteVolume の active 引き継ぎ — DB 層で保証（🔵 Skeptic C11 対策）
- active 冊削除時、残存冊のうち最大 ordinal の completed を active に promote
- 全冊削除 → BookshelfPage useEffect で `ensureActiveVolume` が自動復旧（既存挙動）

### D4: 共通ヘッダー CSS — global.css に `.app-header` を新設（🟡 Aesthete 推奨）
- EditorPage / BookshelfPage / SettingsPage の header に共通 class を適用
- 3 箇所がバラバラに diverge するのを防ぐ
- CSS Module の `.header` は残すが、共通部分は `.app-header` に寄せる

### D5: スワイプ判定強化 — 水平優位 2:1（🔵）
- `isFromTextarea` ガード撤廃
- `|dx| > |dy| * 2` かつ `|dx| >= SWIPE_THRESHOLD_PX` のときのみ発火
- `isComposingRef` チェックを `onTouchEnd` に追加（IME 変換中のスワイプ誤発火防止）

### D6: GitHub 同期での削除伝搬 — 今回スコープ外（🔵）
- ローカル削除のみ。GitHub 上のバックアップは残る（必要ならユーザーが手動削除）
- `pendingDeletes` キュー設計は将来検討事項としてコメントに残す

---

## マイルストーン分割（垂直スライス）

合計 **4 マイルストーン**。各完了時に動く機能が増える構成。

- **M8-1 本棚のスクロールとヘッダー統一** — 見た目と基礎インフラ
- **M8-2 textarea 上スワイプ対応** — 編集中のページ移動を解放
- **M8-3 deleteVolume 実装（DB 層）** — 削除機能の土台
- **M8-4 VolumeCard 長押し削除 UI** — ユーザー可視の削除完成

---

## M8-1: 本棚スクロール修正 + 3 画面ヘッダー統一

**垂直スライス**: ユーザーが本棚を縦スクロールでき、3 画面のヘッダーが同じ位置・同じ余白で表示される。

### Wave 1（並列可）

#### T8-1.1 global.css に共通ヘッダークラス追加（🔵）
- 変更対象: `src/styles/global.css`
- 実装:
  - `.app-header` を追加（position:fixed、height=--header-height + safe-area、padding=1rem + safe-area、背景色、z-index:2、flex space-between）
- 推定行数: +20 行
- 受入条件: global.css に `.app-header` セレクタが存在し、既存 `.app-header-link` と並置される
- テスト: なし（CSS のみ。下流テストで間接検証）
- リスク: 既存 `.header` との併用時の優先度問題（CSS 順序依存なし、コンフリクトしない単純な追加のみ）

#### T8-1.2 EditorPage ヘッダーを `.app-header` に置換（🔵）
- 変更対象: `src/features/editor/EditorPage.tsx`, `src/features/editor/EditorPage.module.css`
- 実装:
  - `<header className={styles.header}>` → `<header className={\`app-header \${styles.header}\`}>` に変更
  - `EditorPage.module.css .header` から重複する position/top/left/right/height/padding/background-color/z-index を削除（flex/justify-content/align-items/font-family は残す or `.app-header` と同値なら削除）
  - 左右 padding を `max(0.5rem, ...)` から `max(1rem, ...)` に変更（.app-header 側で統一）
- 推定行数: CSS -15 行 / TSX 1 行
- 受入条件: EditorPage の既存テスト全通過、ヘッダーがページ上端に固定表示、左右に 16px の余白
- リスク: CSS 優先度競合 → CSS Module の `.header` は `.app-header` の上書きをしないよう値を揃える

### Wave 2（T8-1.1 完了後）

#### T8-1.3 BookshelfPage ヘッダー固定化 + 縦スクロール修正（🔵 FR2, FR3, FR6）
- 変更対象: `src/features/bookshelf/BookshelfPage.tsx`, `src/features/bookshelf/BookshelfPage.module.css`
- 実装:
  - `<header className={styles.header}>` → `<header className={\`app-header \${styles.header}\`}>`
  - `.root` を `min-height: 100dvh` → `height: 100dvh`、`padding-top` を `calc(var(--header-height) + env(safe-area-inset-top, 0px) + 1rem)` に
  - `.root` の `overflow-y: auto` は既に設定済み（確認）
  - `.header` から margin-bottom: 1.5rem を削除（fixed により flow から外れるため無意味、.root padding-top で代替）
  - `.header` 内の h1.title のスタイルは維持
- 推定行数: CSS ±10 行 / TSX 1 行
- 受入条件:
  - ヘッダーがスクロールしても上部固定
  - カード数を増やしても縦スクロールが効く（BookshelfPage.test.tsx className 確認テストで代替）
  - 第 1 冊カード上端とヘッダー下端の間に 1rem の余白
- テスト追加（`BookshelfPage.test.tsx`）:
  - `.root` に `overflow-y:auto` 系のクラスが適用されることを className assert（JSDOM では computed style 不可のため className パターン確認）
  - ヘッダーに `app-header` クラスが含まれることを確認
- リスク (Skeptic C5): 本文カードがヘッダーに隠れる → padding-top で回避。

#### T8-1.4 SettingsPage ヘッダー固定化 + スクロール（🔵 FR2, FR3, FR6）
- 変更対象: `src/features/settings/SettingsPage.tsx`, `src/features/settings/SettingsPage.module.css`
- 実装: T8-1.3 と同じパターンを SettingsPage に適用
  - `<header className={styles.header}>` → `<header className={\`app-header \${styles.header}\`}>`
  - `.root` を `height: 100dvh; padding-top: calc(var(--header-height) + env(safe-area-inset-top, 0px) + 1rem)`
  - `.header` の margin-bottom:1.5rem 削除
  - 最初のセクションと header の間に呼吸できる余白（padding-top +1rem で吸収）
- 推定行数: CSS ±10 行 / TSX 1 行
- 受入条件: SettingsPage の既存テスト全通過、ヘッダー固定、縦スクロール可能
- テスト追加（`SettingsPage.test.tsx`）: ヘッダーに `app-header` クラス確認

---

## M8-2: textarea 上スワイプ対応

**垂直スライス**: ユーザーが textarea 上で左右にスワイプしてページを捲れる。

### Wave 1

#### T8-2.1 EditorPage スワイプ B 案化（🔵 FR1）
- 変更対象: `src/features/editor/EditorPage.tsx`
- 実装:
  - `isFromTextarea` 関数を削除
  - `onTouchStart`: textarea 判定を消し、全領域で座標を記録
  - `onTouchEnd`:
    - textarea 判定を消す
    - IME ガード追加: `if (isComposingRef.current) return;`（Skeptic C2）
    - 水平優位判定を強化: `if (Math.abs(dx) <= Math.abs(dy) * 2) return;`
    - 閾値 `SWIPE_THRESHOLD_PX = 50` は既存維持
  - コメントブロック（A 案 vs B 案）を更新し、B 案採用の理由を記述
- 推定行数: TSX -15 行 / +5 行
- 受入条件:
  - textarea 上 60px 横スワイプで navigate する
  - textarea 上 20px 横スワイプは無視
  - textarea 上 縦 60px / 横 30px は navigate しない
  - IME 変換中のスワイプは navigate しない
  - 既存 goPage 経由の flush / lastOpenedPage / フェード挙動は保全
- リスク:
  - Skeptic C1: 文字選択との競合 → `preventDefault` を呼ばないので iOS/Android の selection 挙動は殺さない
  - Skeptic C4: 自動ページング中の重複 → `transitionLockRef` で吸収済み
- テスト更新（`EditorPage.test.tsx`）:
  - 既存「textarea 上のスワイプは navigate しない」テスト → **書き換え**: 「textarea 上の水平スワイプで navigate する」
  - 既存「縦方向スクロール操作は誤判定されない」テスト → 閾値 2:1 仕様で通るよう必要なら座標調整
  - 新規: 「textarea 上で |dx|=30 / |dy|=60 は navigate しない」
  - 新規: 「composition 中の textarea 上スワイプは navigate しない」
  - 新規: 「textarea 上で |dx|=60 / |dy|=20 は navigate する」

---

## M8-3: deleteVolume（DB 層）

**垂直スライス**: （まだ UI はないが）DB テストで volume と関連 pages を原子的に削除できる。

### Wave 1

#### T8-3.1 db.ts に `deleteVolume` 実装（🔵 Skeptic C10, C11）
- 変更対象: `src/lib/db.ts`
- 実装:
  ```ts
  export async function deleteVolume(volumeId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['volumes', 'pages'], 'readwrite');
    const vStore = tx.objectStore('volumes');
    const pStore = tx.objectStore('pages');

    const target = await vStore.get(volumeId);
    if (!target) {
      await tx.done;
      return; // 存在しない volume は no-op
    }

    // 関連 pages を by-volume index で収集し削除
    const pagesIdx = pStore.index('by-volume');
    let cursor = await pagesIdx.openCursor(volumeId);
    while (cursor) {
      await pStore.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }

    // volume 削除
    await vStore.delete(volumeId);

    // active 削除後のリカバリ: 残存中 ordinal 最大の completed を active に promote
    if (target.status === 'active') {
      const all = await vStore.getAll();
      if (all.length > 0) {
        all.sort((a, b) => b.ordinal - a.ordinal);
        const promoted = { ...all[0], status: 'active' as const };
        await vStore.put(promoted);
      }
      // all.length === 0 の場合は何もしない
      // → BookshelfPage の useEffect で ensureActiveVolume が自動で 1 冊作成
    }

    await tx.done;
  }
  ```
- 推定行数: +35 行
- 受入条件:
  - 指定 volume とその全 pages が削除される（原子的）
  - 他 volume のデータには影響しない
  - 存在しない id は no-op（throw しない）
  - active 冊削除時、残存最大 ordinal の冊が active に promote される
- 配線検証: 新規関数は M8-4 で `VolumeCard` から呼び出される。export されていることを grep で確認する（`grep -rn "deleteVolume" src/`）。
- テスト追加（`db.test.ts`）:
  - 「deleteVolume 後に getVolume が undefined」
  - 「deleteVolume 後に getPagesByVolume が []」
  - 「deleteVolume が他 volume のページに影響しない」
  - 「存在しない id で no-op（throw しない）」
  - 「active 冊 1 件 + completed 冊 1 件のうち active を削除 → completed が active に昇格」
  - 「冊 1 件のみを削除 → volumes ストアが空になる」

---

## M8-4: VolumeCard 長押し削除 UI

**垂直スライス**: ユーザーが本棚で冊を長押し → 2 段階確認 → 削除。

### Wave 1

#### T8-4.1 長押し定数を constants.ts に追加（🔵）
- 変更対象: `src/lib/constants.ts`
- 実装:
  - `export const LONG_PRESS_MS = 500;`
  - `export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;`
- 推定行数: +3 行
- 受入条件: 定数が export される
- テスト: `constants.test.ts` に値の assertion を追加（既存パターンに倣う）

### Wave 2（T8-4.1 + M8-3 完了後）

#### T8-4.2 VolumeCard 長押し削除配線（🔵 FR4, FR5）
- 変更対象: `src/features/bookshelf/VolumeCard.tsx`, `src/features/bookshelf/BookshelfPage.module.css`
- 実装:
  - Props に `onDelete: (volumeId: string) => void | Promise<void>` を追加（親から注入）
  - Pointer Events で長押し検知:
    - `onPointerDown`: 開始座標記録 + setTimeout(LONG_PRESS_MS) で発火予約
    - `onPointerMove`: 開始座標から LONG_PRESS_MOVE_TOLERANCE_PX を超えたら clearTimeout（Skeptic C13）
    - `onPointerUp` / `onPointerCancel` / `onPointerLeave`: タイマーが生きていれば clearTimeout
    - 長押し成立時フラグ `longPressFiredRef.current = true` を立てる
  - `onClick`: `longPressFiredRef.current === true` なら `e.preventDefault()` + `e.stopPropagation()` で Link 遷移抑止（Skeptic C14）し、フラグをリセット
  - 長押し成立時のハンドラ:
    - `pages.length === 0` なら 1 段階 confirm
    - `pages.length >= 1` なら 2 段階 confirm
    - 両方 OK なら `onDelete(volume.id)` 呼び出し
  - CSS に `-webkit-touch-callout: none; user-select: none;` を `.card` に追加（Skeptic C12）
- 推定行数: TSX +70 行 / CSS +2 行
- 受入条件:
  - 短いタップ（<500ms）で Link 遷移
  - 500ms 以上長押しで 1 回目 confirm 表示
  - 長押し中に 15px 以上 pointermove でキャンセル
  - ページ 1 枚以上の冊は 2 段階 confirm、両方 OK で `onDelete` 呼び出し
  - ページ 0 枚の冊は 1 段階 confirm
- リスク:
  - Skeptic C12: iOS の長押しコンテキストメニュー → CSS で抑止
  - Skeptic C14: 長押し後の click 抑止 → preventDefault + stopPropagation
- テスト追加（`BookshelfPage.test.tsx` に集約、または `VolumeCard.test.tsx` 新規）:
  - 「pointerDown → 100ms pointerUp → Link クリックで遷移（長押し不成立）」
  - 「pointerDown → setTimeout 600ms → confirm 1 回目呼ばれる」
  - 「pointerDown → 15px pointermove → pointerUp → confirm 呼ばれない」
  - 「confirm 1 回目キャンセルで onDelete 呼ばれない」
  - 「confirm 1 回目 OK → 2 回目キャンセルで onDelete 呼ばれない」
  - 「confirm 両方 OK で onDelete が volume.id 付きで呼ばれる」
  - 「ページ 0 枚の冊は confirm 1 段階のみ」
  - JSDOM の timer と pointer event の相性注意（`vi.useFakeTimers` は fake-indexeddb と干渉する既知問題 → `setTimeout(r, 600)` の実時間待ちで代替）

#### T8-4.3 BookshelfPage から deleteVolume 配線（🔵）
- 変更対象: `src/features/bookshelf/BookshelfPage.tsx`
- 実装:
  - `handleDelete = useCallback(async (volumeId) => { await deleteVolume(volumeId); setReloadKey(k=>k+1); }, [])` を追加
  - `<VolumeCard ... onDelete={handleDelete} />` で渡す
  - db.ts からの import に `deleteVolume` を追加
- 推定行数: +10 行
- 受入条件:
  - VolumeCard の `onDelete` 呼び出しで DB 削除が実行され、本棚が再ロードされる
  - 削除後、カードがグリッドから消える
- 配線検証: `grep -rn "deleteVolume" src/` で db.ts の export と BookshelfPage の import の 2 箇所がヒットすれば配線完了
- テスト追加（`BookshelfPage.test.tsx`）:
  - 「2 冊作成 → 1 冊長押し削除 confirm 両 OK → カードが 1 冊に減る」
  - 「active 冊を削除 → 残った completed が active 扱い（cardActive クラス確認）で表示」

---

## テスト方針

### 新規追加テスト
- `src/lib/db.test.ts` に `deleteVolume` の 6 ケース（T8-3.1）
- `src/lib/constants.test.ts` に `LONG_PRESS_MS` / `LONG_PRESS_MOVE_TOLERANCE_PX` の値確認（T8-4.1）
- `src/features/editor/EditorPage.test.tsx` のスワイプブロックを B 案仕様に更新 + 新規 3 ケース（T8-2.1）
- `src/features/bookshelf/BookshelfPage.test.tsx` に VolumeCard 長押し削除 7 ケース + 配線 2 ケース（T8-4.2, T8-4.3）
- `src/features/bookshelf/BookshelfPage.test.tsx` / `src/features/settings/SettingsPage.test.tsx` に `app-header` クラス適用確認

### 既存テスト更新
- `EditorPage.test.tsx` の「textarea 上のスワイプは navigate しない」を「textarea 上の水平スワイプで navigate する」に書き換え（B 案に伴う仕様変更）
- 縦方向判定テストは既存 `|dx| <= |dy|` → 新仕様 `|dx| <= |dy|*2` で壊れないか確認（座標調整の可能性あり）

### JSDOM 制約
- CSS computed style は取得不可 → className pattern assert で代替
- 長押しタイマーは実時間待ち（`await new Promise(r => setTimeout(r, 600))`）
- `vi.useFakeTimers` は fake-indexeddb と干渉（既知問題）のため使用禁止

---

## 配線検証ポイント

- **deleteVolume** の呼び出し経路:
  - `grep -rn "deleteVolume" src/` で以下 2 箇所を確認:
    1. `src/lib/db.ts` — export 定義
    2. `src/features/bookshelf/BookshelfPage.tsx` — import + `handleDelete` 内での呼び出し
  - VolumeCard は `onDelete` prop 経由なので `deleteVolume` 名は出ない（意図どおり）
- **LONG_PRESS_MS** の参照:
  - `grep -rn "LONG_PRESS_MS" src/` で constants.ts と VolumeCard.tsx の 2 箇所
- **`.app-header`** クラスの適用:
  - `grep -rn "app-header" src/` で global.css, EditorPage.tsx, BookshelfPage.tsx, SettingsPage.tsx の 4 箇所（`.app-header-link` は別カウント）

---

## リスク・回帰防止（既存挙動との非干渉）

### IME ガード (M6-T2) との非干渉
- スワイプ B 案化で `isComposingRef.current` チェックを `onTouchEnd` に追加（Skeptic C2 対策）
- 既存の `handleKeyDown` / `handleChange` / `checkOverflowAndNavigate` の IME ガードは変更なし

### autosave (M4-T3) との非干渉
- スワイプ遷移は `goPage` 経由で `flush()` を呼ぶため既存挙動維持
- 削除機能は DB 直接操作。削除中の active 冊に対して autosave が動いていても、pages ストアが transaction 中ロックされ整合性保たれる

### 30 行自動ページング (M6-T3) との非干渉
- スワイプ B 案は `onTouchStart/End` のみ変更、`onChange` に手を入れない
- 自動ページング中（`transitionLockRef.current = true`）はスワイプも早期 return

### 50 ページ目ロック (M6-T4) との非干渉
- `onBeforeInput` は変更なし
- 50 ページ目での水平スワイプ → 前ページへは遷移する（既存 `goPage(1)` で範囲外 return）

### 日付挿入 (M7-T4) との非干渉
- insertDate は変更なし
- ヘッダー高さが `.app-header` に移っても DateIcon の hit area 44x44 は維持

### カレンダー遷移 (Calendar.tsx) との非干渉
- Calendar は `/read/:id/:page` を navigate するが App.tsx の ReadRedirect で `/book/:id/:page` に変換される既存経路維持

---

## 検証コマンド

```bash
# ユニットテスト全通し
npm test

# 個別テスト
npm test -- src/lib/db.test.ts
npm test -- src/features/editor/EditorPage.test.tsx
npm test -- src/features/bookshelf/BookshelfPage.test.tsx
npm test -- src/features/settings/SettingsPage.test.tsx
npm test -- src/App.test.tsx
npm test -- src/lib/constants.test.ts

# 配線検証
grep -rn "deleteVolume" src/
grep -rn "LONG_PRESS_MS" src/
grep -rn "app-header" src/

# 型チェック / lint（プロジェクト設定に従う）
npm run typecheck  # or tsc --noEmit
npm run lint       # 存在すれば

# 実機検証（本プランの範囲外だが推奨）
npm run dev
# - textarea 上で左右スワイプ → ページ遷移
# - BookshelfPage でカード長押し → 削除 confirm
# - BookshelfPage で縦スクロール
# - 3 画面のヘッダー位置・余白を目視で確認
```

---

## Plan Check 自己レビュー結果

| チェック項目 | 結果 | メモ |
|---|---|---|
| 完全性（全受入条件にタスクあり） | OK | FR1=T8-2.1, FR2/3=T8-1.2/3/4, FR4=T8-3.1/T8-4.2/3, FR5=T8-4.2 (2 段階 confirm), FR6=T8-1.3 |
| 実行可能性（変更ファイル・関数が具体） | OK | 全タスクでファイルパス・関数名・差分規模を明記 |
| 依存整合性 | OK | M8-3 (DB) → M8-4 (UI) の順、M8-1/M8-2 は独立 |
| リスク対応（Skeptic Critical 対策） | OK | C1=閾値, C9=2 段階 confirm, C10=transaction, C11=promote logic |
| テスト方針記述 | OK | 各タスクに新規/更新テストケース列挙 |
| スコープ逸脱 | OK | GitHub 削除伝搬・全件削除は明示除外 |

未解決事項: なし

---

## 実装時のフェーズ別 GO/NOGO チェックポイント

- **M8-1 完了時**: 3 画面のヘッダー位置が目視一致、本棚スクロールが効く → M8-2 着手可
- **M8-2 完了時**: EditorPage 既存 + 新規スワイプテスト全通過 → M8-3 着手可
- **M8-3 完了時**: db.test.ts で deleteVolume 全ケース pass → M8-4 着手可
- **M8-4 完了時**: BookshelfPage でカード削除 E2E テスト pass → 全タスク完了
