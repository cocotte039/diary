# Plan — EditorPage ヘッダー整理と戻るボタン動線修正（2026-04-15）

## Goal

1. **EditorPage ヘッダーから「設定」リンクを削除する**。本棚のハンバーガーメニュー経由の導線に一本化し、書く画面の静けさと編集集中を強化する。
2. **EditorPage で Android 端末の戻るボタンを押したら本棚 (`/`) に戻るようにする**。ページめくり履歴に依らず「本を閉じる」動作として一貫化する。

## チーム構成

- **Pragmatist**: 最短経路での削除＋ pushState/popstate フックの最小実装、CSS は触らない判断、ROI 優先
- **Skeptic**: HashRouter / React Router v6 内部履歴との相互作用、二重 pushState（StrictMode）、deep link 直アクセス、PWA standalone での挙動、テスト手法
- **Aesthete**: ヘッダーの二重導線解消、戻るボタン = 本を閉じるメタファー、場所感覚の整合

## Context（確認済みコード）

- `src/features/editor/EditorPage.tsx` L487-497: `.headerRight` 内に `<button className={styles.headerDateButton}>`（日付挿入）と `<Link to="/settings">設定</Link>` の 2 要素
- `src/features/editor/EditorPage.module.css` L30-35: `.headerRight { justify-self: end; display: inline-flex; align-items: center; gap: 0.25rem }`。子要素数変化に堅牢
- `src/features/editor/EditorPage.test.tsx` L95-103: 「header contains 本棚 link to /, current page number, and 設定 link」テストが設定 link の存在を検証
- `src/App.tsx`: HashRouter 利用。`/book/:volumeId/:pageNumber` → EditorPage、`/` → BookshelfPage、`/settings` → SettingsPage、`*` → Navigate to `/`
- `src/features/bookshelf/BookshelfMenu.tsx` L63-68: `<Link to="/settings">設定</Link>` を既に提供（変更不要）
- `src/features/editor/useEditorAutoSave`: `flush()` を返す。遷移前 flush で既に利用実績あり (L334)
- 既存コードで `window.history.pushState` / `popstate` を使う箇所は**なし**（grep 済）
- BookshelfPage・Calendar・BookshelfMenu ともに history API を使わない → 我々の popstate リスナーと競合しない

## スコープ

### やること（🔵）

- `<Link to="/settings">` を EditorPage ヘッダーから削除
- 対応する既存テスト（設定リンク存在確認）を削除・書き換え
- EditorPage マウント時に `history.pushState` でダミー履歴を 1 件積む（StrictMode 二重マウントを ref でガード）
- `popstate` リスナを追加。発火時に `flush()` を fire-and-forget → `navigate('/', { replace: true })`
- アンマウント時に `popstate` リスナを remove（pushState の後始末は行わない）
- popstate ガードのテストを TDD で追加（MemoryRouter + LocationProbe + `window.dispatchEvent(new PopStateEvent('popstate'))`）
- ページめくり（goPage / 自動遷移）後の戻るボタンが本棚に飛ぶケースをテストで担保
- 遷移直前の編集内容が flush でデータロスしないことをテストで担保

### やらないこと（非目標）

- `/settings` ページの戻るボタン挙動（今回は触らない）
- 本棚カレンダーモーダルの戻るボタン挙動（既存通り前ページ遷移。将来課題）
- `.headerRight` の CSS 変更（現状の gap / flex / justify-self で堅牢）
- 日付挿入ボタンの見た目・位置変更
- 本棚メニューの「設定」項目の変更

## 設計方針

### D1. 設定リンク削除（🔵）

**対象**: `src/features/editor/EditorPage.tsx` L487-497 の `.headerRight` 内側。

