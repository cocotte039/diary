# Skeptic 視点 — 仕様改善5件（2026-04-15）

## 視点宣言

リスク・エッジケース・回帰・行動心理・動機づけ。
「動くだろう」を疑い、壊れる経路と既存挙動を破壊しないかを徹底点検する。

---

## 1. 罫線均一化（①）

### Critical: 無し
### Major: 無し
### Minor:
- `--color-page-divider`（`global.css` L13）が他で参照されていなければトークン定義も削除候補（cleanup）。ただし `--color-page-divider-end`（冊終わり用）と命名類似のため、削除は慎重に。**保守性のため、定義は残す方が安全**
- 罫線 1 種類になることで「ページ内 1/4 区切り」の視覚アンカーが消える。**ユーザー要望なので問題なし**

### 回帰テスト
- 視覚 regression（手動 / DevTools）: 空ページ・1 行・1200 字満量で罫線本数 60、強調無し
- ダークモードのみのアプリなので contrast の確認は 1 パターンでよい

---

## 2. 日付挿入時のスクロール保持（②）

### Critical: 無し（合意設計で対策済み）
### Major:

#### M2.1 オーバーフロー時の競合
日付挿入で 1200 字超えると `checkOverflowAndNavigate` が発火 → 別ページへ遷移する。
このとき `requestAnimationFrame` 内の `scrollTop = saved` は遷移元コンポーネントが unmount されているので `surfaceRef.current` が null になり no-op。**安全**だが、設計意図として「遷移するときは scrollTop 復元しない」ことを JSDoc に明示すべき。

#### M2.2 navigate と rAF のレース
`checkOverflowAndNavigate` は navigate を 180ms 後に発火する `setTimeout` を使う。`requestAnimationFrame` (1 frame ≈ 16ms) のほうが先に走る → scrollTop は一旦復元される → fade が走り → navigate される。**動作上の問題は無い**が、テストでこのレースを再現する場合 `vi.useFakeTimers` で setTimeout/rAF を別々に flush する必要があり、テスト記述が複雑になる。

**対策**: テストはオーバーフロー無しケース（800 字 + 日付挿入で 800 + 13 字程度）で scrollTop 保持を検証すれば十分。

#### M2.3 既存の M6-T3 pendingCursorPosRef との競合（オーバーフロー時）
オーバーフロー時に navigate された次ページの初回ロード `useEffect` で `pendingCursorPosRef` が rAF 内で setSelectionRange する。日付挿入由来の rAF は遷移元の textarea を対象にしているので干渉しない。**安全**。

### Minor:
- `surfaceRef` は読み取りのみで `current` が null の可能性あり（条件: アンマウント中）。`?? 0` で防御済み。
- iOS Safari でテキスト入力中の `focus()` がキーボードを再表示する場合がある。`focus()` は既存挙動なので **追加リスクは無い**

### 回帰テスト追加
- 800 字入力 + scrollTop=400 → 日付挿入 → scrollTop ≈ 400 維持
- focus 時の自動スクロールが scrollTop を上書きしないことの検証

---

## 3. 本棚並び順修正（③）

### Critical: 無し
### Major:

#### M3.1 同 ordinal の不在保証
`db.ts` の `rotateVolume` (L392-393) と `ensureActiveVolume` (L149-150) はいずれも `Math.max(...) + 1` で ordinal を採番する。**履歴がある冊を削除して再作成しても、`Math.max` で過去の最大値より +1 になるので衝突しない**。安全。

#### M3.2 既存ユーザーデータの整合
過去に何らかの不具合で同 ordinal の冊が複数できている場合、`b.ordinal - a.ordinal` が 0 を返し、配列順が undefined になる。
**対策**: tie-break として `createdAt` を併用すべき:

```ts
vs.sort((a, b) => {
  if (b.ordinal !== a.ordinal) return b.ordinal - a.ordinal;
  return b.createdAt.localeCompare(a.createdAt);
});
```

