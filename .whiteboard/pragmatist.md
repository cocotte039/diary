# Pragmatist 分析 — 実用性・最短経路・シンプルさ

## 視点の要約
- 「WritePage → EditorPage」の名称変更ではなく、**1ページ=1 textarea** へ根本転換する必要がある。ここが最大の構造変化。
- 既存資産の再利用: `notebook-surface` / `notebook-textarea` / 罫線背景 / `splitIntoPages` / autosave / `useCursorRestore` は設計継続できる。
- 本棚ページはほぼそのまま使える。VolumeCard のリンク先を `/book/:id/:page` に変えるだけ。
- ReaderPage のロジック（スワイプ、180ms フェード、ページ境界表示）は EditorPage にほぼ流用可能。

## 既存アーキテクチャの実態

### 1. 現行 WritePage は「1冊=1 textarea」モデル
- `useWrite` は冊全体の text を1本の string で保持 → autosave で `splitIntoPages()` → 複数 Page レコードに展開
- **新仕様は「1ページ=1 textarea」** なので `useWrite` は根本的に書き換え不要・むしろ捨てるのが妥当

### 2. データ保存の最小変更
- `saveVolumeText(volumeId, text)` は「冊全文を受けてページに分割保存」→ 新モデルでは使わない
- 代わりに `savePage(volumeId, pageNumber, content)` のような個別ページ保存関数が必要（既存 `saveVolumeText` を残しつつ新関数を追加）
- **既存データ互換**: `loadVolumeText` → `splitIntoPages` → ページ単位にすれば既存の冊でも表示・編集可能

### 3. `splitAtLine30(text)` の追加
- 仕様: 「テキストを受けて、30行までの `keep` と超過分の `overflow` に分割」
- 純関数なので Vitest で単体テストしやすい
- IME 対策は textarea 側で compositionEnd 監視し、その後に splitAtLine30 を走らせる

## 最短経路の提案

### 実装順序（Pragmatist 推奨）
1. **ルート切替だけ先行**: `/` を BookshelfPage に、WritePage を `/book/:volumeId/:pageNumber` にマウント（中身は据え置き）→ 動作確認
2. **EditorPage 新設（単一ページモード）**: 新しい独立コンポーネントとして作る。WritePage と並存させて段階移行
3. **ページめくりUI**: ReaderPage の左右スワイプ・フェードロジックを EditorPage に移植
4. **30行境界ロジック**: `splitAtLine30` を pagination.ts に追加、EditorPage で onChange に仕込む
5. **Volume.lastOpenedPage**: DB v1 → v2 マイグレーション。`onbeforeunload` もしくは移動時に書き込み
6. **WritePage / ReaderPage 削除**: 最後に残骸を除去

### 「書く」リンク削除
- BookshelfPage の `<Link to="/">書く</Link>` を削除
- SettingsPage の `<Link to="/">書く</Link>` は `<Link to="/">本棚</Link>` に置換
- WritePage の `新しいノート` ボタンは本棚に移動

## 変更ファイル見積もり（Pragmatist 視点）

| ファイル | 変更規模 | 内容 |
|---|---|---|
| `src/App.tsx` | 小 (+10行) | `/` の対応先切替、新ルート追加、redirect 追加 |
| `src/features/editor/EditorPage.tsx` | 新規 (200行前後) | 単一ページ textarea + ページめくり |
| `src/features/editor/EditorPage.module.css` | 新規 (80行前後) | `--header-height` 使用、罫線整合 |
| `src/features/editor/useEditor.ts` | 新規 (100行前後) | ページ単位の load/save、next/prev |
| `src/features/editor/DateIcon.tsx` | 新規 (20行) | SVG コンポーネント |
| `src/features/bookshelf/BookshelfPage.tsx` | 中 (+40行) | 新冊作成ボタン、確認ダイアログ、リンク先変更 |
| `src/features/bookshelf/VolumeCard.tsx` | 小 (-1/+1) | リンク先を `/book/:id/:page` に（lastOpenedPage 参照） |
| `src/lib/pagination.ts` | 小 (+15行) | `splitAtLine30` 追加 |
| `src/lib/db.ts` | 中 (+40行) | DB v2 upgrade、`updateVolumeLastOpenedPage`、`savePage` |
| `src/lib/constants.ts` | 小 (+2行) | `DB_VERSION = 2`、`HEADER_HEIGHT_PX` |
| `src/styles/global.css` | 小 (+3行) | `--header-height: calc(2 * var(--line-height-px))` |
| `src/types/index.ts` | 小 (+1行) | `Volume.lastOpenedPage?: number` |
| 削除 | - | `src/features/write/*`、`src/features/reader/*` |

推定総差分: +500 / -300 行程度

## 判断: 見送り推奨
- **MigrationError 時のロールバック機構** → 静けさ原則とスコープ外。純粋にスキーマ追加なので v1 → v2 は `onupgradeneeded` で lastOpenedPage のみ追加する最小変更で十分。
- **ページ番号の URL 形式を zero-pad (`/book/:id/01`)** → 整数で十分。zero-pad は表示用途のみ。
- **書き換え中の textarea 全置換時のカーソル位置管理**: React の制御コンポーネントで setSelectionRange すれば十分。専用フック不要。

## Pragmatist の結論
- マイルストーンは **M4: ルート再編 / M5: EditorPage 単一ページモード / M6: ページング詳細 + 本棚刷新 / M7: 日付アイコン + 整合・ポリッシュ** の4分割が最短・最小リスク。
- WritePage と EditorPage を一時並存させ、段階的に移行する。並存期間は1〜2コミット程度に抑える。
- M5 完了時点で「動く新UI」が得られる垂直スライス構造にできる。