```tsx
// 変更前
<div className={styles.headerRight}>
  <button
    type="button"
    className={styles.headerDateButton}
    aria-label="今日の日付を挿入"
    onClick={insertDate}
  >
    <DateIcon />
  </button>
  <Link to="/settings" aria-label="設定" className="app-header-link">設定</Link>
</div>

// 変更後
<div className={styles.headerRight}>
  <button
    type="button"
    className={styles.headerDateButton}
    aria-label="今日の日付を挿入"
    onClick={insertDate}
  >
    <DateIcon />
  </button>
</div>
```

副次的に `Link` import が `Link as RouterLink` 的に未使用になる場合はクリーンアップ。現状 L13 の import 行に `Link` は `本棚` リンク（L456）でも使っているので **残す**。

### D2. 戻るボタンガード（🔵）

EditorPage 冒頭に新しい `useEffect` を追加する。

```tsx
// 戻るボタンガードの二重 pushState を防ぐ ref (StrictMode 対策)
const historyGuardInstalledRef = useRef(false);

useEffect(() => {
  // Android 端末の戻るボタン（＝popstate）で本棚 (`/`) に戻すためのガード。
  // マウント時にダミー履歴を 1 件積み、戻るボタンが popstate を発火した時に
  // autosave を flush してから navigate('/', { replace: true }) で本棚に上書き遷移する。
  //
  // React 19 StrictMode では useEffect が二度実行されるため、pushState は
  // historyGuardInstalledRef でガードして 1 回だけに制限する。
  // listener は毎回登録/解除する（cleanup 整合性のため）。
  if (!historyGuardInstalledRef.current) {
    window.history.pushState({ editorGuard: true }, '');
    historyGuardInstalledRef.current = true;
  }
  const onPopState = () => {
    // flush はベストエフォート（await せず fire-and-forget）
    // IndexedDB の write は window 単位のトランザクションなのでコンポーネント
    // unmount 後も完了する
    void flush().catch(() => {});
    navigate('/', { replace: true });
  };
  window.addEventListener('popstate', onPopState);
  return () => {
    window.removeEventListener('popstate', onPopState);
    // ダミー履歴の撤去（history.back()）は行わない:
    //   - popstate 経由の unmount なら既に消費済み
    //   - コンポーネント切替経由の unmount ならダミー 1 件残っても実害なし
  };
}, [flush, navigate]);
```

**採用理由**:
- Pragmatist 案ベース + Skeptic C7 の StrictMode 対策（`historyGuardInstalledRef`）を採り入れ
- Skeptic C1 の「React Router 内部 popstate との競合」は、`navigate('/', { replace: true })` が強制的に上書きするので最終結果が `/` に収束 → 視覚フラッシュは 1 フレーム未満で許容
- Skeptic C6 の `flush()` は fire-and-forget、IndexedDB が unmount 後も完了することで担保

### D3. CSS 変更なし（🔵）

- `.headerRight` は `gap: 0.25rem` で `inline-flex`。子要素が 1 つになっても視覚影響なし
- Grid `1fr auto 1fr` の中央ピン留めは不変

### D4. テスト方針（🔵）

#### D4.1 削除対象（1 件）

`src/features/editor/EditorPage.test.tsx` L95-103 の既存テスト「header contains 本棚 link to /, current page number, and 設定 link」を以下に書き換え:

```tsx
it('header contains 本棚 link to /, current page number, 日付挿入ボタン (設定 link は無い)', async () => {
  const v = await ensureActiveVolume();
  renderAt(`/book/${v.id}/7`);
  expect(await screen.findByRole('link', { name: '本棚に戻る' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('button', { name: '今日の日付を挿入' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '設定' })).not.toBeInTheDocument();
  expect(screen.getByTestId('page-indicator')).toHaveTextContent(`7 / ${PAGES_PER_VOLUME}`);
});
```

#### D4.2 追加テスト（TDD で先に書く）

新規 `describe` ブロック「EditorPage back button guard」を追加:

