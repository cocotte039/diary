# Plan — ページ単位を「文字数」へ / ヘッダー固定スクロール / 進捗バー（2026-04-15）

## Goal

1. 1 ページの単位を「行数 60」から「文字数 1200」に切り替える。端末解像度依存を排し、日記アプリとしての「紙 1 ページ相当」を文字量で規定する。
2. 非フォーカス時でもページを上下にスクロール可能にし、スクロール中もヘッダーを常時固定表示にする。
3. ページ残量を示す 10 分割目盛り付きプログレスバーをヘッダー直下に常時表示する。

## チーム構成

- Pragmatist: リネーム最小化、定数分離、ロジック単純化、ROI 優先
- Skeptic: 既存データ互換、回帰リスク、最終ページロックの UX、テスト壊滅リスク
- Aesthete: プログレスバーの静けさ・情報量、罫線との一貫性、外側スクロール体験

## Context（確認済みコード）

- `src/lib/constants.ts`: `LINES_PER_PAGE=60`, `PAGES_PER_VOLUME=50`, `LINES_PER_VOLUME=LINES_PER_PAGE*PAGES_PER_VOLUME`, `LINE_HEIGHT_PX` 派生
- `src/lib/pagination.ts`: `getPageNumber`, `countLogicalLines`, `countPages`, `splitIntoPages`, `joinPages`, `splitAtLine30`, `getScrollTopForCursor` — すべて `LINES_PER_PAGE` 前提
- `src/features/editor/EditorPage.tsx`: `checkOverflowAndNavigate` が論理行 + 視覚行の二段判定。`ensurePaperHeight` で padding-bottom を動的調整。`handleBeforeInput` で 60 ページ目を行数ベースでロック
- `src/features/editor/EditorPage.module.css`: `.surface` は `overflow` 無し、`.textarea` が `overflow-y: auto`（内部スクロール）
- `src/styles/notebook.css`: 罫線は `background-attachment: local`、`.notebook-textarea { height:100%; overflow:auto 相当 }`
- `src/styles/global.css`: `.app-header { position: static; flex-shrink:0 }`（すでに fixed は撤廃済）。`--lines-per-page: 60`, `--page-height-px` 定義済
- `src/features/editor/EditorPage.test.tsx`: overflow/lock 系テストが `LINES_PER_PAGE` 多用
- `src/lib/pagination.test.ts`: `splitAtLine30` など全面的に行数依存
- `src/lib/db.test.ts`: 3 ページ生成テストが `LINES_PER_PAGE` 依存

## スコープ

### やること
- 論理判定の単位を「文字数 1200」に移行（overflow、最終ページロック、関連関数）
- 1 冊のページ数を 60 に拡大（50 → 60）
- 視覚行オーバーフロー保険（scrollHeight 分岐）を削除
- `.surface` を外側スクロールコンテナに変更、textarea 自身の内部スクロールを廃止
- ヘッダー直下にプログレスバー（高さ 3px、10 分割 tick、モノクロ、数値なし）を常時表示
- 既存テスト群を文字数ベースに書き換え

### やらないこと（非目標）
- 紙幅の固定（端末幅追従のまま）
- 既存冊コンテンツの再ページング（1200字超のページをロード時に分割しない）
- プログレスバーの色変化・数値表示・アニメーション
- 過去定数 `LINES_PER_VOLUME` の保存データ互換（使用箇所がなければ削除）

## 設計方針

### D1. 定数の二層分離（🔵）

`src/lib/constants.ts`:

```ts
/** 1ページあたりの文字上限（text.length、改行含む）。M10 で行数→文字数に変更。 */
export const CHARS_PER_PAGE = 1200;

/** 罫線・紙高さのための視覚上の行数。1 ページの紙に描く罫線の本数。
 *  CSS `--lines-per-page` と同期させること。CHARS_PER_PAGE とは独立。 */
export const LINES_PER_PAPER = 60;

/** 1冊あたりのページ数。M10 で 50 → 60。 */
export const PAGES_PER_VOLUME = 60;

// LINE_HEIGHT_PX / FONT_SIZE_PX / HEADER_HEIGHT_PX / LINE_HEIGHT_EM は維持
// LINES_PER_PAGE は削除（LINES_PER_PAPER に置換）
// LINES_PER_VOLUME は削除（参照箇所がなければ）
```

**理由**: 「文字数判定」と「罫線の視覚上の行数」は別概念。一つの定数に混ぜると保守時に壊れる（Pragmatist）。

### D2. pagination.ts の書き換え（🔵）

