# Skeptic — リスク・エッジケース・回帰

## 視点

「Android 戻るボタン = popstate」の基本は正しいが、**HashRouter + pushState + React Router の内部履歴 + PWA standalone** の交差点には地雷が多い。見落としがちなケースを列挙し、緩和策を決める。

## Critical（必ず緩和）

### C1. HashRouter との pushState 相互作用 🟡→🔵

HashRouter は URL 変更を `window.history.pushState` ベースで行う（内部で `createHashHistory` → `BrowserHistory` 相当）。**`window.history.pushState({}, '')` は hash を変えないので HashRouter 内部の listener は何も反応しない**（listener は `hashchange` と `popstate.state.idx` をチェック）。

ただし React Router v6 は `history` state に `{ idx: N, key, usr }` を格納している。我々が state なしで pushState すると、そのエントリには `idx` がない。戻るボタンで popstate が発火し、**React Router の HistoryRouter 内 listener も同時に発火**する。両方が `popstate` を拾うため、以下が同時に走る可能性:

- 我々の onPopState: `navigate('/', { replace: true })`
- React Router 内部: 「idx 不明の state」→ 前の Location へ戻す動作

結果、2 重 navigate で画面がチラつく恐れ。

**緩和策**:
1. `history.state` に識別子を入れる: `pushState({ editorGuard: true, idx: -1 }, '')` とし、popstate ハンドラで `event.state?.editorGuard` をチェックする…のは逆で、**「ダミーエントリから離れる popstate」を検出する**べき。しかし戻る動作時の popstate の `event.state` は「戻った先のエントリの state」なので、ダミーから `/book/.../1` エントリに戻るなら `event.state` は `/book` エントリの state になる。
2. **より堅牢な方法**: 我々のハンドラ内で条件判定せず、常に `navigate('/', { replace: true })` を呼ぶ。React Router が一瞬前ページを表示しても、すぐ replace で `/` に上書きされる。UX 上はフェード 180ms もないので違和感は最小。
3. EditorPage `useEffect` の cleanup で listener を removeEventListener するので、`/` に戻った後は popstate 非捕捉。

**採用**: 案 2。実装はシンプルで副作用もテストで検出可能。

### C2. popstate 重複発火（goPage で pushState が積まれる問題）🔵

`goPage(1)` で `navigate('/book/v/2')` すると React Router が pushState する。EditorPage は同じコンポーネントのまま `useParams` のみ変わって再レンダリングされる（App.tsx のルート定義上、同じ `<EditorPage />`）。

つまり **useEffect は再マウントされず、pushState(ダミー) は 1 回しか積まれない**。

history: `[home, dummy, /book/v/1, /book/v/2]`
- 戻る 1 回: `/book/v/1` 表示 → popstate 発火 → 我々の onPopState が `/` に navigate
- その結果、ユーザーは「ページめくり後でも 1 回で本棚に戻る」

これは要件（🔵 エディタ内ページめくり後の戻るボタンも本棚に一本化）と合致。ただし **1 回目で `/book/v/1` が一瞬表示される**可能性は C1 と同じく replace で即座に `/` に上書きされるので許容。

**検証必須**: テストで「ページめくり後の popstate で `/` に戻る」ケースを再現する。

### C3. 自動遷移 (checkOverflowAndNavigate) 経路でも同じ動作か 🟡

`checkOverflowAndNavigate` は `navigate(/book/:id/:next)` を呼ぶが、pushState は React Router の `navigate()` 経由のみで、我々のダミー pushState は影響されない。useEffect の deps に volumeId/current は含まれないので再実行されない。→ **問題なし**。

### C4. deep link 直アクセス時の挙動 🟡

ユーザーが通知や URL バーから `#/book/v/3` で直接 EditorPage を開いた場合:
- history: `[/book/v/3]`（エントリ 1 件のみ。ブラウザが SPA の場合 initial entry は 1 つ）
- EditorPage マウント時に pushState → history: `[/book/v/3, dummy]`
- 戻る 1 回: popstate 発火、`/book/v/3` へ戻る途中で我々の onPopState が `navigate('/', { replace: true })` を発動 → `/` に上書き
- **Android Chrome の場合、history の最初のエントリから戻るとアプリ終了する可能性あり**。しかし pushState でダミーを積んでいるので、戻るは 1 回成功して popstate が発火する。その後ユーザーは本棚 `/` にいる。本棚でもう一度戻るボタンを押すと履歴空でアプリ終了（または前アプリへ）。

**これは期待動作**。deep link → 戻る → 本棚 → 戻る → アプリ終了、は自然。

ただし **PWA standalone モードで「履歴が 1 件しかない状態での pushState → popstate」が Android Chrome で一貫して動作するかは実機確認が必要**。

**緩和策**: 実機 QA（Android Chrome / PWA インストール状態）を手動確認項目として plan.md に記載。自動テストは MemoryRouter ベースなので PWA 固有挙動を検出できない。

### C5. 本棚カレンダーモーダルの戻るボタン挙動 🟡

スコープ外だが、**既存挙動に悪影響がないか**をチェック:
- `BookshelfPage` でカレンダーモーダル (`CalendarModal`) を開く → 戻るボタン → 現状はモーダル閉じではなく前ページ遷移（未対策）
- 我々の変更は EditorPage マウント時のみ pushState するので、BookshelfPage には影響しない
- **✅ 悪影響なし**

