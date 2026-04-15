import { CHARS_PER_PAGE, LINE_HEIGHT_PX } from './constants';

/**
 * テキスト中のカーソル位置 (selectionStart) が属するページ番号を返す (1-indexed)。
 * M10 で論理行ベースから文字数ベースに変更。
 * 空文字 / 範囲外の selectionStart は 1 を返す。
 */
export function getPageNumber(selectionStart: number, text: string): number {
  const clamped = Math.max(0, Math.min(selectionStart, text.length));
  return Math.floor(clamped / CHARS_PER_PAGE) + 1;
}

/**
 * テキスト全体の論理行数。末尾に \n があっても最終空行は1行と数える。
 * 罫線・視覚行表示のために残す（M10 でページ判定からは切り離された）。
 */
export function countLogicalLines(text: string): number {
  if (text.length === 0) return 1;
  return text.split('\n').length;
}

/**
 * テキスト全体のページ数（最低1）。文字数ベース。
 */
export function countPages(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE));
}

/**
 * テキストを CHARS_PER_PAGE 文字ごとに分割してページ文字列の配列を返す。
 * 各ページは最大 CHARS_PER_PAGE 文字。最後のページはそれ以下でもOK。
 * 空文字は `['']` を返す。
 *
 * 用途: db.saveVolumeText（冊全文を Page レコード列に保存する際の分割）。
 * 注意: 既存冊の再ページング目的では使わない（D6 参照）。
 */
export function splitIntoPages(text: string): string[] {
  if (text.length === 0) return [''];
  const pages: string[] = [];
  for (let i = 0; i < text.length; i += CHARS_PER_PAGE) {
    pages.push(text.slice(i, i + CHARS_PER_PAGE));
  }
  return pages;
}

/**
 * ページ配列を元の1本の文字列に結合する。
 * splitIntoPages の逆変換（round-trip で等価）。
 * 文字数ベースに変更したため単純な concat。
 */
export function joinPages(pages: string[]): string {
  return pages.join('');
}

/**
 * CHARS_PER_PAGE 境界で「このページに残す部分」(keep) と
 * 「次ページへ持ち越す部分」(overflow) に分離する。
 * - `text.length <= CHARS_PER_PAGE` → overflow は空文字。
 * - 1200 字超 → keep は先頭 1200 字、overflow は残り。
 * - round-trip: `keep + overflow === text`（常に成立）。
 *
 * 用途: M6 の自動次ページ送り (T6.3) と最終ページロック (T6.4)。
 */
export function splitAtCharLimit(text: string): {
  keep: string;
  overflow: string;
} {
  if (text.length <= CHARS_PER_PAGE) {
    return { keep: text, overflow: '' };
  }
  return {
    keep: text.slice(0, CHARS_PER_PAGE),
    overflow: text.slice(CHARS_PER_PAGE),
  };
}

/**
 * selectionStart 位置に対応するスクロールコンテナの scrollTop を返す。
 * 表示上の折り返しは考慮しない（仕様: 折り返し行はカウントしない）。
 * y = 行インデックス * LINE_HEIGHT_PX。
 * M3 で .surface 外側スクロールに変わっても y 計算は同じ。
 */
export function getScrollTopForCursor(
  text: string,
  selectionStart: number
): number {
  const clamped = Math.max(0, Math.min(selectionStart, text.length));
  const lineNumber = text.slice(0, clamped).split('\n').length - 1;
  return lineNumber * LINE_HEIGHT_PX;
}