- `splitAtLine30` → `splitAtCharLimit(text)`: `{ keep: text.slice(0, CHARS_PER_PAGE), overflow: text.slice(CHARS_PER_PAGE) }`
- `getPageNumber`: 廃止候補（Editor はページ単位保存で不要）。ただし他所（Reader/Calendar/export）で参照がある可能性。**参照箇所を grep して使われていれば `CHARS_PER_PAGE` ベースに書き換え、未使用なら削除**。
- `countLogicalLines`: 罫線用に残す（削除理由なし）
- `countPages`: `Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE))` に書き換え。参照有無を grep 確認
- `splitIntoPages` / `joinPages`: 文字数ベースに。ただし既存冊の再ページング用ではないことを JSDoc で明記
- `getScrollTopForCursor`: `.surface` 外側スクロールに変わるため呼び出し側も修正が必要。参照箇所を確認

**🟡 不確実性**: Reader/export 側で `getPageNumber` / `splitIntoPages` を「1 本の文字列を 60 行ごとに表示」するために使っていた場合、文字数ベースに変えると表示が崩れる。**自律フェーズで grep → 呼び出し箇所ごとに判断**。

### D3. EditorPage のロジック単純化（🔵）

```ts
// 旧: splitAtLine30 + scrollHeight 視覚行保険
// 新: splitAtCharLimit のみ
const checkOverflowAndNavigate = useCallback((value: string) => {
  if (!volumeId) return;
  if (current >= PAGES_PER_VOLUME) return;
  if (transitionLockRef.current) return;
  const { keep, overflow } = splitAtCharLimit(value);
  if (overflow.length === 0) return;
  // 以降、既存の遷移処理を踏襲（pendingCursorPosRef = overflow.length など）
  ...
}, [volumeId, current, navigate]);
```

- `ensurePaperHeight` は削除。紙高さは CSS `min-height: var(--page-height-px)` で表現（D4）
- `handleBeforeInput` は `nextValue.length > CHARS_PER_PAGE` に書き換え（最終ページロック）
- 削除系入力は `if (!inserted) return;` で素通り（既存挙動維持）

### D4. スクロール構造の改修（🔵）

`EditorPage.module.css`:

```css
.root {
  position: fixed;          /* 既存維持: iOS の body 勝手スクロール抑止 */
  inset: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}

.surface {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;         /* 新規: ページは外側でスクロール */
  transition: var(--transition-page);
}
.fading { opacity: 0; }

.textarea {
  display: block;
  width: 100%;
  min-height: var(--page-height-px);  /* 新規: 紙高さの下限を CSS で保証 */
  height: auto;                        /* scrollHeight に追従 */
  overflow: visible;                   /* 内部スクロール廃止 */
  padding-left: max(var(--padding-page), env(safe-area-inset-left));
  padding-right: max(var(--padding-page), env(safe-area-inset-right));
}
```

- textarea の高さ追従は `useLayoutEffect` で `ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'` を実行（text 更新時）。ただし `min-height: var(--page-height-px)` があるため空でも紙 1 枚分は確保される
- 罫線 `background-attachment: local` は `.notebook-surface` 側にあり、scroll コンテナが textarea でなくなっても textarea 内部の背景 tile は正しく描画される（罫線は textarea の height 範囲内に描く）

**🟡 不確実性**: `useEditorCursor` 内で scrollTop を操作する実装があれば、`.surface.scrollTop` に書き換え必要。自律フェーズで `useEditorCursor.ts` を読んで対応。

### D5. プログレスバー（🔵）

`EditorPage.tsx` ヘッダー直下に `<div className={styles.progress}>...</div>` を追加。

```tsx
<div
  className={styles.progress}
  role="progressbar"
  aria-label="ページの残量"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.min(100, Math.round((text.length / CHARS_PER_PAGE) * 100))}
>
  <div className={styles.progressFill} style={{ width: `${pct}%` }} />
</div>
```

CSS:

```css
.progress {
  position: relative;
  flex-shrink: 0;
  width: 100%;
  height: 3px;
  background-color: var(--color-rule);     /* opacity 0.08 相当。合意 0.15 に近づけたければ rgba 直指定 */
  background-image: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(10% - 1px),
    var(--color-page-divider) calc(10% - 1px),
    var(--color-page-divider) 10%
  );
  /* opacity 値は合意値：トラック 0.15, tick 0.3 に合わせて rgba 調整 */
}
.progressFill {
  height: 100%;
  background-color: var(--color-text);
  opacity: 0.5;
  transition: width 120ms ease;  /* 静けさ: 急峻でないが目立たない程度 */
}
```

- `aria-valuenow` は 0〜100 の整数パーセンテージ。`aria-valuetext` は付けない（静けさ）
- 色変更・満量アニメーションなし（合意）