### C6. autosave flush の非同期完了を待たない場合のデータロス 🔵

`onPopState` は同期的に popstate イベント内で動く。navigate も同期。`flush()` は async で IndexedDB 書き込み。

現状案: `void flush().catch(() => {})` → fire-and-forget

**リスク**: navigate('/', { replace: true }) で EditorPage がアンマウント → `useEditorAutoSave` の flush を呼び出せなくなる。ただし `flush()` は呼び出し済みで、IndexedDB 書き込みは Promise chain で進行中。EditorPage のコンポーネント unmount は関係なく書き込みは完了する（IndexedDB トランザクションは window 単位）。

**検証**: 既存の「遷移前に flush」テスト (L173-185) と同パターンで、popstate 経由の flush でもデータロスがないことを確認するテストを追加。

### C7. 二重 pushState（StrictMode） 🟡

React 19 でも StrictMode で useEffect が開発時に 2 回実行される。pushState が 2 回積まれる → 戻るボタン 1 回で消費されるダミーは 1 つで、残り 1 つが残る。戻る 2 回必要になる回帰。

**緩和策**:
- `useEffect` のフラグ or ref で「一度積んだら積み直さない」を明示
- または `main.tsx` の StrictMode を黙認（本番ビルドでは 1 回）

```tsx
const guardInstalledRef = useRef(false);
useEffect(() => {
  if (guardInstalledRef.current) return;
  guardInstalledRef.current = true;
  window.history.pushState({ editorGuard: true }, '');
  // ...
  return () => {
    window.removeEventListener('popstate', onPopState);
    // guardInstalledRef はリセットしない（StrictMode の二度目マウントで再度 pushState されないように）
  };
}, []);
```

**注意**: これだと StrictMode の 2 回目で listener が登録されないバグが出る。正しくは listener は毎回登録 / remove し、pushState のみ 1 回に制限する:

```tsx
useEffect(() => {
  if (!guardInstalledRef.current) {
    window.history.pushState({ editorGuard: true }, '');
    guardInstalledRef.current = true;
  }
  const onPopState = () => { ... };
  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}, [flush, navigate]);
```

**採用**: この形で実装する。

### C8. テストでの popstate 再現 🔵

Vitest + MemoryRouter では `window.history.pushState` / `popstate` はそのまま動くが、MemoryRouter は window.history を使わない（インメモリ管理）。**テストは BrowserRouter または vitest jsdom の window.history を直接操作する必要がある**。

`EditorPage.test.tsx` は MemoryRouter を使っているが、popstate ガードのテストは window.dispatchEvent(new PopStateEvent('popstate')) で onPopState ハンドラだけを検証すれば足りる。navigate の飛び先は LocationProbe（現状は MemoryRouter のみ対応）。

**推奨**: 新しい describe ブロックで HashRouter + initialEntries は使わず、以下のどちらかで:
- (a) BrowserRouter 相当の実 history で検証
- (b) popstate ハンドラの副作用を検証するユニットテスト（navigate がモックされ、/ に飛ばすことを確認）

案 (a) のほうが筋が良いが、`MemoryRouter` を使っている既存テスト資産と乖離するので、**MemoryRouter を使ったまま popstate を dispatch し、LocationProbe の pathname が `/` に変わることを検証**する。MemoryRouter は window.popstate を聞いていないが、我々の onPopState が `navigate('/')` を呼ぶ → MemoryRouter の内部 history に反映 → LocationProbe が反応、という経路で成立する。

## Major（対処推奨）

### M1. DateIcon ボタンの aria-label 'メニュー'... ではないことを確認 🔵

L487-497 の `.headerRight` は `headerDateButton`（aria-label="今日の日付を挿入"）と `<Link to="/settings">` の 2 つ。設定 Link を消しても DateIcon ボタンは残る。**視認性・tap target 44x44 は CSS 側で維持されている**（`.headerDateButton { width:44px; height:44px }`）。

### M2. SafetyNet: ページ遷移 + 即 popstate のレース 🟡

ユーザーが「次のページ」をタップ → フェード 180ms 中に戻るボタン → `goPage` の navigate と我々の onPopState が競合する可能性。

現実的には 180ms 以内に Android 戻るボタン押下は稀だが、`transitionLockRef.current = true` の間 popstate を無視する、という保険は入れられる。ただし **静けさ原則**からすると、戻る操作はユーザーの最終意思なので、ロックで黙殺するのは良くない。**放置する**（フェード中でも本棚に戻るのが自然）。

## Minor

- HashRouter で `navigate('/')` は `#/` に遷移する。Android の PWA アイコンから起動した時、初期 URL が `/` であることは App.tsx の `<Route path="/">` で担保。
- `history.state` をアプリ側で読む箇所は現状なし（grep 結果）→ ダミー state の `editorGuard` プロパティを他コードが誤読するリスクなし。

## 結論

- C1, C2, C6, C7, C8 は必ず対応。実装方針は pragmatist の案をベースに **`guardInstalledRef` で二重 pushState を防ぐ**形に修正。
- C4 は実機確認を plan.md の QA チェックリストに含める。
- C5, M1, M2 は確認のみで対処不要。