これで万一の重複でも順序が安定する。

### Minor:
- ordinal の単調増加性は db.ts の実装に依存。今後 db.ts をリファクタする際にも壊さないよう、`ordinal` のドキュメントに「採番は単調増加・削除しても再利用しない」を明記すべき

### 回帰テスト追加
- 同時刻 createdAt（テストデータで `'2025-01-01T00:00:00.000Z'` を 2 件入れる）でも ordinal 順
- ordinal 1, 5, 3 の 3 件 → 表示順 5, 3, 1
- 同 ordinal が万一 2 件あっても落ちない（tie-break が効く）

---

## 4. 新ノート作成 UI のメニュー統合（④）

### Critical:
#### C4.1 メニュー UI の品質要求
ハンバーガーメニューはモバイル UX で「最後の手段」とされる。**使用頻度が低いため OK**（要件④に明記）だが、以下を保証しないと体験が落ちる:
- アイコンが「メニュー」と認識されること（3 本線が標準）
- タップ後の出現位置が画面外にはみ出ないこと（右ドロップダウン）
- 1 タップで開き、メニュー外タップ or Esc で閉じること
- 開いたメニューが本棚スクロールで追従しないこと（`position: absolute` で OK）

### Major:

#### M4.1 「使用頻度が低い」前提の検証
要件④で「使用頻度は低いが、ノート数が増えたとき末尾までスクロールが必要なのが辛い」と明記。
**現状**: 末尾の `NewVolumeCard` まで毎回スクロール
**新規**: ヘッダー右のメニュー → 1 タップ + 1 タップで起動

これは **2 タップ vs スクロール + 1 タップ**。スクロール量が増えるほど新方式が有利になる。
**前提が崩れる懸念**: もし「初回ユーザーが新ノート作成方法を見つけられない」事態は要件④の「使用頻度低い」前提に反する。**対策**: メニュー項目名は「新しいノート」と明記（アイコンのみは禁止）

#### M4.2 confirm ダイアログの維持
`window.confirm` 経路は維持。ただし、メニューを **閉じてから confirm を出す**順番が重要（メニュー開いたまま confirm が出ると視覚的にうるさい）。

```tsx
onClick={() => { setOpen(false); onCreateNew(); }}
```

`setOpen(false)` を先に呼ぶ。confirm はブロッキングだが、React のレンダーは setOpen 後の click handler 終了で flush されるので、視覚順は「メニュー閉→confirm」になる。**問題なし**。

#### M4.3 既存テストの破壊
`BookshelfPage.test.tsx` L113-181「冊が 1 件以上あると『新しいノート』ボタンが表示される」5 ケースが破壊される。書き換え必要:

```ts
// 旧
const btn = screen.getByRole('button', { name: '新しいノートを作る' });
btn.click();
// 新
fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }));
const item = screen.getByRole('menuitem', { name: '新しいノート' });
fireEvent.click(item);
```

**作業量**: 5 ケース × 2-3 行追加。容易だが見落としに注意。

### Minor:
- 「冊 0 件 → 自動作成後にカードが出る」テスト（L123-130）はメニューが「新しいノート」項目を持っているか、で代替可能
- ハンバーガーアイコンの SVG は inline で問題なし（DateIcon と同パターン）

### 回帰リスク
- ヘッダー左の `<h1>本棚</h1>` と右のメニューがレイアウト崩壊しないこと（`.header { display: flex; justify-content: space-between }` で吸収）
- メニューが画面右端からはみ出ないか（`right: 0` で安全だが `padding-right` との競合に注意）

---

## 5. カレンダー UI のメニュー＋モーダル化（⑤）

### Critical:

#### C5.1 モーダル外クリックでの閉じ動作の正確性
`onClick={(e) => { if (e.target === e.currentTarget) setShowCalendar(false); }}` パターン:
- overlay 自体（背景）クリック → 閉じる
- panel 内クリック → 閉じない
これは標準パターンだが、**Calendar 内のセル button をクリックして navigate されたケース**で BookshelfPage が unmount される → モーダル消滅。問題なし。

