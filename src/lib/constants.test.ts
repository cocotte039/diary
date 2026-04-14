import { describe, expect, it } from 'vitest';
import {
  FONT_SIZE_PX,
  HEADER_HEIGHT_PX,
  LINE_HEIGHT_EM,
  LINE_HEIGHT_PX,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
} from './constants';

describe('constants (M7-T1)', () => {
  it('LINE_HEIGHT_PX is derived from FONT_SIZE_PX * LINE_HEIGHT_EM', () => {
    expect(LINE_HEIGHT_PX).toBe(FONT_SIZE_PX * LINE_HEIGHT_EM);
  });

  it('HEADER_HEIGHT_PX is exactly 2 * LINE_HEIGHT_PX', () => {
    expect(HEADER_HEIGHT_PX).toBe(2 * LINE_HEIGHT_PX);
    // Currently that works out to 57.6 with default values (16 * 1.8 * 2).
    expect(HEADER_HEIGHT_PX).toBeCloseTo(57.6, 5);
  });
});

describe('constants (M8-4-T8-4.1) long-press', () => {
  it('LONG_PRESS_MS', () => {
    expect(LONG_PRESS_MS).toBe(500);
  });

  it('LONG_PRESS_MOVE_TOLERANCE_PX', () => {
    expect(LONG_PRESS_MOVE_TOLERANCE_PX).toBe(10);
  });
});
