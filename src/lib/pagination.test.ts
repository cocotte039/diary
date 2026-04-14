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

  describe('splitAtLine30 (M6-T1)', () => {
    it('empty string -> keep="" overflow=""', () => {
      expect(splitAtLine30('')).toEqual({ keep: '', overflow: '' });
    });

    it('1 line -> overflow empty, keep == original', () => {
      expect(splitAtLine30('hello')).toEqual({ keep: 'hello', overflow: '' });
    });

    it('29 lines -> overflow empty, keep == original', () => {
      const text = Array.from({ length: 29 }, (_, i) => `l${i}`).join('\n');
      expect(splitAtLine30(text)).toEqual({ keep: text, overflow: '' });
    });

    it('exactly 30 lines -> overflow empty, keep == original', () => {
      const text = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n');
      const result = splitAtLine30(text);
      expect(result.keep).toBe(text);
      expect(result.overflow).toBe('');
    });

    it('31 lines -> keep is 30 lines, overflow is 1 line', () => {
      const text = Array.from({ length: 31 }, (_, i) => `l${i}`).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(30);
      expect(overflow.split('\n').length).toBe(1);
      expect(overflow).toBe('l30');
    });

    it('45 lines -> keep=30 lines, overflow=15 lines', () => {
      const text = Array.from({ length: 45 }, (_, i) => `l${i}`).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(30);
      expect(overflow.split('\n').length).toBe(15);
    });

    it('100 lines -> keep=30, overflow=70', () => {
      const text = Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(30);
      expect(overflow.split('\n').length).toBe(70);
    });

    it('round-trip: overflow 非空時、keep + "\\n" + overflow === 元テキスト', () => {
      const text = Array.from({ length: 75 }, (_, i) => `line-${i}`).join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(overflow).not.toBe('');
      expect(keep + '\n' + overflow).toBe(text);
    });

    it('trailing newline (30 lines + trailing \\n) -> overflow is empty line', () => {
      // 30 行のテキストに末尾 \n を足すと split 上は 31 要素（31行目が空）
      const text = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') + '\n';
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(30);
      expect(overflow).toBe('');
    });

    it('consecutive empty lines in overflow are preserved', () => {
      const lines = Array.from({ length: 30 }, (_, i) => `l${i}`);
      const text = [...lines, '', '', ''].join('\n');
      const { keep, overflow } = splitAtLine30(text);
      expect(keep.split('\n').length).toBe(30);
      expect(overflow).toBe('\n\n');
    });

    it('uses LINES_PER_PAGE constant (30)', () => {
      // 定数が変わっても split が同期することを緩く確認
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