```tsx
describe('EditorPage back button guard (popstate → 本棚)', () => {
  it('戻るボタン(popstate) で / に navigate する', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/3`, (p) => { pathname = p; });
    await screen.findByLabelText('日記本文');
    // 戻るボタンをシミュレート
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(pathname).toBe('/'));
  });

  it('ページめくり後の戻るボタンでも / に戻る', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    await screen.findByLabelText('日記本文');
    fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
    await waitFor(() => expect(pathname).toBe(`/book/${v.id}/2`));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(pathname).toBe('/'));
  });

  it('戻るボタン発火前の編集内容が flush で保存される（データロス防止）', async () => {
    const v = await ensureActiveVolume();
    renderAt(`/book/${v.id}/1`);
    const textarea = (await screen.findByLabelText('日記本文')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'draft-before-back' } });
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(async () => {
      const saved = await getPage(v.id, 1);
      expect(saved?.content).toBe('draft-before-back');
    });
  });

  it('アンマウント後の popstate では navigate が呼ばれない（リスナー解除）', async () => {
    const v = await ensureActiveVolume();
    let pathname = '';
    const { unmount } = renderWithLocationProbe(`/book/${v.id}/1`, (p) => { pathname = p; });
    await screen.findByLabelText('日記本文');
    unmount();
    pathname = '(cleared)';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // アンマウント後は onChange コールバックも呼ばれない → pathname は変わらない
    expect(pathname).toBe('(cleared)');
  });
});
```

**補足**: MemoryRouter は window.popstate を聞いていないが、我々の onPopState が `navigate('/')` を呼ぶ → MemoryRouter の内部 history に反映 → LocationProbe の pathname 更新 → `/` を観測できる。これは MemoryRouter でも成立する経路（Skeptic C8 で検討済み）。

### D5. 実機 QA チェックリスト（手動、🔵）

自動テストでは検出不能な PWA 固有挙動。実機確認項目:

- [ ] Android Chrome（通常タブ）: 本棚 → 冊を開く → 戻るボタン → 本棚
- [ ] Android Chrome（通常タブ）: 本棚 → 冊を開く → 次へ 3 回 → 戻るボタン → 本棚
- [ ] Android Chrome PWA インストール版（standalone）: 同上 2 パターン
- [ ] Deep link（`#/book/v/3` を直接開く）→ 戻るボタン → 本棚 → 戻るボタン → アプリ終了
- [ ] エディタで編集中 → 戻るボタン → 本棚 → 再度本を開く → 編集内容が保存されている
- [ ] 本棚メニューから設定にアクセスできる（既存挙動）
- [ ] ヘッダー右端の見た目に破綻がない（日付ボタンが単独で右端に収まる）

## 実装フェーズ

### M1: ヘッダー整理と戻るボタン動線修正（垂直スライス）

| タスク | 変更対象 | 推定行数 | 確信度 | 依存 |
|---|---|---|---|---|
| **M1-T1**: 設定リンク削除 | `EditorPage.tsx` L487-497 `.headerRight` / `EditorPage.test.tsx` L95-103 | −3 / +1 test 書換 | 🔵 | なし |
| **M1-T2**: 戻るボタンガード実装 + テスト | `EditorPage.tsx` useEffect 追加（~20行） / `EditorPage.test.tsx` 新規 describe（~60行） | +20 / +60 | 🔵 | なし |
| **M1-T3**: 実機 QA（D5 チェックリスト） | なし（手動） | 0 | 🔵 | T1, T2 |

**垂直スライス原則との整合**: M1 完了時点で「ユーザーは書く画面で戻るボタンを使える」「書く画面の設定リンクが消える」。両方ともユーザー可視の振る舞い変化で、単体で価値を持つ。両タスクとも独立（どちらが失敗しても他方は残せる）なので TDD 順序は T1 → T2 を推奨（T1 は diff が小さく壊滅リスクが低い）。

## リスクとその対策

