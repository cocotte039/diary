import { describe, expect, it } from 'vitest';
import {
  countLogicalLines,
  countPages,
  getPageNumber,
  getScrollTopForCursor,
  joinPages,
  splitAtCharLimit,
  splitIntoPages,
} from './pagination';
import { CHARS_PER_PAGE, LINE_HEIGHT_PX, PAGES_PER_VOLUME } from './constants';

describe('pagination (M10 char-based)', () => {
  describe('getPageNumber', () => {
    it('empty text -> page 1', () => {
      expect(getPageNumber(0, '')).toBe(1);
    });
    it('within first page -> page 1', () => {
      expect(getPageNumber(3, 'abc')).toBe(1);
    });
    it('selection at CHARS_PER_PAGE-1 -> page 1 (boundary inside)', () => {
      const text = 'a'.repeat(CHARS_PER_PAGE);
      expect(getPageNumber(CHARS_PER_PAGE - 1, text)).toBe(1);
    });
    it('selection at CHARS_PER_PAGE (next page top) -> page 2', () => {
      const text = 'a'.repeat(CHARS_PER_PAGE * 2);
      expect(getPageNumber(CHARS_PER_PAGE, text)).toBe(2);
    });
    it('clamps selectionStart to text length', () => {
      expect(getPageNumber(9999, 'abc')).toBe(1);
      expect(getPageNumber(-5, 'abc')).toBe(1);
    });
  });

  describe('countLogicalLines', () => {
    it('empty -> 1', () => expect(countLogicalLines('')).toBe(1));
    it('single line -> 1', () => expect(countLogicalLines('hello')).toBe(1));
    it('two lines', () => expect(countLogicalLines('a\nb')).toBe(2));
    it('trailing newline counts as a line', () =>
      expect(countLogicalLines('a\n')).toBe(2));
  });

  describe('countPages (char-based)', () => {
    it('empty -> 1', () => expect(countPages('')).toBe(1));
    it('1 char -> 1', () => expect(countPages('a')).toBe(1));
    it('CHARS_PER_PAGE chars -> 1 page', () => {
      expect(countPages('a'.repeat(CHARS_PER_PAGE))).toBe(1);
    });
    it('CHARS_PER_PAGE + 1 chars -> 2 pages', () => {
      expect(countPages('a'.repeat(CHARS_PER_PAGE + 1))).toBe(2);
    });
    it('CHARS_PER_PAGE * 2 + 1 chars -> 3 pages', () => {
      expect(countPages('a'.repeat(CHARS_PER_PAGE * 2 + 1))).toBe(3);
    });
    it('CHARS_PER_PAGE * PAGES_PER_VOLUME chars -> PAGES_PER_VOLUME pages', () => {
      expect(countPages('a'.repeat(CHARS_PER_PAGE * PAGES_PER_VOLUME))).toBe(
        PAGES_PER_VOLUME
      );
    });
  });

  describe('splitIntoPages / joinPages (char-based)', () => {
    it('empty -> [""]', () => {
      expect(splitIntoPages('')).toEqual(['']);
    });
    it('round-trip preserves text', () => {
      const text = 'あ'.repeat(Math.floor(CHARS_PER_PAGE * 2.5));
      const pages = splitIntoPages(text);
      expect(pages.length).toBe(3);
      expect(joinPages(pages)).toBe(text);
    });
    it('full-page chunks are exactly CHARS_PER_PAGE chars', () => {
      const text = 'a'.repeat(CHARS_PER_PAGE * 3);
      const pages = splitIntoPages(text);
      expect(pages.length).toBe(3);
      for (const p of pages) {
        expect(p.length).toBe(CHARS_PER_PAGE);
      }
    });
    it('last page can be shorter than CHARS_PER_PAGE', () => {
      const text = 'a'.repeat(CHARS_PER_PAGE + 5);
      const pages = splitIntoPages(text);
      expect(pages.length).toBe(2);
      expect(pages[0].length).toBe(CHARS_PER_PAGE);
      expect(pages[1].length).toBe(5);
    });
  });

  describe('splitAtCharLimit (M10)', () => {
    it('empty text -> empty keep / empty overflow', () => {
      expect(splitAtCharLimit('')).toEqual({ keep: '', overflow: '' });
    });

    it('1 char -> keep=text, overflow=""', () => {
      expect(splitAtCharLimit('a')).toEqual({ keep: 'a', overflow: '' });
    });

    it('CHARS_PER_PAGE - 1 chars -> overflow empty, keep == original', () => {
      const text = 'a'.repeat(CHARS_PER_PAGE - 1);
      expect(splitAtCharLimit(text)).toEqual({ keep: text, overflow: '' });
    });

    it('exactly CHARS_PER_PAGE chars -> overflow empty, keep == original', () => {
      const text = 'a'.repeat(CHARS_PER_PAGE);
      const result = splitAtCharLimit(text);
      expect(result.keep).toBe(text);
      expect(result.overflow).toBe('');
    });

    it('CHARS_PER_PAGE + 1 chars -> keep=1200, overflow=1 char', () => {
      const text = 'a'.repeat(CHARS_PER_PAGE) + 'X';
      const { keep, overflow } = splitAtCharLimit(text);
      expect(keep.length).toBe(CHARS_PER_PAGE);
      expect(keep).toBe('a'.repeat(CHARS_PER_PAGE));
      expect(overflow).toBe('X');
    });

    it('long text (3000 chars) -> keep=1200, overflow=1800', () => {
      const text = 'a'.repeat(3000);
      const { keep, overflow } = splitAtCharLimit(text);
      expect(keep.length).toBe(CHARS_PER_PAGE);
      expect(overflow.length).toBe(3000 - CHARS_PER_PAGE);
    });

    it('round-trip: keep + overflow === text (overflow case)', () => {
      const text = 'あ'.repeat(CHARS_PER_PAGE + 50);
      const { keep, overflow } = splitAtCharLimit(text);
      expect(keep + overflow).toBe(text);
    });

    it('handles multi-byte (Japanese) characters at boundary', () => {
      const text = 'あ'.repeat(CHARS_PER_PAGE + 5);
      const { keep, overflow } = splitAtCharLimit(text);
      expect(keep.length).toBe(CHARS_PER_PAGE);
      expect(overflow.length).toBe(5);
    });
  });

  describe('getScrollTopForCursor', () => {
    it('start of text -> 0', () => {
      expect(getScrollTopForCursor('abc', 0)).toBe(0);
    });
    it('returns lineIndex * LINE_HEIGHT_PX', () => {
      const text = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n');
      // selectionStart at start of line 5 (0-indexed)
      const posAtLine5 = text.split('\n').slice(0, 5).join('\n').length + 1;
      expect(getScrollTopForCursor(text, posAtLine5)).toBe(5 * LINE_HEIGHT_PX);
    });
  });
});
