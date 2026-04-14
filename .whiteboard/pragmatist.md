# Pragmatist — 実用性・最短経路分析

## 視点
最短の変更量で 5 つのユーザー要望を満たす。既存アーキテクチャ（EditorPage の fade + goPage 配線、global.css の `.app-header-link` / `--header-height`）は完成度が高いので、同じパターンをコピペで横展開するのが最速。

## 各要望の最短解

### 1. textarea 上でもスワイプでページめくり
- 現行 `onTouchStart` / `onTouchEnd` は `isFromTextarea` で textarea 内のタッチを無視している。
- **最短**: `isFromTextarea` 判定を撤廃し、水平優位判定 `|dx| > |dy|*2` に変更するだけ。
- textarea 内での横スクロール発生を防ぐため CSS `overflow-x: hidden` を確認（notebook-textarea に既に適用されていれば OK）。
- 実装行数: 約 10 行削減 + 判定強化 1 行。

### 2. BookshelfPage / SettingsPage ヘッダー固定
- EditorPage のパターン（position:fixed、height = --header-height + safe-area-inset-top、padding-top で本文を逃がす）がすでに完成。
- **最短**: 同じ CSS ブロックを BookshelfPage.module.css / SettingsPage.module.css の `.header` にコピペし、`.root` の `padding-top` を `calc(var(--header-height) + env(safe-area-inset-top, 0px) + 1rem)` に差し替える。
- 既存 `.root` は `min-height:100dvh` だが、ヘッダー fixed 化後も既存 padding を維持する必要あり。本文マージン 1rem は既存の `max(1rem, env(safe-area-inset-top))` を padding-top の中に吸収する。

### 3. ヘッダー端からの距離を少し内側に
- 現在 EditorPage の header は `padding-left/right: max(0.5rem, env(safe-area-inset-*))`。
- **合意済み**: `max(1rem, env(safe-area-inset-*))` に統一。
- EditorPage / BookshelfPage / SettingsPage 3 か所を同時に修正。
- 1rem = 16px は "端から 16px" = 静けさを壊さない控えめな内側化。

### 4. 余分なノートの削除手段
- **最短配線**: `deleteVolume(volumeId)` を db.ts に追加 → VolumeCard で長押し検知 → `window.confirm` 2 段階で OK → deleteVolume → reloadKey++。
- 長押しは **Pointer Events** 推奨（touch と mouse を一本化できる。setTimeout で 500ms 計測、pointermove で閾値超え / pointerup でキャンセル）。
- 2 段階 confirm（ページ 1 枚以上ある冊のみ）:
  1. 「第N冊（Mページ記入済み）を削除しますか？」
  2. 「本当に削除？ この操作は取り消せません。」
- ページ 0 枚（まっさら active 新冊など）なら 1 段階確認のみで良い。
- active/最終冊ロックなし = ユーザー選択どおり。ただし削除後 volume 0 件になる場合は `ensureActiveVolume` が次回 useEffect で自動 1 冊作成するので自然復旧。

### 5. 本棚ページの上下スクロール
- 根本原因: `global.css` に `body { overflow: hidden }` がある。これは EditorPage の全画面 textarea のための設定。
- BookshelfPage `.root` は `min-height:100dvh; overflow-y:auto` なので、`.root` に高さ制約がないと body の overflow:hidden が勝ってスクロールしない。
- **最短**: BookshelfPage `.root` を `height: 100dvh; overflow-y: auto` に変更（`min-height` → `height`）。SettingsPage も同様に。
- これだけで `.root` 内部のスクロールが働く。body の overflow:hidden には触れない（EditorPage の副作用防止）。

## 推奨実装順序（依存最小）

1. **db.ts: deleteVolume 追加** — 独立、テスト容易
2. **共通ヘッダー CSS の規格化** — global.css に `.app-header` 共通クラスを足す案もあるが、既存 3 ページの CSS Module 内で同じパターンをコピペする方が副作用なく最短
3. **BookshelfPage / SettingsPage ヘッダー固定化 + スクロール修正**（CSS のみ）
4. **EditorPage スワイプ B 案化**（TSX 10 行変更）
5. **VolumeCard 長押し削除 UI**（新規 50〜80 行 + テスト）

## 設定分離
- 長押し時間: `LONG_PRESS_MS = 500` を `src/lib/constants.ts` に追加
- 長押しの移動許容: `LONG_PRESS_MOVE_TOLERANCE_PX = 10` を追加（指ブレでキャンセルされない）
- これらを定数化しておくと実機調整が楽

## 情報構造の提案
- 削除メニュー UI は **モーダル回避** でカード上のオーバーレイ（「削除する／キャンセル」2 ボタン）を推奨。確認ダイアログで十分なら `window.confirm` 2 回でも OK（既存 rotateVolume のパターンと揃う）。
- **推奨**: `window.confirm` 2 段階（モーダル実装が不要で配線が最短）。静けさ原則にも合致。

## スコープ外（やらない）
- GitHub 側の volume 削除伝搬（`pendingDeletes` キュー等）→ ローカル削除のみ、GitHub 上のバックアップは残す（ユーザーが手動削除可能）
- スワイプ追従アニメーション（既存 opacity フェード維持）
- 全件削除（エクスポート経由で代替）
