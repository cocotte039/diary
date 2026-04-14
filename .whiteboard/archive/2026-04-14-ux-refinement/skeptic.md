# Skeptic 分析 — リスク・エッジケース・回帰

## Critical リスク

### C1. **1冊=1 textarea → 1ページ=1 textarea への転換時のデータ破損リスク**
現行アーキテクチャは「冊全文を1本の text で保持 → saveVolumeText で分割保存」。
新UIで「ページ単位 savePage」に切り替える際、以下のケースで既存データが壊れる:
- ユーザーが M5 デプロイ後、**A ページ目にスクロールして編集 → 保存** したときに、新ロジックが「他ページの存在を知らない」状態で冊全体をまたぐ saveVolumeText を呼ぶと **B/C/D ページが消える**
- **緩和策**: 新 EditorPage では必ず `savePage(volumeId, pageNumber, content)` (単一ページ put) のみを呼び、他ページに触れない。旧 `saveVolumeText` は呼ばない。
- **検証**: 既存30ページを持つ冊を EditorPage で開き、3ページ目を編集・保存後、4〜30ページの content が保持されているか Vitest で確認。

### C2. **30行到達時の超過持ち越しが IME 入力中に発動する**
日本語変換中（composing）に30行目末尾に達すると、変換確定前に splitAtLine30 が走って変換候補がずれる・消える。
- **緩和策**: `isComposing` フラグを持ち、`compositionEnd` 後のみ splitAtLine30 を走らせる。onChange 中は splitAtLine30 をガードする。
- **検証**: 実機 iOS Safari + 日本語IME で30行目付近に変換文字列を入力して再現テスト。

### C3. **50ページ目末尾ロックの「ロック判定」が曖昧**
「50ページ目末尾では入力不可」の正確な定義が不明確:
- 50ページ目が **30行未満なら入力可、30行ちょうどで入力不可** なのか？
- 30行目の途中で `\n` を打ったら？改行入力のみブロック？全文字ブロック？
- **提案仕様**: 「splitAtLine30(nextText) が overflow を返したとき、かつ現在ページが50ならその入力変更を拒否（setState しない）」。onBeforeInput で弾くのが確実。
- **トースト無し** は合意済みだが、ユーザーが「あれ？打てない」となる。**キャレットを最終位置で一瞬点滅** 程度の視覚フィードバックは検討推奨。

### C4. **Volume.lastOpenedPage のデフォルト値が undefined のときの挙動**
既存冊は `lastOpenedPage` が存在しない。
- マイグレーション時に一括で `1` を入れる？→ 「最後に開いたページ」の意味と合わない
- 合意済み仕様: **未設定時フォールバック = 最終更新ページ**（最も updatedAt が新しい Page の pageNumber）
- **緩和策**: BookshelfPage から冊タップ時、`volume.lastOpenedPage ?? await computeLatestPage(volumeId)` で解決。getPagesByVolume → updatedAt max を取るヘルパを追加。

## High リスク

### H1. **DB v1 → v2 マイグレーションの後方互換破壊**
`DB_VERSION = 2` に上げると `upgrade` が走る。新規フィールド追加のみなら安全だが:
- 既存ユーザーが古い bundle を開いた後、新 bundle に戻すと idb が v2 → v1 のダウングレードを拒否しクラッシュ
- **緩和策**: PWA の Service Worker で新版がキャッシュされる前に古い bundle に戻るケースは実質起こりにくいが、テスト用に `_resetDBForTests` 並の復旧ツール（設定画面の「データを初期化」）を将来のために検討。今回スコープでは注記のみ。
- **upgrade 関数の追記内容**: `if (oldVersion < 2) { /* 何もしない。lastOpenedPage は optional */ }` で OK。型だけ追加、既存レコードに書き込み不要。

### H2. **ルートリダイレクト `/read/:id/:page` → `/book/:id/:page` が SW キャッシュと競合**
既存ユーザーのブックマーク・PWA の外部リンクに `/read/:id/:page` がある可能性。
- **緩和策**: `<Route path="/read/:volumeId/:pageNumber" element={<Navigate to="/book/:volumeId/:pageNumber" replace />}>` のような React Router での redirect を追加。HashRouter なので SW には影響しない。

### H3. **autosave debounce 2秒中にページめくりが起きるとデータロス**
EditorPage でページA編集 → debounce待機中 → 次ページBへナビゲート → A のpending保存が B のページに書かれる**わけではない**が、A の未保存分が失われる可能性。
- **緩和策**: ページ遷移時（prev/next/URL変更）に debounce を flush → 即保存してから遷移。`useAutoSave` に `flush()` API を追加するか、EditorPage 側で遷移前に `savePage(volumeId, current, text)` を同期呼び出し。

### H4. **スワイプ操作と textarea 内の選択操作の競合**
ReaderPage では読み取り専用のため左右スワイプを root に付けていたが、EditorPage では textarea が全面を占める。textarea 上での左右スワイプは「カーソル移動・選択」と被る。
- **緩和策案**:
  - A案: スワイプは **ヘッダー下の余白 or ページ番号領域** だけで反応（領域限定）
  - B案: 2本指スワイプならページめくり、1本指はカーソル移動（iOS Safari でサポートされる）
  - C案: **明示的な左右ボタン** を主とし、スワイプは見送り（最もシンプル・誤動作なし）
- 合意事項: 「左右スワイプ/ボタン」両方。→ スワイプは**領域限定 or 2本指**のいずれかで、合意事項に含まれる「スワイプ」を残すなら A/B を選択。Pragmatist 視点では C 案が最短だが要件に含まれる。

