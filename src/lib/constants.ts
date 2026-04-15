/**
 * アプリ全体で共有する定数。
 * マジックナンバーはここに集約すること。
 */

/**
 * 1ページあたりの文字上限（text.length ベース、改行含む）。
 * M10 で「論理行数 60」基準から「文字数 1200」基準に変更。
 * EditorPage の overflow / 最終ページロックの判定単位。
 */
export const CHARS_PER_PAGE = 1200;

/**
 * 罫線描画用の視覚上の行数。1 ページの紙に描く罫線の本数。
 * CSS `--lines-per-page` と同期させること。CHARS_PER_PAGE とは独立。
 */
export const LINES_PER_PAPER = 60;

/** 1冊あたりのページ数。M10 で 50 → 60。 */
export const PAGES_PER_VOLUME = 60;

/** フォントサイズ (px)。iOS Safari でフォーカス時のズームを防ぐため 16px 固定 */
export const FONT_SIZE_PX = 16;

/** 行の高さ（line-height 倍率） */
export const LINE_HEIGHT_EM = 1.8;

/** 1行の実ピクセル高 */
export const LINE_HEIGHT_PX = FONT_SIZE_PX * LINE_HEIGHT_EM;

/**
 * ヘッダーの固定高さ (px)。本文 2 行分。
 * CSS 側の `--header-height = calc(2 * var(--line-height-px))` と同期。
 * EditorPage の textarea padding-top と整合させるために JS からも参照可能にする (M7-T1)。
 */
export const HEADER_HEIGHT_PX = 2 * LINE_HEIGHT_PX;

/** 自動保存のデバウンス (ms) */
export const AUTOSAVE_DEBOUNCE_MS = 2000;

/** カーソル位置保存のデバウンス (ms) */
export const CURSOR_SAVE_DEBOUNCE_MS = 1000;

/** スワイプでページ送りとみなす閾値 (px) */
export const SWIPE_THRESHOLD_PX = 50;

/** IndexedDB 名 */
export const DB_NAME = 'diary';
export const DB_VERSION = 2;

/** localStorage キー */
export const LS_CURSOR_KEY = 'note-cursor-position';
export const LS_BANNER_DISMISSED_KEY = 'note-a2hs-banner-dismissed';

/** エクスポートJSONの形式バージョン */
export const EXPORT_FORMAT_VERSION = 1;

/** GitHub 設定の IndexedDB キー */
export const GITHUB_SETTINGS_KEY = 'github-settings';

/** GitHub 同期のリトライ回数 */
export const GITHUB_SYNC_MAX_RETRIES = 3;

/** GitHub 同期リトライの初期待機 (ms)、以後 exponential */
export const GITHUB_SYNC_INITIAL_BACKOFF_MS = 1000;

/** 長押し検知までの時間 (ms)。iOS context menu (500ms〜) と同等で自然。 */
export const LONG_PRESS_MS = 500;
/** 長押し中に指が動いてもキャンセルしない閾値 (px)。 */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
