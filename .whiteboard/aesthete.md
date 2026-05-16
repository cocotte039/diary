# Aesthete 分析 — 時系列メモ機能（観測ログ）

視点: 視覚的美しさ・UX・一貫性・認知負荷・「静けさ」設計原則

## 1. ヘッダータブ「本棚 / メモ」（🟡 推奨確定）

現状 BookshelfPage は `<h1 class={styles.title}>本棚</h1>`（font-family 明朝, 1.25rem）+ 右に BookshelfMenu。`.app-header-link` は opacity 0.3→active 0.6, 0.75rem, font-family-ui。

**推奨デザイン**:
- BookshelfPage の h1「本棚」を**廃止し、HeaderTabs（テキスト2項目）に置換**。理由: タブとh1併存は2つの「現在地表示」で冗長＝認知負荷増。タブ自体が現在地を示す。
- タブ表現（静けさ準拠、下線バー/塗りハイライト/カウンタは置かない）:
  - 非選択タブ: `.app-header-link` 同等 opacity 0.3
  - 選択中タブ: opacity 0.85（明示だが煽らない。色は変えず不透明度のみで階層表現＝既存言語と一貫）
  - font: font-family-ui 0.8rem（h1 の明朝感は捨て、UI要素として統一）。区切りは中黒や「/」を opacity 0.2 で 1 個
  - press feedback: opacity transition 120ms（既存 .app-header-link と同じ）
- EditorPage/SettingsPage の左上「本棚」`.app-header-link` はそのまま（戻る導線であってタブではない）。タブは本棚画面とメモ一覧画面のヘッダーにのみ出す（2画面の相互行き来）。一貫性: タブも .app-header-link の色/フォント言語を継承するので異物感なし。🔵

## 2. FAB デザイン（🟡 推奨確定）

本棚画面右下。`.body` は `overflow-y:auto` なのでFABは `.root`（fixed）に置きスクロール非追従。

**推奨値**:
- 位置: `position: fixed; right: max(1rem, env(safe-area-inset-right) + 0.5rem); bottom: max(1.25rem, env(safe-area-inset-bottom) + 0.75rem)`（親指到達域・iPhone home indicator 回避）
- サイズ: 52px 円（タップ44px+余白確保しつつ静か。56px Material 標準より控えめ）
- 背景: `--color-accent #3a3545`（4色内。透過だとカード上で視認不安定、accent が最も静か）。border `1px solid var(--color-rule)`
- アイコン: 鉛筆 SVG, `stroke="currentColor"` `stroke-width="1.5"`（BookshelfMenu と統一）, color = --color-text, viewBox 20x20 同系。塗りなし線画で静けさ
- press feedback: `transform: scale(0.94)` + opacity 0.8、transition 150ms（200ms以内）。影は最小 `0 2px 8px rgba(0,0,0,0.3)`（VolumeCard cardActive と同レンジ）
- グリッド重なり回避: `.body` 末尾に FAB 高さ + 余白ぶんの padding-bottom（カード最下段がFABに隠れない）
- aria-label「メモを書く」

## 3. メモ入力画面レイアウト（🟡）

観測ログ=短文・摩擦最小。EditorPage の罫線ノート(notebook-surface 60行罫線)は「日記」の重い体験 → メモには**過剰**。

**推奨**: EditorPage の構造言語（.app-header + surface + textarea）は踏襲しつつ、**罫線なしのプレーン textarea**（`--color-bg` 背景、行罫線描かない）。日記＝罫線ノート、メモ＝素の紙、で体験を質的に分離（情報構造の明確化）。
- ヘッダー: 左=戻る `.app-header-link`。文言は「‹ 本棚」(新規・遷移元本棚時) / 「‹ メモ」(編集・一覧から)。アイコンは EditorPage の ‹ 文字流用で軽量・一貫
- 自動フォーカスなし（🔵 静けさ要件、EditorPage は focus するがメモは「開いただけで急かさない」）
- 自動時刻表示: 編集画面で createdAt を**ヘッダー右に控えめ表示**（`YYYY/MM/DD HH:MM` font-family-ui 0.7rem opacity 0.3）。観測ログの目的「いつ触れたか」に資する最小情報。新規（未保存）時は非表示。🟡
- textarea: フォントは本文 --font-family（明朝、書き心地の一貫）、padding 1rem、自動高さ伸張は不要（短文・スクロールで足りる、EditorPage の scrollHeight 追従は流用してもよいが ROI 低）

## 4. メモ一覧画面の情報設計（🟡）