| リスク | 深刻度 | 対策 |
|---|---|---|
| HashRouter + pushState の state 不整合で二重 navigate | Medium | `navigate('/', { replace: true })` で最終結果を強制収束（Skeptic C1） |
| StrictMode 二重マウントで pushState が 2 回積まれる | High | `historyGuardInstalledRef` で 1 回に制限（Skeptic C7） |
| flush 未完了のまま unmount → データロス | Medium | IndexedDB は window 単位で書き込み継続、テストで担保（Skeptic C6 / D4.2 test 3） |
| PWA standalone 固有挙動でテスト検出不能 | Medium | 実機 QA チェックリスト D5 で担保 |
| popstate リスナー解除漏れ | Low | useEffect cleanup で removeEventListener、テスト D4.2 test 4 で担保 |
| 自動遷移 (checkOverflowAndNavigate) 経路でも想定通り動くか | Low | useEffect deps が `[flush, navigate]` のみで volumeId/current 変化時に再マウントされない → 同じハンドラで動く（Skeptic C2 / C3） |

## 見送り事項とその理由

| 項目 | 理由 |
|---|---|
| 本棚カレンダーモーダルの戻るボタン対応 | 今回のスコープ外。EditorPage の変更は BookshelfPage に影響しない |
| `/settings` ページの戻るボタン対応 | ユーザー要望なし、スコープ外 |
| `.headerRight` の CSS 調整 | 子要素数変化に堅牢な設計で、視覚的破綻が予想されない（Pragmatist / Aesthete 合意） |
| ダミー履歴の撤去（history.back）を unmount 時に行う | popstate 経由の unmount なら既に消費済み、それ以外では history スタックに 1 件ゴミが残るが実害なし。削除処理が複雑化するデメリットのほうが大きい |
| `useBlocker` / `beforeunload` 系 API | 遷移確認用途。今回の「戻るで特定ページに飛ばす」用途には不適（Pragmatist 判定） |

## 実装時の注意事項

- **TDD 順序**: D4.2 の新規テストを先に書いて RED を確認 → D2 の実装で GREEN。D4.1 のテスト書換は D1 と同じコミットで OK
- **コミット単位**: M1-T1 / M1-T2 を別コミット推奨（リバート容易性）
- **import 行**: 既存の `Link` は本棚リンクで使用中のため残す。`useRef` は既に import 済み
- **deps 配列**: useEffect の deps は `[flush, navigate]`。`flush` は `useEditorAutoSave` が useCallback で返すので安定、`navigate` も React Router で安定
- **静けさ原則**: popstate ハンドラ内でトースト・確認ダイアログ・視覚フィードバックは出さない
- **型**: `history.state` に入れる `{ editorGuard: true }` は読み取らないため型定義不要

## 自己レビューループ結果（Plan Check）

### チェック 1 回目

1. **完全性**: ✅ ユーザー要望 2 件 × 受入条件すべてにタスク対応あり（設定リンク非表示 / 戻るボタン → 本棚 / ページめくり後も本棚 / flush 保持）
2. **実行可能性**: ✅ 変更対象ファイルと行番号、具体的な差分コード（D1 / D2）を提示済み
3. **依存整合性**: ✅ M1-T1 と M1-T2 は独立。T3（QA）は T1/T2 後
4. **リスク対応**: ✅ Skeptic Critical C1/C2/C6/C7/C8 すべて対策タスクに反映（ref ガード、fire-and-forget flush、MemoryRouter テスト経路、実機 QA）
5. **テスト方針**: ✅ D4.1（置換 1 件）/ D4.2（追加 4 件）具体コード付き
6. **スコープ逸脱**: ✅ 非目標（モーダル戻るボタン、Settings 戻るボタン、CSS 変更）は「やらないこと」「見送り事項」に明記

**判定**: 6/6 合格。ループ終了。

## 未解決事項

なし。実装フェーズへ進行可能。

### 将来課題（次回以降のスコープ候補、記録のみ）

- 本棚カレンダーモーダル開放中の戻るボタン → モーダル閉じ動作（本件の popstate パターンを拡張適用可能）
- `/settings` ページで戻るボタン → 本棚 の統一挙動（同じパターンでガード可能）
