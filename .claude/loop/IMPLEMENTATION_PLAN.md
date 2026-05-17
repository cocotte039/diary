# 実装計画 — メモ一覧 ハンバーガーメニュー + メモカレンダー + ペンFAB

詳細は `.whiteboard/plan.md` を正とする。本ファイルは /build 互換のサマリ。

## 概要
LogListPage（メモ一覧=観測ログ）に本棚側と同作法で 3 機能追加: ①メモ専用ハンバーガー（カレンダー/設定）②メモ専用カレンダーモーダル（memos 対象・日記 pages と別管理・日付タップで該当日付グループへ瞬間スクロール）③ペンFAB（/log/new・戻り先/log）。日記側（BookshelfPage/BookshelfMenu/Calendar/EditorPage）不変・「静けさ」維持。単一マイルストーン M1。

## M1: メモ一覧 メニュー+カレンダー+ペンFAB

検証: `npx tsc --noEmit && npx vitest run`

### Wave 0: 基盤（独立並行可）
- **T0-1** db.ts `getMemoDateSetInMonth(year,month)` 追加（getDateSetInMonth 同型・memos 対象）
- **T0-2** Fab.tsx `from?:string`（既定 '/'）prop 化。本棚 `<Fab/>` 完全不変

### Wave 1: メニュー + メモ作成導線
- **T1-1** MemoMenu.tsx 新規（BookshelfMenu 複製・項目=カレンダー/設定の2つ）
- **T1-2** MemoMenu.module.css 新規（BookshelfMenu.module.css 複製）
- **T1-3** LogListPage: `<MemoMenu>`+`<Fab from="/log"/>` 配線・showCalendar state
- **T1-4** LogListPage.module.css: `.header` align-items:baseline / `.body` padding-bottom（FAB被り防止）

### Wave 2: メモカレンダー + 日付スクロール
- **T2-1** MemoCalendar.tsx 新規（Calendar 複製・onPick(dateKey)化・空メモ日 early return 無反応）
- **T2-2** MemoCalendar.module.css 新規（Calendar.module.css 複製）
- **T2-3** LogListPage: 各 section に `id={`memo-date-${dk}`}` / カレンダーモーダル（role=dialog/aria-modal）
- **T2-4** LogListPage: `scrollToDate`（setShowCalendar(false)→二重rAF→scrollIntoView）+ Esc閉じ useEffect
- **T2-5** LogListPage.module.css: `.calendarOverlay/.calendarPanel/.calendarClose/@keyframes fadeIn` 複製

### Wave 3: テスト
- **T3-1** Fab/MemoMenu/MemoCalendar/LogListPage テスト追加更新・本棚 FAB 非回帰確認

## 非目標（厳守）
日記側 BookshelfPage/BookshelfMenu/Calendar.tsx/EditorPage 挙動変更 / Calendar・BookshelfMenu 共通化リファクタ / Fab の shared 移動 / per-date ルート新設 / メモ backup(github.ts) 変更 / 過去日付メモ作成 / 新規色 / transition>200ms / バッジ・件数・通知 / focus trap・scroll lock（本棚同水準=未実装で揃える）
