# Skeptic — リスク・エッジケース・回帰防止分析

## 視点
各要望はシンプルに見えるが、既存の巧妙な挙動（30 行自動ページング / IME ガード / 50 ページ目ロック / autosave debounce）と干渉する余地が多い。回帰を潰す観点で各要望のリスクを洗い出す。

## 要望ごとのリスク

### 1. textarea 上スワイプ (FR1)
**C1 (Critical): 通常の文字選択・カーソル移動を潰す恐れ**
- iOS/Android ではタップ → ドラッグで文字選択を行う。水平ドラッグを常にページめくり判定すると、ユーザーが「この単語を選択したい」操作が暴発する。
- 対策: 閾値 `SWIPE_THRESHOLD_PX = 50px` と `|dx| > |dy|*2` の両方を満たした場合のみ遷移。
- **さらに**: touchmove で `preventDefault` を呼ばない（文字選択挙動を殺さない）。touchend でのみ距離を判定する現在の A 案の構造を維持。
- **テスト追加**: 「textarea 上で 20px 横スワイプ → navigate しない」「textarea 上で 60px 横スワイプ → navigate する」「textarea 上で 縦 60px / 横 30px → navigate しない」

**C2 (High): IME 変換中のスワイプ誤発火**
- 変換候補ウィンドウをドラッグする操作が水平スワイプと誤認される可能性。
- 対策: `isComposingRef.current` チェックを `onTouchEnd` にも追加。変換中は遷移抑止（既存 `handleKeyDown` と同じパターン）。
- **テスト追加**: 「composition 中のスワイプは navigate しない」

**C3 (Medium): autosave 未 flush で遷移すると直前入力が消える**
- 現行 `goPage` は `await flush()` を呼ぶので OK。スワイプでも `goPage` 経由なら問題なし。既存テスト「遷移前に編集中のテキストが flush で保存される」が引き続き通ることを確認。

**C4 (Medium): 自動ページング中のスワイプ重複**
- `transitionLockRef.current` で多重遷移ガード済み。スワイプも goPage 経由なので影響なし。

### 2. ヘッダー固定化 (FR2, FR3)
**C5 (High): BookshelfPage 本文と固定ヘッダーの重なり**
- `.header` を fixed にすると、`.grid` の 1 行目（第 1 冊カード）がヘッダーに隠れる。
- 対策: `.root` の `padding-top` を `calc(var(--header-height) + env(safe-area-inset-top, 0px) + 1rem)` に。既存 `max(1rem, env(safe-area-inset-top))` ではヘッダー分が含まれない。
- **テスト追加**: `.root` の computed style 確認は JSDOM で困難。**代案**: クラス指定が適用されていることを className assert で確認する。

**C6 (Medium): ヘッダー背景の透過で本文が透けて見える**
- EditorPage と同じく `background-color: var(--color-bg)` を .header に設定必須。
- カレンダー Toggle ボタン（BookshelfPage 下部）とは重ならないが、スクロール時に上端がヘッダー下をよぎる。

**C7 (Low): iOS safe-area の考慮漏れ**
- `env(safe-area-inset-top)` は viewport-fit=cover 前提。index.html の meta viewport を確認する必要あり。
- 既存 EditorPage で効いているなら設定済みと推定。

### 3. ヘッダー左右パディング (FR3)
**C8 (Low): `max(1rem, env(safe-area-inset-*))` への変更で iPhone 横画面のノッチ領域侵入はないか**
- 横画面 iPhone のノッチ側の safe-area は通常 44px 程度。`max(1rem, 44px) = 44px` なので safe-area が勝つ。問題なし。

### 4. 削除機能 (FR4, FR5)
**C9 (Critical): データロスの致命的リスク**
- 1 冊 = 最大 50 ページの日記データ。誤操作で消えたら復旧は GitHub バックアップだけ（設定していないユーザーは完全喪失）。
- **対策 1**: ページが 1 枚以上ある冊は 2 段階 confirm 必須（FR5 で合意済み）。
- **対策 2**: 長押し閾値は **500ms** かつ **移動 10px 以内**。短すぎるとスクロール中に誤発火、長すぎるとユーザー諦める。
- **対策 3**: `window.confirm` のメッセージに「第N冊（Mページ記入済み）」を明示してターゲット誤認を防ぐ。
- **対策 4**: 削除実行後のトーストはなし（静けさ原則）だが、カードグリッドから消えること自体が視覚フィードバックになる。

**C10 (Critical): deleteVolume のトランザクション原子性**
- volume と関連 pages は同一トランザクションで削除必須（片方だけ残ると不整合）。
- 対策: `tx = db.transaction(['volumes', 'pages'], 'readwrite')` で pages の by-volume インデックス走査 → 全 page.id を収集 → volume 削除 + pages 削除。
- **テスト必須**:
  - 「deleteVolume 後に getVolume が undefined」
  - 「deleteVolume 後に getPagesByVolume が 空配列」
  - 「deleteVolume が他の volume のページに影響しない」
  - 「存在しない volumeId を渡しても no-op（throw しない）」

**C11 (High): active 冊を削除したときのリカバリ**
- active 冊削除後の挙動:
  - volumes 0 件 → BookshelfPage useEffect で `ensureActiveVolume` が走り、新 active 冊を自動作成。ユーザー体験: 「全部消したつもりが空の 1 冊が生える」→ これは既存 0 件自動作成の踏襲なので許容。
  - volumes 1 件以上 & active 0 件 → `getActiveVolume` が undefined。NewVolumeCard の `handleCreateNew` で `active` が undefined の場合 early return するため、「新しい冊」ボタンが押せない詰み状態になる。
  - **対策**: deleteVolume のトランザクション内で「active が 1 つもなくなったら最新 ordinal の completed を active に promote する」ロジックを入れる。**または** BookshelfPage 側の handleCreateNew で active undefined なら `ensureActiveVolume` を呼ぶフォールバックを入れる。**前者（DB 層で保証）推奨**。