**推奨レイアウト**（新しい順、日付グルーピング）:
- 画面: .app-header（HeaderTabs）+ .body（overflow-y:auto, BookshelfPage と同 padding）
- 日付見出し: `YYYY/MM/DD`（VolumeCard formatRange と同表記）, font-family-ui, 0.75rem, opacity 0.5, 上 margin 1.5rem（グループ区切りの呼吸）。sticky にしない（静けさ・実装簡素）
- メモ行: 時刻 `HH:MM`（opacity 0.4, font-family-ui, 0.7rem, 行頭）+ 本文プレビュー（--font-family, 1rem, 最大2行 `-webkit-line-clamp:2`, opacity 0.85）。1行に時刻、下に本文 or 時刻インライン先頭。推奨: 時刻を本文左にインライン（`14:32  本文…`）で時系列スキャン容易
- 行間: padding 0.75rem 0、区切り線は引かない（罫線過多は静けさに反する。余白で分離）
- 空メモプレビュー: 「（空のメモ）」opacity 0.3 斜体相当（Skeptic C8 と整合）
- 長押し削除ヒント: 出さない（🔵 VolumeCard も出していない、静けさ一貫）。onContextMenu preventDefault も踏襲
- 空状態: 「まだメモがありません」BookshelfPage `.empty`（opacity 0.5, 中央, margin-top 4rem, font-family-ui）踏襲
- タップ領域: 行全体（44px 高さ確保）、active で opacity 微変化

## 5. 認知負荷・注意管理

- 本棚⇔メモのタブ行き来: 2タブ固定・色変えずopacityのみで階層 → 注意分散最小。タブが2画面の唯一の往復路で迷子化しない
- 観測ログの「振り返りやすさ」: 日付グルーピング+時系列降順+時刻インラインで「いつ何に触れたか」が一覧スキャンで成立。検索なし（非目標）でも件数想定なら線形スキャンで足りる
- 「作成摩擦の低さ」: FAB 1タップ→即 textarea（自動フォーカスなしだが1タップで入力可）、暗黙保存、保存ボタン/トーストなし → 摩擦ほぼゼロ。タイトル/タグ強制なし（非目標準拠）が摩擦低減の核
- トレードオフ: タブ・FAB は新規UI要素＝静けさへの「追加」。だが (a) FABはモノクロ線画・accent背景で沈黙的 (b) タブは既存 .app-header-link 言語の延長 → 異物感を最小化。動機づけ要素（件数バッジ・連続記録）は一切置かない＝静けさ核は不可侵

## 6. 200ms 以内トランジション計画（🔵）

| 遷移 | 方式 | 時間 |
|---|---|---|
| タブ切替（本棚⇔メモ） | ルート切替（react-router）。フェード入れるなら opacity 200ms（--transition-soft）。最小実装は即時でも可 | ≤200ms |
| FAB → メモ入力 | navigate。フェードなし即時 or opacity 150ms | ≤200ms |
| 一覧 → 編集 | navigate 即時 | ≤200ms |
| FAB press | scale 0.94 + opacity, 150ms | 150ms |
| 一覧アイテム active | opacity 120ms（.app-header-link 系） | 120ms |
| 空状態フェードイン | 不要（静けさ、過剰演出回避） | - |

EditorPage の 180ms ページフェードは「ページめくり」固有体験。メモは画面遷移なのでフェード強制せず即時で軽快＝摩擦低減に資する。

## 7. 新規CSS構成（既存 *.module.css 規約準拠）

- `src/features/shared/HeaderTabs.module.css`: `.tabs`, `.tab`, `.tabActive`, `.sep`
- `src/features/log/LogListPage.module.css`: `.root`,`.body`,`.dateHeading`,`.item`,`.time`,`.preview`,`.empty`,`.emptyMemo`
- `src/features/log/MemoEditorPage.module.css`: `.root`,`.header`,`.headerMeta`,`.surface`,`.textarea`
- FAB: BookshelfPage.module.css に `.fab`,`.fabIcon` 追記（本棚固有なので新ファイル不要、ROI）
- 既存 `.app-header`/`.app-header-link`/CSS変数（4色, --transition-soft, --header-height, safe-area）を最大限再利用、新規色トークンは作らない（4色厳守）

## デザイン確定値サマリ（Build Agent 採用可）
- タブ: h1廃止→HeaderTabs、非選択 opacity 0.3 / 選択 0.85、font-family-ui 0.8rem
- FAB: fixed 右下 52px円、bg --color-accent、鉛筆線画 stroke 1.5 currentColor、press scale0.94/150ms
- メモ入力: 罫線なしプレーン textarea、明朝、自動フォーカスなし、戻る ‹ リンク、編集時 createdAt 控えめ表示
- 一覧: 日付見出し YYYY/MM/DD opacity0.5、行=時刻インライン+本文2行clamp、区切り線なし余白分離、空状態 .empty 踏襲
