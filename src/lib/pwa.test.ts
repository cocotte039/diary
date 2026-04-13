import { describe, expect, it, beforeEach } from 'vitest';
import {
  dismissA2HSBanner,
  shouldShowA2HSBanner,
} from './pwa';
import { LS_BANNER_DISMISSED_KEY } from './constants';

beforeEach(() => {
  localStorage.clear();
});

describe('pwa.shouldShowA2HSBanner', () => {
  it('returns false in jsdom (not iOS Safari, not standalone)', () => {
    expect(shouldShowA2HSBanner()).toBe(false);
  });
});

describe('pwa.dismissA2HSBanner', () => {
  it('writes dismissal flag', () => {
    dismissA2HSBanner();
    expect(localStorage.getItem(LS_BANNER_DISMISSED_KEY)).toBe('1');
  });
});
