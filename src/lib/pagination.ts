import { LINES_PER_PAGE, LINE_HEIGHT_PX } from './constants';

/**
 * テキスト中のカーソル位置 (selectionStart) が属する論理ページ番号を返す (1-indexed)。
 * 論理行 = \n 区切り。空文字は 1 を返す。
 */
export function getPageNumber(selectionStart: number, text: string): number {
  const clamped = Math.max(0, Math.min(selectionStart, text.length));
  const before = text.slice(0, clamped);
  const lineIndex = before.split('\n').length - 1; // 0-indexed
  return Math.floor(lineIndex / LINES_PER_PAGE) + 1;
}

/**
 * テキスト全体の論理行数。末尾に \n があっても最終空行は1行と数える。
 */
export function countLogicalLines(text: string): number {
  if (text.length === 0) return 1;
  return text.split('\n').length;
}

/**
 * テキスト全体のページ数（最低1）。
 */
export function countPages(text: string): number {
  return Math.max(1, Math.ceil(countLogicalLines(text) / LINES_PER_PAGE));
}

/**
 * テキストを 30 行ごとに分割してページ文字列の配列を返す。
 * 各ページは LINES_PER_PAGE 行分の \n 結合文字列。
 * 最後のページは LINES_PER_PAGE 未満でもOK。
 */
export function splitIntoPages(text: string): string[] {
  const lines = text.split('\n');
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE).join('\n'));
  }
  if (pages.length === 0) pages.push('');
  return pages;
}

/**
 * ページ配列を元の1本の文字列に結合する。
 * splitIntoPages の逆変換（round-trip で等価）。
 */
export function joinPages(pages: string[]): string {
  return pages.join('\n');
}

/**
 * 30 行境界で「このページに残す部分」(keep) と「次ページへ持ち越す部分」(overflow) に分離する。
 * - `text.split('\n').length <= LINES_PER_PAGE` → overflow は空文字。
 * - 31 行以上 → keep は最初の 30 行を `\n` 結合、overflow は 31 行目以降を `\n` 結合。
 * - round-trip: overflow が非空のとき `keep + '\n' + overflow === text`。
 *
 * 用途: M6 の 30 行自動送り (T6.3) と 50 ページ目ロック (T6.4)。
 */
export function splitAtLine30(text: string): { keep: string; overflow: string } {
  const lines = text.split('\n');
  if (lines.length <= LINES_PER_PAGE) {
    return { keep: text, overflow: '' };
  }
  const keep = lines.slice(0, LINES_PER_PAGE).join('\n');
  const overflow = lines.slice(LINES_PER_PAGE).join('\n');
  return { keep, overflow };
}

/**
 * selectionStart 位置に対応する textarea.scrollTop を返す。
 * 表示上の折り返しは考慮しない（仕様: 折り返し行はカウントしない）。
 */
export function getScrollTopForCursor(text: string, selectionStart: number): number {
  const clamped = Math.max(0, Math.min(selectionStart, text.length));
  const lineNumber = text.slice(0, clamped).split('\n').length - 1;
  return lineNumber * LINE_HEIGHT_PX;
}
