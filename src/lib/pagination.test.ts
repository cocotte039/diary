import { describe, expect, it } from 'vitest';
import {
  countLogicalLines,
  countPages,
  getPageNumber,
  getScrollTopForCursor,
  joinPages,
  splitAtLine30,
  splitIntoPages,
} from './pagination';
import { LINES_PER_PAGE, LINE_HEIGHT_PX } from './constants';

describe('pagination', () => {
  describe('getPageNumber', () => {
    it('empty text -> page 1', () => {
      expect(getPageNumber(0, '')).toBe(1);
    });
    it('first line -> page 1', () => {
      expect(getPageNumber(3, 'abc')).toBe(1);
    });
    it('LINES_PER_PAGE 行目末尾 -> page 1 境界', () => {
      const text = Array(LINES_PER_PAGE).fill('x').join('\n');
      expect(getPageNumber(text.length, text)).toBe(1);
    });
    it('LINES_PER_PAGE + 1 行目 -> page 2', () => {
      const text = Array(LINES_PER_PAGE + 1).fill('x').join('\n');
      expect(getPageNumber(text.length, text)).toBe(2);
    });
    it('clamps out-of-range selectionStart', () => {
      expect(getPageNumber(9999, 'abc')).toBe(1);
      expect(getPageNumber(-5, 'abc')).toBe(1);
    });
  });

  describe('countLogicalLines', () => {
    it('empty -> 1', () => expect(countLogicalLines('')).toBe(1));
    it('single line -> 1', () => expect(countLogicalLines('hello')).toBe(1));
    it('two lines', () => expect(countLogicalLines('a\nb')).toBe(2));
    it('trailing newline counts empty line', () =>
      expect(countLogicalLines('a\n')).toBe(2));
  });

  describe('countPages', () => {
    it('empty -> 1', () => expect(countPages('')).toBe(1));
    it('LINES_PER_PAGE 行 -> 1 page', () => {
      const text = Array(LINES_PER_PAGE).fill('x').join('\n');
      expect(countPages(text)).toBe(1);
    });
    it('LINES_PER_PAGE + 1 行 -> 2 pages', () => {
      const text = Array(LINES_PER_PAGE + 1).fill('x').join('\n');
      expect(countPages(text)).toBe(2);
    });
    it('LINES_PER_PAGE * 50 行 -> 50 pages', () => {
      const text = Array(LINES_PER_PAGE * 50).fill('x').join('\n');
      expect(countPages(text)).toBe(50);
    });
    it('LINES_PER_PAGE * 50 + 1 行 -> 51 pages (overflow=new volume)', () => {
      const text = Array(LINES_PER_PAGE * 50 + 1).fill('x').join('\n');
      expect(countPages(text)).toBe(51);
    });
  });

  describe('splitIntoPages / joinPages', () => {
    it('empty -> single empty page', () => {
      expect(splitIntoPages('')).toEqual(['']);
    });
    it('round trip preserves text', () => {
      // LINES_PER_PAGE * 2.5 行 = 3 ページ相当
      const lines = Math.floor(LINES_PER_PAGE * 2.5);
      const text = Array.from({ length: lines }, (_, i) => `line-${i}`).join('\n');
      const pages = splitIntoPages(text);
      expect(pages.length).toBe(3);
      expect(joinPages(pages)).toBe(text);
    });
    it('each page is at most LINES_PER_PAGE lines', () => {
      const text = Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n');
      const pages = splitIntoPages(text);
      for (const p of pages.slice(0, -1)) {
        expect(p.split('\n').length).toBe(LINES_PER_PAGE);
      }
    });
  });

  describe('splitAtLine30 (M6-T1)', () => {
    it('empty string -> keep="" overflow=""', () => {
      expect(splitAtLine30('')).toEqual({ keep: '', overflow: '' });
    });

    it('1 line -> overflow empty, keep == original', () => {
      expect(splitAtLine30('hello')).toEqual({ keep: 'hello', overflow: '' });
    });

    it('LINES_PER_PAGE - 1 行 -> overflow empty, keep == original', () => {
      const text = Array.from({ length: LINES_PER_PAGE - 1 }, (_, i) => `l${i}`).join('\n');
      expect(splitAtLine30(text)).toEqual({ keep: text, overflow: '' });
    });

    it('ちょうど LINES_PER_PAGE 行 -> overflow empty, keep == original', () => {
      const text = Array.from({ length: LINES_PER_PAGE }, (_, i) => `l${i}`).join('\n');
      const result = splitAtLine30(text);
      expect(result.keep).toBe(text);
      expect(result.overflow).toBe('');
    });

    it('LINES_PER_PAGE + 1 行 -> keep は LINES_PER_PAGE 行、overflow は 1 行', () => {
      const text = Array.from({ length: LINES_PER_PAGE + 1 }, (_, i) => `l${i}`).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(LINES_PER_PAGE);
      expect(overflow.split('\n').length).toBe(1);
      expect(overflow).toBe(`l${LINES_PER_PAGE}`);
    });

    it('LINES_PER_PAGE + 15 行 -> keep=LINES_PER_PAGE 行、overflow=15 行', () => {
      const text = Array.from({ length: LINES_PER_PAGE + 15 }, (_, i) => `l${i}`).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(LINES_PER_PAGE);
      expect(overflow.split('\n').length).toBe(15);
    });

    it('LINES_PER_PAGE + 70 行 -> keep=LINES_PER_PAGE, overflow=70', () => {
      const text = Array.from({ length: LINES_PER_PAGE + 70 }, (_, i) => `l${i}`).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(LINES_PER_PAGE);
      expect(overflow.split('\n').length).toBe(70);
    });

    it('round-trip: overflow 非空時、keep + "\\n" + overflow === 元テキスト', () => {
      const text = Array.from(
        { length: Math.floor(LINES_PER_PAGE * 2.5) },
        (_, i) => `line-${i}`
      ).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(overflow).not.toBe('');
      expect(keep + '\n' + overflow).toBe(text);
    });

    it('末尾改行つき LINES_PER_PAGE 行 -> overflow は空', () => {
      const text =
        Array.from({ length: LINES_PER_PAGE }, (_, i) => `l${i}`).join('\n') + '\n';
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(LINES_PER_PAGE);
      expect(overflow).toBe('');
    });

    it('overflow 内の連続空行は保持される', () => {
      const lines = Array.from({ length: LINES_PER_PAGE }, (_, i) => `l${i}`);
      const text = [...lines, '', '', ''].join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(LINES_PER_PAGE);
      expect(overflow).toBe('\n\n');
    });

    it('LINES_PER_PAGE 定数に同期する', () => {
      const text = Array.from(
        { length: LINES_PER_PAGE + 1 },
        (_, i) => `l${i}`
      ).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(LINES_PER_PAGE);
      expect(overflow.split('\n').length).toBe(1);
    });
  });

  describe('getScrollTopForCursor', () => {
    it('line 0 -> 0', () => {
      expect(getScrollTopForCursor('abc', 0)).toBe(0);
    });
    it('line 5 -> 5 * LINE_HEIGHT_PX', () => {
      const text = Array(10).fill('x').join('\n');
      // position at start of line 5 is index = 5*2 (each 'x\n' is 2 chars)
      const posAtLine5 = 'x\n'.repeat(5).length;
      expect(getScrollTopForCursor(text, posAtLine5)).toBe(5 * LINE_HEIGHT_PX);
    });
  });
});
