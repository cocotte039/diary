# Aesthete — 視覚・UX・認知負荷分析

## 視点
日記アプリは「静けさ」が正義。削除 UI や固定ヘッダー導入で視覚ノイズを増やさないこと、そして画面間でヘッダーのフォルムを完全に一致させて「同じ世界」の一貫性を保つことを重視する。

## 各要望の UX 設計

### 1. textarea 上スワイプ (FR1)
**体験設計**:
- 紙のノートを捲る感覚を textarea 全面で受け止める → メタファが強化される。
- 現状は textarea 外余白でしか反応せず、モバイルだと余白が狭く実用上スワイプできない。B 案への移行は UX 的に必須。
- フェード 180ms は維持（既存の静かな遷移）。スワイプ追従アニメは導入しない（合意済み非目標）。
- **認知負荷**: ユーザーは「指を横に動かすと次ページ」をすぐ学習する。水平優位 2:1 の強化で誤作動を感じさせない。

### 2, 3. ヘッダー固定化 + パディング統一 (FR2, FR3)
**視覚一貫性の要**:
- 現状、EditorPage ヘッダーは固定で padding は 0.5rem、BookshelfPage / SettingsPage は static で padding は var(--padding-page)=1rem。
- 3 画面で文字の左端位置が揃わず、ページ遷移時に微妙なズレとして認識される。
- **統一仕様**:
  - 高さ: `calc(var(--header-height) + env(safe-area-inset-top, 0px))` = 57.6px + ノッチ
  - 左右 padding: `max(1rem, env(safe-area-inset-left/right))`
  - 背景: `var(--color-bg)`（本体と同色でシームレス）
  - position: fixed / top: 0 / left: 0 / right: 0 / z-index: 2
- **余白感**: 1rem = 16px は「端からひと指分」。0.5rem は狭すぎて押しにくかった（ユーザー指摘の通り）。

**垂直方向の調整**:
- BookshelfPage: `.root` padding-top = `calc(var(--header-height) + env(safe-area-inset-top, 0px) + 1rem)`。
  - +1rem は既存 `.header` の `margin-bottom: 1.5rem` を吸収（ヘッダー fixed 化で .header は flow から外れるため）。
  - グリッド 1 行目のカード上端がヘッダー下から 1rem 離れる = 呼吸できる余白。
- SettingsPage も同様。既存の section の margin 1.5rem と衝突しないよう、section:first-child の margin-top を 0 にしたい。ただし副作用回避のため padding-top で十分空いていればそのままで良い。

**構造**:
- global.css に共通クラス `.app-header` を新設することを推奨（現状 CSS Module ごとにコピペすると 3 箇所バラバラに diverge しやすい）。ただし既存の `.app-header-link` が global.css にあるので、`.app-header` も global.css で管理する方が自然。
- CSS Module 側は `className={\`\${styles.header} app-header\`}` の二重指定にするか、CSS Module を廃して global.css に寄せる。
- **推奨**: global.css に `.app-header { ... }` を定義し、3 画面の header 要素で `className="app-header"`（または併用）。CSS Module の `.header` は移行期間用に残す。

### 4. 削除機能 (FR4, FR5)
**静けさ原則との両立**:
- 削除は破壊的操作なので、目立つべきではないが見つけられなければならない。
- **長押しアフォーダンス**: 長押しで発動、視覚的に「押し込まれる」フィードバック（transform: scale(0.98) or opacity 0.6）を 200〜500ms で徐々に変化させる。→ 「何かが起きそう」を伝え、500ms で confirm。
- **メニュー vs confirm**:
  - オーバーレイメニュー（削除する／キャンセル）: カード上にモダンな UI。実装コスト高、視覚ノイズあり。
  - `window.confirm` 2 段階: ネイティブ、UI コードなし、既存 rotateVolume パターン踏襲。静けさ原則に忠実。
  - **推奨**: **window.confirm 2 段階**。1 回目で誤長押しを弾き、2 回目でデータロス最終確認。
- **メッセージ設計**（トーンを柔らかく、でも明確に）:
  - 1 回目: `「第N冊（Mページ記入済み）を削除しますか？」`
  - 2 回目: `「本当に削除しますか？ この操作は取り消せません。」`
  - ページ 0 枚の冊（まだ書いていない）: 1 回目のみ `「まだ書いていない第N冊を削除しますか？」`
- **削除後のフィードバック**: トーストなし。カードがフェード消去（200ms opacity）で静かに消える。これで十分。

**長押しの視覚フィードバック**:
- 500ms 経過直前に `cursorActive` (existing) と同等の「浮き上がり」解除 or opacity ドロップ。
- 単純案: CSS `:active` で `transform: scale(0.98)` のみ。過度な演出はしない。

### 5. 本棚スクロール (FR6)
**視覚的影響**:
- 冊が多くなると下に溢れる。カレンダー Toggle / カレンダー自体が縦に長いので、スクロールできないと実質カレンダーが使えない状態。現状はかなりユーザビリティが壊れている。
- 修正後、スクロールバーは global.css で `::-webkit-scrollbar { width: 0 }` 済み = 静けさ保持。
- **認知負荷**: 「スクロールすればカレンダーが出る」という気付きが必要。ヘッダー固定化＋スクロール可能化で「下に何かある」の期待が明確になる。

## 視覚ヒエラルキーの整理

### ヘッダー 3 画面共通
```
[左] 本棚/戻るリンク（opacity 0.3, UI font 0.75rem）
[中] (Editor のみ) ページ番号クラスタ
[右] (Editor) 日付ボタン + 設定リンク / (Bookshelf) 設定リンク / (Settings) 本棚リンク
```
→ 「左は戻る」「右は設定」の規則が全画面で統一される。

### 本棚
- ヘッダー下に h1「本棚」が出ていたが、現在 `styles.title` = 1.25rem で大きめ。ヘッダー固定化後、h1 title はヘッダー内に残す（既存通り）。
  - 注: EditorPage はヘッダー内にタイトルなし（ページ番号表示）、BookshelfPage は h1「本棚」、SettingsPage は h1「設定」。 
  - 一貫性のため、3 画面ともヘッダー内 h1 相当の視覚トーンを揃える。
  - ただし EditorPage は「紙面の純度」を保つため h1 なし（現行通り）。

### 削除時の UI
- 長押しカード: `:active` で `opacity: 0.6; transform: scale(0.98)`。その後 confirm。
- 削除後: カードが 200ms フェードで消え、grid が flex で詰まる（transition で）。

## 統一仕様（再掲）

### ヘッダー共通スタイル（global.css に `.app-header` 追加推奨）
```css
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: calc(var(--header-height) + env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 2;
  background-color: var(--color-bg);
  font-family: var(--font-family-ui);
}
```

### .root ヘッダー分オフセット
```css
.root {
  height: 100dvh;         /* was min-height */
  padding-top: calc(var(--header-height) + env(safe-area-inset-top, 0px) + 1rem);
  padding-left: var(--padding-page);
  padding-right: var(--padding-page);
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  overflow-y: auto;
}
```

## 優先度判断
1. **Critical 体験**: textarea スワイプ（FR1）— 現状操作不能に近い
2. **Critical 信頼性**: 削除機能（FR4/5）— ユーザーが困っている最上位要望
3. **Critical 操作性**: 本棚スクロール（FR6）— バグ級の UX 破綻
4. **High 一貫性**: ヘッダー固定 + パディング（FR2/3）— 複数画面での統一