- **テスト必須**: 「active 冊を削除すると、次に大きい ordinal の冊が active に昇格する」「冊が 1 件のみで削除 → その冊の削除は成功し、その後 BookshelfPage リロードで新 active が自動作成される」

**C12 (Medium): iOS 長押し時のネイティブコンテキストメニュー**
- 長押しで iOS Safari が選択・コピー系メニューを出すと UI が競合する。
- 対策: VolumeCard の CSS に `-webkit-touch-callout: none; user-select: none;` を追加。
- テストは実機検証頼み（JSDOM では再現不可）。

**C13 (Medium): スクロール中の長押し誤発火**
- BookshelfPage が縦スクロール可能になる（FR6）ので、スクロールのための「指を置く → スクロール」動作が長押しと誤認される。
- 対策: pointermove で 10px 以上移動したら長押しキャンセル（上の `LONG_PRESS_MOVE_TOLERANCE_PX`）。
- **テスト追加**: 「pointerdown → 15px pointermove → pointerup (600ms) → 削除メニュー開かない」

**C14 (Medium): 長押しと通常タップの両立**
- 短いタップで冊を開く (Link 挙動) を維持しつつ、500ms 以上で削除モードに入る。
- `<Link>` の click は pointerup で発生。長押しが成立（500ms 経過）したら pointerup 時に `preventDefault` + `stopPropagation` で Link 遷移を抑止する必要あり。
- 実装: Link を `<a>` 要素として維持し、pointerdown/up を自前ハンドル。長押し成立フラグ true の時は `e.preventDefault()`。
- **テスト追加**: 「短いタップ（100ms）→ Link 遷移」「長押し（600ms）→ Link 遷移せず confirm 表示」

### 5. 本棚スクロール (FR6)
**C15 (Low): `height:100dvh` への変更で小画面端末のカードが切れる**
- `min-height` → `height` に変えるだけなので内部コンテンツは overflow-y:auto でスクロール可能。問題なし。

**C16 (Low): overscroll-behavior**
- 既存 global.css `html { overscroll-behavior: none }` あり。過度な弾性スクロールは抑止済み。

## 既存挙動との非干渉チェック

### autosave
- スワイプ遷移は `goPage` 経由で `flush()` を呼ぶので保全される。
- 削除機能は DB 直接操作で autosave と独立。ただし active 冊を削除中に autosave が走る可能性あり → 長押し確認中はあえてガードしない（確認ダイアログ中は textarea にフォーカスないため新規入力なし）。

### 30 行自動ページング (M6-T3)
- スワイプ B 案化で textarea 上のイベントが増えるが、onTouchStart/End は onChange とは独立。影響なし。

### 50 ページ目ロック (M6-T4)
- onBeforeInput での改行ロック、スワイプや削除とは独立。影響なし。

### IME ガード (M6-T2)
- スワイプ B 案化で `isComposingRef` チェックを onTouchEnd に追加必須（C2）。

## 自動ページングとの干渉: 特殊ケース
- 30 行超過で自動遷移中（`fading=true`）にスワイプが発火したらどうなるか？
- `transitionLockRef.current = true` で早期 return するので二重遷移しない。既存ロジックで吸収。OK。

## リスクまとめ
| ID | Sev | 要望 | 対策 |
|---|---|---|---|
| C1 | Critical | FR1 | 閾値 50px + 水平優位 2:1 |
| C2 | High | FR1 | IME ガード onTouchEnd に追加 |
| C9 | Critical | FR4/5 | 2 段階 confirm + 500ms 長押し |
| C10 | Critical | FR4 | deleteVolume のトランザクション原子性 |
| C11 | High | FR4 | active 削除時の自動 promote |
| C13 | Medium | FR4 | 長押しの移動許容 10px |
| C14 | Medium | FR4 | Link click 抑止 |
| C5 | High | FR2 | padding-top にヘッダー分追加 |

## 推奨テストケース（新規追加）

### db.test.ts
- `deleteVolume(id)` が volume と pages を両方削除
- 他 volume のデータは残る
- 存在しない id でも throw しない
- active 削除 → 最大 ordinal の completed が active に promote

### BookshelfPage.test.tsx (or VolumeCard.test.tsx 新規)
- VolumeCard に pointerDown → 600ms 待つ → pointerUp で confirm 発火
- pointerDown → 100ms pointerUp で Link 遷移（長押し不成立）
- pointerDown → 15px pointermove → pointerUp でキャンセル
- confirm 1 回目キャンセルで削除されない
- confirm 2 回目キャンセルで削除されない
- confirm 両方 OK で削除され、カードが消える
- ページ 0 枚の冊は 1 段階 confirm のみ

### EditorPage.test.tsx
- 既存「textarea 上のスワイプは navigate しない」テストを **B 案用に更新**: 「textarea 上の 水平スワイプで navigate する」に変更
- 「textarea 上で縦優位スワイプは navigate しない」を新規追加
- 「composition 中のスワイプは navigate しない」を新規追加

### App.test.tsx / BookshelfPage.test.tsx
- BookshelfPage の .root に overflow-y: auto のクラス適用確認（CSS 値を直接は assert できないので className で代替）