#### C5.2 Esc での閉じ
`useEffect` で document.keydown を listen。BookshelfMenu でも同じパターン → **両方に書く**か、custom hook 化を検討。

### Major:

#### M5.1 z-index の確認
overlay は z-index 100、メニューは z-index 50 を提案。
ヘッダー (`.app-header`) は z-index 指定なし（自然 stacking）。`position: fixed` のメニューは overlay より下だが、メニューを開いてからカレンダーを開くと「メニュー閉じて overlay 表示」になるので、**両者が同時に存在することはない**。z-index 競合は無し。

#### M5.2 モーダル内でのカレンダー操作
`Calendar.tsx` の前月/次月ボタン、日付セル click は既存通り動作。
`navigate(/read/...)` で BookshelfPage が unmount → モーダルも消える。**問題なし**。

#### M5.3 モーダル開閉と body スクロール
overlay 表示中でも `body` は変わらず（既存 `body { overflow: hidden }` だが `.body { overflow-y: auto }` がある）。
overlay 自体に padding 1rem を入れているので、small viewport でもスクロール可能。
**iOS Safari で overlay の中でもピンチズームが可能**だが、これは無害。

### Minor:

#### m5.1 カレンダーモーダルの初回開閉アニメーション
合意「200ms トランジション準拠」。fade-in をつけるなら `opacity 0 → 1` の 200ms。
**Aesthete 案件**だが、Skeptic 視点では fade なしでもよい（即時表示で問題なし）。

#### m5.2 既存「カレンダーを開く」ボタンを削除する範囲
`BookshelfPage.tsx` L137-145 と `BookshelfPage.module.css` L125-131 のみ。**`showCalendar` state は維持**（モーダル制御に使う）。

### 回帰リスク
- Calendar 内で navigate されると BookshelfPage が unmount。新しい route で `/read/...` → `/book/...` リダイレクトが効いて editor が開く（既存挙動）
- モーダル開いたまま Calendar.useEffect で `getDateSetInMonth` が走る。fake-indexeddb のテストでも問題なし

---

## 全体: Critical 一覧

1. **C4.1 ハンバーガーメニュー UX 最低品質**（メニュー認識・開閉動作・閉じる手段）→ BookshelfMenu 実装で satisfied
2. **C5.1 モーダル外クリック判定の正確性** → `e.target === e.currentTarget` パターンで satisfied
3. **C5.2 Esc 閉じ** → useEffect で document.keydown 配線で satisfied

## Major 一覧

1. M2.1 オーバーフロー時の rAF が遷移元 textarea を対象にする問題 → JSDoc 明示
2. M2.2 navigate と rAF のレース → テストではオーバーフロー無しケースで検証
3. M3.2 同 ordinal 重複時の tie-break → createdAt フォールバック追加
4. M4.1 メニューの発見性 → 「新しいノート」と明記のテキストラベル必須
5. M4.2 confirm 順序 → setOpen(false) 先、onCreateNew 後
6. M4.3 既存テスト破壊 → 5 ケース書き換え
7. M5.1 z-index 整理 → overlay > menu の階層を明示

## Minor 一覧

- ① 罫線トークンの cleanup は保守性のため見送り
- ② focus 時の自動スクロール上書きはテストで verify
- ③ ordinal 単調増加を JSDoc に明記
- ⑤ モーダル fade-in は任意

## 削除 vs 保留

- 削除: NewVolumeCard.tsx, .calendarToggle ブロック, .newCard*, 強調罫線レイヤー
- 保留: --color-page-divider トークン定義（end 系と命名類似で誤削除リスク）
- 保留: showCalendar state（モーダル制御に転用）

## テスト方針

- TDD: ②③ は失敗テストを先に書いてから修正
- ①④⑤ は実装＋テスト書き換えが同時
- 全体は `npm run test` でグリーン、`npm run build` で型通過
