import { describe, expect, it } from 'vitest';
import {
  countLogicalLines,
  getScrollTopForCursor,
  joinPages,
  splitIntoPages,
} from './pagination';
import { LINE_HEIGHT_PX } from './constants';

describe('pagination', () => {
  describe('countLogicalLines', () => {
    it('empty -> 1', () => expect(countLogicalLines('')).toBe(1));
    it('single line -> 1', () => expect(countLogicalLines('hello')).toBe(1));
    it('two lines', () => expect(countLogicalLines('a\nb')).toBe(2));
    it('trailing newline counts as a line', () =>
      expect(countLogicalLines('a\n')).toBe(2));
  });

  describe('splitIntoPages / joinPages', () => {
    it('empty -> [""]', () => {
      expect(splitIntoPages('')).toEqual(['']);
    });
    it('any text -> single page (no char-based split)', () => {
      const text = 'あ'.repeat(3000);
      const pages = splitIntoPages(text);
      expect(pages).toEqual([text]);
    });
    it('round-trip preserves text', () => {
      const text = 'hello\nworld\n' + 'a'.repeat(5000);
      expect(joinPages(splitIntoPages(text))).toBe(text);
    });
    it('joinPages concatenates existing multi-page content as-is', () => {
      expect(joinPages(['abc', 'def', 'ghi'])).toBe('abcdefghi');
    });
  });

  describe('getScrollTopForCursor', () => {
    it('start of text -> 0', () => {
      expect(getScrollTopForCursor('abc', 0)).toBe(0);
    });
    it('returns lineIndex * LINE_HEIGHT_PX', () => {
      const text = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n');
      const posAtLine5 = text.split('\n').slice(0, 5).join('\n').length + 1;
      expect(getScrollTopForCursor(text, posAtLine5)).toBe(5 * LINE_HEIGHT_PX);
    });
  });
});
