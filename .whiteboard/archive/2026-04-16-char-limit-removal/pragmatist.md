# Pragmatist — 実用性・最短経路

## 視点

タスクは小粒で意図が明確。**2つの独立した変更**であり、相互依存はない。最短経路を選び、オーバーエンジニアリングを避ける。

## 分析

### 変更1: 設定リンク削除

- 対象: `src/features/editor/EditorPage.tsx` L487-497 の `.headerRight` 内 `<Link to="/settings">`
- 残すもの: 日付挿入ボタン `<button className={styles.headerDateButton}>` (L488-495)
- CSS: `.headerRight` は `gap: 0.25rem` で `inline-flex`。子要素が 1 つに減っても `gap` は無害。**CSS 変更不要**。
- 動線の代替: `BookshelfMenu.tsx` L63-68 にすでに `<Link to="/settings">設定</Link>` がある。二重導線を一本化する形になる。
- テスト修正: `EditorPage.test.tsx` L99 の `expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute(...)` を削除、および L95 の describe 名を「本棚 link と page indicator」に書き換える。
- 受入条件: EditorPage から `設定` というリンクが消える / 日付挿入ボタンは動く / 本棚メニューの設定は無変更。

### 変更2: 戻るボタン → 本棚

HashRouter + React Router v6 + Android Chrome の組み合わせでの最短実装:

```tsx
useEffect(() => {
  // ダミー履歴を 1 件積む（このエントリが戻る先の受け皿になる）
  window.history.pushState({ editorGuard: true }, '');
  const onPopState = () => {
    // flush はベストエフォート（await せず fire-and-forget）
    void flush().catch(() => {});
    navigate('/', { replace: true });
  };
  window.addEventListener('popstate', onPopState);
  return () => {
    window.removeEventListener('popstate', onPopState);
    // ダミー履歴の後始末は行わない（SPA では副作用が大きく、遷移済なら問題にならない）
  };
}, [flush, navigate]);
```

**なぜシンプルに保てるか**:
- HashRouter は `window.history` を使うが、`pushState` でダミーエントリを 1 件積むだけで `location.hash` は変わらない（state だけ追加）。
- Router 内部の履歴スタックと衝突しない。React Router v6 の `useNavigate` は内部で `history.pushState` を呼ぶが、ダミーエントリ → 実ページ遷移の順で積まれるだけ。
- ページめくり (`goPage`) で `navigate(/book/:id/:next)` しても、その時点で history は `[home, dummy, /book/.../1, /book/.../2]` のように伸びるが、最上段は常に EditorPage。戻る 1 回目で `/book/.../1` に戻り popstate で `/` に飛ぶ。**これで「ページ遷移履歴もまとめて本棚に戻る」要件を満たす**（🔵 エディタ内ページめくり後の戻るボタンも本棚に一本化）。

### 最短のタスク分割

1. **M1-T1**: 設定リンク削除 + テスト修正（所要 5 分）
2. **M1-T2**: `popstate` フック追加 + テスト追加（所要 15-20 分）

両タスクは独立しており、順序どちらでも良い。T1 が先のほうが diff が小さく見える。

### 採用しない案

- **`useBlocker` / `unstable_usePrompt`**: React Router v6 の Blocker は遷移確認 UX 向けであり、navigate の飛び先指定には向かない。冗長。
- **Route 側で history 制御**: `App.tsx` で対処すると EditorPage 以外のページに影響が波及する。EditorPage ローカルに閉じるべき。
- **`beforeunload`**: PWA のタブクローズには効くが、Android 戻るボタンは popstate で飛ぶだけなので筋違い。

## ROI 評価

| 項目 | コスト | 効果 | ROI |
|---|---|---|---|
| T1 設定リンク削除 | 極小 (1ファイル数行) | 中 (導線整理、ヘッダーの静けさ) | 高 |
| T2 popstate ガード | 小 (useEffect 1 つ + テスト) | 高 (UX の核、ユーザー報告済み) | 高 |

## 推奨

両方 M1 で一気に片付ける。独立変更なので、どちらが失敗しても他方は残せる。