### D6. 既存データ互換（🔵 解釈を明示）

- **既存 1200字超ページをロードしても自動的に次ページへ流さない**。理由: `checkOverflowAndNavigate` は `handleChange` / `handleCompositionEnd` / `insertDate` からのみ呼ばれる。初回ロードでは発動しない
- ユーザーが既存 1200字超ページを開いて **1 文字でも入力する**と、`handleChange` 経由で overflow 判定が走り、keep=先頭1200字 / overflow=残り が発火する。**これは仕様範囲内**として受容（Skeptic 解釈）
- **削除系入力は素通り**（data が空なので `if (!inserted) return;`）。ユーザーは既存 1200字超ページから文字を削って 1200字以下にできる
- 既存「completed」冊（50 ページ埋まり）は 60 に拡張される。51〜60 が空で表示される。`status` が自動で `active` に戻るかは自律で確認（意図的な挙動ならそのまま、回帰なら当該判定を固定閾値にロック）

### D7. CSS トークン

- `global.css` の `--lines-per-page: 60` は `LINES_PER_PAPER` と同期する用途（紙高さ・罫線）。コメント更新のみ
- `--page-height-px` は維持（= 60 × line-height = 1728px）

## 自己レビュー（Plan Check 1回目）

- [x] 完全性: Goal 3 つすべてに対応するマイルストーンが存在
- [x] 実行可能性: 変更対象ファイルと関数名を具体化
- [x] 依存整合性: M1（定数・pagination） → M2（Editor ロジック） → M3（CSS 構造） → M4（プログレスバー） → M5（テスト）の順
- [x] リスク対応: C1 既存冊互換 → D6、C3 スクロール回帰 → D4、C6 テスト壊滅 → 各マイルストーンに同梱、M2 最終ページロック UX → プログレスバー満量で補助
- [x] テスト方針: 各マイルストーンに検証コマンド記載
- [x] スコープ逸脱: 紙幅・再ページング・色変化は非目標で明記

## マイルストーン

---

### M1. 定数と pagination.ts を文字数基準へ

**目的**: 土台の書き換え。ビルドが一時的に壊れても一括置換で通るようにする。

**タスク**:
- T1.1 `src/lib/constants.ts`: `LINES_PER_PAGE` → 削除、`CHARS_PER_PAGE = 1200` と `LINES_PER_PAPER = 60` を新設。`PAGES_PER_VOLUME = 60` に更新。`LINES_PER_VOLUME` は参照無ければ削除（あれば `CHARS_PER_VOLUME = CHARS_PER_PAGE * PAGES_PER_VOLUME` に置換）
- T1.2 `src/lib/pagination.ts`: `splitAtLine30` → `splitAtCharLimit` にリネーム＆実装書き換え。`countPages` / `splitIntoPages` / `joinPages` / `countLogicalLines` / `getPageNumber` / `getScrollTopForCursor` のうち、**grep で呼び出し箇所を確認**し、文字数ベースで正しく動くよう書き換え。未使用関数は削除してもよい（JSDoc に理由明記）
- T1.3 `src/lib/pagination.test.ts`: 全面書き換え。`splitAtCharLimit` の境界（空、1200-1、ちょうど 1200、1201、長文）、`countPages` 文字数ベースのテストを記述
- T1.4 `src/lib/constants.test.ts`: もし `LINES_PER_PAGE` を検証しているテストがあれば更新
- T1.5 `src/lib/db.test.ts`: `LINES_PER_PAGE` を使う 3ページ生成テストを `CHARS_PER_PAGE` ベースに書き換え（`'あ'.repeat(CHARS_PER_PAGE * 2.5)` 等）

**受入条件**:
- `npx tsc --noEmit` または `npm run build` で pagination.ts / constants.ts 単体では型通過
- `pagination.test.ts`, `db.test.ts` グリーン
- `LINES_PER_PAGE` という識別子がコードベースから消えている（grep で 0 件、CSS コメントの説明は除く）

**検証コマンド**:
```
npm run test -- src/lib/pagination.test.ts src/lib/constants.test.ts src/lib/db.test.ts
```

**リスク**: `getPageNumber` / `splitIntoPages` の呼び出し先（Reader/Calendar/export）が壊れる。一括置換後にビルドエラーで検知されるので M2 着手前に修復する。

---

### M2. EditorPage のロジックを文字数基準へ

**目的**: overflow 判定・最終ページロック・ensurePaperHeight 削除。

