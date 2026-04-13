import { describe, expect, it } from 'vitest';
import {
  countLogicalLines,
  countPages,
  getPageNumber,
  getScrollTopForCursor,
  joinPages,
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
    it('line 30 (0-indexed 29) -> page 1 boundary', () => {
      const text = Array(30).fill('x').join('\n');
      // 末尾 position
      expect(getPageNumber(text.length, text)).toBe(1);
    });
    it('line 31 (0-indexed 30) -> page 2', () => {
      const text = Array(31).fill('x').join('\n');
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
    it('30 lines -> 1 page', () => {
      const text = Array(30).fill('x').join('\n');
      expect(countPages(text)).toBe(1);
    });
    it('31 lines -> 2 pages', () => {
      const text = Array(31).fill('x').join('\n');
      expect(countPages(text)).toBe(2);
    });
    it('1500 lines -> 50 pages', () => {
      const text = Array(1500).fill('x').join('\n');
      expect(countPages(text)).toBe(50);
    });
    it('1501 lines -> 51 pages (overflow=new volume)', () => {
      const text = Array(1501).fill('x').join('\n');
      expect(countPages(text)).toBe(51);
    });
  });

  describe('splitIntoPages / joinPages', () => {
    it('empty -> single empty page', () => {
      expect(splitIntoPages('')).toEqual(['']);
    });
    it('round trip preserves text', () => {
      const text = Array.from({ length: 75 }, (_, i) => `line-${i}`).join('\n');
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