### H5. **持ち越し時のカーソル位置計算**
「超過分を次ページ先頭に prepend、カーソル移動」の具体仕様:
- ユーザーが30行目末尾で `\n` を打つ → 31行目に文字が入力される前にページ移動
- 超過分が「改行のみ」の場合、次ページ先頭の1行目が空行になる（意図と合う？）
- prepend って「結合」なのか「上書き」なのか不明確
- **提案仕様**:
  - `splitAtLine30(input)` で `keep`(30行) と `overflow`(残り) を得る
  - 現在ページを `keep` で保存
  - 次ページをロード → `overflow + '\n' + nextPageContent` で上書き
  - カーソル位置は次ページロード後 `overflow.length`（overflow 末尾）に置く
- **エッジケース**: 次ページが存在しない場合 → 新規ページを作成（pageNumber + 1）

## Medium リスク

### M1. 新冊作成の確認ダイアログが `window.confirm` だと静けさを壊す
SettingsPage は既に `window.confirm` を使っているので一貫性はある。ただし BookshelfPage は今まで confirm を使っていない。
- **緩和策**: 既存の `window.confirm` 流儀に合わせつつ、本文を簡潔に「現在の冊は X / 50 ページです。新しい冊を作りますか？」に留める。

### M2. 初回起動時の自動冊作成が二重発火
`useEffect` で `ensureActiveVolume` を呼ぶと、React 19 の StrictMode で2回発火する。`ensureActiveVolume` は「activeが0個なら作成」なのでトランザクション内で冪等だが、race condition で2冊作られる可能性。
- **緩和策**: `ensureActiveVolume` のトランザクションロジックを再確認。現状 `actives.length === 0` 判定後 `put` までが1トランザクションなので安全（既に idb が保証）。**ただし開発時に2冊作られたケースは `ensureActiveVolume` 内で2個以上 active を `completed` 化するロジックで回収**。

### M3. 日付アイコンのタップ領域が小さい
`stroke 1.5, 16x16` の SVG は視覚的には良いが、タップターゲットが最低 44x44 必要（Apple HIG）。
- **緩和策**: ボタン自体は 44x44 以上のヒットエリアを確保し、内部に 16x16 SVG を中央配置。

### M4. `--header-height = 2行分 = 57.6px` だが、safe-area-inset-top を含まない
iOS のノッチ端末で top インセットが加わると、本文開始位置がノッチ分下にずれる → 罫線と重なる可能性。
- **緩和策**: `--header-height` 自体は固定値、本文の `margin-top` は `calc(var(--header-height) + env(safe-area-inset-top))` かつ **background-position も同じ値でシフト**。

### M5. 既存の useCursorRestore は `LS_CURSOR_KEY` をグローバルに共有
- 冊・ページ単位に切り替える際、キーに volumeId/pageNumber を含める必要がある
- さもなくば冊 A のページ 3 のカーソルが 冊 B のページ 5 に復元される
- **緩和策**: キーを `note-cursor-position:${volumeId}:${pageNumber}` にスコープ化

## Low リスク

### L1. アーカイブ済みテストが pagination.test.ts のみ → EditorPage のロジックテストが不足
### L2. モノクロ SVG の stroke が「現在 opacity 0.3」で極端に薄くなる可能性 → 実機確認必須
### L3. PageUp/PageDown キーは textarea のデフォルト挙動（スクロール）と競合 → preventDefault + 自前遷移

## 合意済み要件から見逃されている可能性のある論点

### Q1. 「冊タップで最後に開いたページ」の更新タイミング
- ページ遷移のたびに `lastOpenedPage` を更新する？ それとも EditorPage unmount 時？
- **推奨**: ページ遷移のたびに更新（debounce 500ms 程度）。unmount は iOS でキャッチ不確実。

### Q2. 本棚画面でも `--header-height` を適用するか
- BookshelfPage のヘッダー高さと EditorPage のそれを揃える必要性は？
- **推奨**: BookshelfPage は罫線を持たないので必須ではないが、視覚一貫性のため揃える。

### Q3. `/read/:id/:page` redirect は単方向か？ 逆も必要か？
- 合意事項: 単方向（旧 → 新）のみ。OK。

## 回帰テスト方針

1. **既存冊の表示・編集**: 30ページを持つ冊を新EditorPageで開き、任意ページを編集後、他ページが保持されることを確認
2. **冊ローテーション（旧: rotateNow）**: 新UIでは本棚から新冊作成ボタン経由のみ。旧 `rotateNow` は呼ばれない。
3. **autosave debounce**: EditorPage で入力 → 2秒後に savePage が呼ばれ、即ナビゲート時は flush される
4. **カーソル復元**: volumeId/pageNumber ペアに紐づくキーで復元されること
5. **GitHub 同期**: Page レコードの pending ステータスが引き続き機能
6. **PWA 起動**: マニフェストの start_url が `/` のままで正常起動（本棚が表示される）

## Skeptic の結論
- **最大のリスクは C1（ページ保存時の他ページ破壊）と C2（IME 中の自動遷移）**。これらは M5 の受入条件に明示すべき。
- DB マイグレーションは v2 で最小。ただし lastOpenedPage は optional にして旧データでもクラッシュしないこと。
- スワイプ vs textarea カーソル操作の競合（H4）は実機で判断するしかない。**デフォルトは左右ボタン主、スワイプは領域限定** を推奨。
- 自動冊作成（M2）、持ち越しカーソル（H5）、ロック挙動（C3）は spec で明文化しないと実装揺れが生じる。