**タスク**:
- T2.1 `src/features/editor/EditorPage.tsx`: import を `splitAtCharLimit`, `CHARS_PER_PAGE`, `PAGES_PER_VOLUME` に更新。`LINES_PER_PAGE`, `LINE_HEIGHT_PX` 参照削除（紙高さ計算は CSS 側へ）
- T2.2 `checkOverflowAndNavigate` から視覚行 scrollHeight 分岐（L191-L206）を削除し、`splitAtCharLimit(value)` のみに単純化
- T2.3 `handleBeforeInput` の `nextValue.split('\n').length > LINES_PER_PAGE` を `nextValue.length > CHARS_PER_PAGE` に書き換え
- T2.4 `ensurePaperHeight` および関連 useEffect を削除。`PAGE_HEIGHT_PX` ローカル定数も削除
- T2.5 `handleChange` から `ensurePaperHeight` 呼び出しを削除
- T2.6 textarea 高さ追従: `useLayoutEffect` を新設し、`text` 変更時に `ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'` を実行（min-height は CSS 側）
- T2.7 `EditorPage.test.tsx`: overflow/lock 系テストを文字数ベースに書き換え
  - 「LINES_PER_PAGE+1 行で遷移」→「1201字で遷移」
  - 「composition 中は遷移しない」→ 1201字ベース
  - 「60ページ目で overflow ロック」→ `CHARS_PER_PAGE + 1` 相当の入力でロック
  - 「日付挿入で overflow」→ 1200字近くで日付スタンプ挿入して overflow
  - 「視覚行 overflow で遷移」系テストは **削除**（仕様廃止）

**受入条件**:
- `EditorPage.test.tsx` グリーン
- textarea に 1201字入力すると次ページに遷移、前ページ keep=先頭1200字、次ページ先頭 = 1 文字 + 既存内容
- 60 ページ目（`PAGES_PER_VOLUME`）で 1200字到達後、さらに 1 文字の入力が `onBeforeInput.preventDefault` で無効化される
- 削除は 60 ページ目でも通る

**検証コマンド**:
```
npm run test -- src/features/editor/EditorPage.test.tsx
npm run build
```

**リスク**:
- `useEditorCursor` で `getScrollTopForCursor` を使って textarea.scrollTop を設定していた場合、スクロールコンテナが変わるため NOP 化 or 壊れる → M3 で対応
- 既存 1200字超ページで入力するといきなり overflow が発火する（D6 で受容）

---

### M3. スクロール構造を `.surface` 外側スクロールへ

**目的**: 非フォーカス時のスクロール、ヘッダー固定、紙罫線の下限保証。

**タスク**:
- T3.1 `EditorPage.module.css`:
  - `.surface` に `overflow-y: auto` 追加
  - `.textarea` の `overflow-y: auto` を `overflow: visible` に変更
  - `.textarea` に `min-height: var(--page-height-px)`、`height: auto` を追加
  - padding-bottom 動的制御に依存した記述（あれば）を整理
- T3.2 `src/hooks/useEditorCursor.ts` を読み、`textarea.scrollTop` を設定している箇所があれば、`textarea.closest('[data-testid="editor-surface"]').scrollTop` または ref 渡しで `.surface` の scrollTop に書き換え。または `el.scrollIntoView({ block: 'center' })` 方式に切り替え
- T3.3 `src/lib/pagination.ts` の `getScrollTopForCursor` は外側コンテナに対しても同じ計算が使える（y = lineIndex * LINE_HEIGHT_PX）。引数・戻り値の意味は維持
- T3.4 iOS Safari の慣性スクロール検証用に `-webkit-overflow-scrolling: touch` を `.surface` に付与（念のため）
- T3.5 罫線の確認: `.notebook-surface` の `background-attachment: local` は textarea 自身に張り付いているので、`.surface` スクロール時にも罫線が textarea と一緒に動く

**受入条件**:
- 非フォーカス時でも `.surface` で指・マウスホイールスクロールが効く
- スクロール中もヘッダー（`.app-header`）が画面上部に固定表示される
- 空ページで 60 本の罫線が描画される（textarea の `min-height` が効いている）
- Editor テストが依然グリーン

**検証コマンド**:
```
npm run test
npm run build
```

手動検証（実機・DevTools モバイルモード）:
- iOS Safari / Android Chrome で非フォーカス時スクロール
- フォーカス時のスクロールでヘッダーが動かないこと
- キーボード出現時にヘッダーが跳ねないこと

**リスク**:
- iOS Safari で `.surface overflow:auto` が momentum scroll しない古い端末 → `-webkit-overflow-scrolling: touch` で緩和
- ページスワイプ（`onTouchStart/End`）と `.surface` の縦スクロールが干渉 → 既存の水平優位 2:1 判定で抑止されるはず（要確認）

