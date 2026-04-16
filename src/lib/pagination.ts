import { LINE_HEIGHT_PX } from './constants';

/**
 * テキスト全体の論理行数。末尾に \n があっても最終空行は1行と数える。
 * 罫線・視覚行表示のために残す（ページ判定からは切り離し済み）。
 */
export function countLogicalLines(text: string): number {
  if (text.length === 0) return 1;
  return text.split('\n').length;
}

/**
 * 冊全文を Page レコード列に落とすための分割。
 * 文字数上限を撤廃したため分割は行わず、全文をそのまま 1 ページ目に格納する。
 * 空文字は `['']` を返す（空ページ 1 枚を表現するため）。
 *
 * 用途: db.saveVolumeText（DB 復元等の限定経路）。
 */
export function splitIntoPages(text: string): string[] {
  return [text];
}

/**
 * ページ配列を元の 1 本の文字列に結合する。
 * splitIntoPages の逆変換（round-trip で等価）。
 */
export function joinPages(pages: string[]): string {
  return pages.join('');
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