---

### M4. プログレスバー追加

**目的**: ページ残量の視覚フィードバック。静けさを保つ。

**タスク**:
- T4.1 `EditorPage.tsx`: ヘッダー直下（`<header>` と `<div className={styles.surface}>` の間）に `<div className={styles.progress} role="progressbar" ...>` を追加。`aria-valuenow` は `Math.min(100, Math.round((text.length / CHARS_PER_PAGE) * 100))`、`aria-valuemin=0`, `aria-valuemax=100`, `aria-label="ページの残量"`
- T4.2 `EditorPage.module.css`: `.progress`（高さ 3px、トラック色、10 分割 tick）、`.progressFill`（幅は inline style、opacity 0.5、transition 120ms）を定義
- T4.3 色・opacity は合意値（トラック 0.15 / 塗り 0.5 / tick 0.3）。rgba 値は `var(--color-text)`, `var(--color-rule)`, `var(--color-page-divider)` を流用 or 直接 rgba で指定
- T4.4 Test: プログレスバーに `role="progressbar"` の要素が存在し、文字数変化で `aria-valuenow` が更新されることを `EditorPage.test.tsx` に 1〜2 ケース追加
  - 空 → `aria-valuenow=0`
  - 600 文字 → `aria-valuenow=50`
  - 1200 文字 → `aria-valuenow=100`
  - 1300 文字（既存 1200字超ページをロードした場合）→ `aria-valuenow=100`（clamped）

**受入条件**:
- プログレスバーが常時ヘッダー直下に表示される
- 入力に応じて塗りが伸びる
- 目盛り（10 分割 tick）が視認できる
- a11y: `role="progressbar"` と `aria-valuenow/min/max/label` が揃っている
- 色変更・アニメーション・数値表示がない
- 60 ページ目満量時も色は変わらない

**検証コマンド**:
```
npm run test -- src/features/editor/EditorPage.test.tsx
npm run build
```

---

### M5. 仕上げ・ドキュメント整合・全体検証

**目的**: 回帰ゼロ確認、命名整合、リント・ビルド・全テスト通過。

**タスク**:
- T5.1 コード全体で `LINES_PER_PAGE` / `splitAtLine30` / `LINES_PER_VOLUME` のリテラル残留を grep で再確認、ゼロ化
- T5.2 JSDoc・コメントの更新（`LINES_PER_PAGE=60 で 15/30/45 行目が強調される` など）
- T5.3 `--lines-per-page` CSS 変数のコメント更新（「罫線用の視覚行数、`LINES_PER_PAPER` と同期」）
- T5.4 `src/types/index.ts` の `/** 30行分の本文... */` 等、文字数ベースに書き換え
- T5.5 `npm run lint` / `npm run build` / `npm run test` 全部グリーン
- T5.6 README に仕様説明があれば更新（あれば）

**受入条件**:
- `npm run lint` 警告・エラーゼロ
- `npm run build` 通過（tsc + vite）
- `npm run test` 全テストグリーン
- grep で `LINES_PER_PAGE` `splitAtLine30` の残留ゼロ

**検証コマンド**:
```
npm run lint
npm run build
npm run test
```

---

## 不確実性メモ（🟡）

- `useEditorCursor` 内の scrollTop 操作の有無（M3-T3.2 で確定）
- `getPageNumber` / `splitIntoPages` / `joinPages` / `countPages` の外部呼び出しの有無（M1-T1.2 で grep 確定）
- iOS Safari での `.surface overflow:auto` + momentum scroll 挙動（手動検証、必要なら fallback）
- 既存 `PAGES_PER_VOLUME=50` で満了した「completed」冊が 60 に拡張されたときの status 整合（M5-T5.5 で回帰確認）

## 実装時の注意事項

- 依存バージョンは変更しない（グローバル CLAUDE.md）
- コミットはユーザーの明示的合図があるまで行わない（ただしマイルストーン単位で積み上げる）
- 1 PR・同一ブランチ・マイルストーンごとコミット
- 静けさ原則: トースト・点滅・触覚フィードバックを追加しない
- ファイル I/O は `encoding="utf-8"`（該当なし、フロント）
- 罫線の視覚整合性を必ず目視確認（空ページ、1 行、満量ページ、1200字超の既存ページ）

## 未解決事項

- 既存「completed」冊を 60 ページ化した際に、自動で再 active 化すべきか？
  → 合意要件の「既存冊も新基準で編集可能」から判断して、`status === 'completed'` でも編集可能（ただし status は維持）とするのが素直。M5 の回帰確認で実挙動を検証し、問題あればユーザーに確認。
