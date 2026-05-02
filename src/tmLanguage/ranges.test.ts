import {
  containsPosition,
  createPosition,
  createRange,
  diagnostic,
  emptyRangeAt,
  mergeRanges,
  tokenRange,
} from './ranges';
import type { Token } from './types';

describe('range helpers', () => {
  it('creates positions and ranges without changing coordinates', () => {
    const start = createPosition(5, 2, 3);
    const end = createPosition(9, 2, 7);

    expect(start).toEqual({ offset: 5, line: 2, column: 3 });
    expect(createRange(start, end)).toEqual({ start, end });
  });

  it('merges ranges from the first start to the second end', () => {
    const first = createRange(createPosition(0, 1, 1), createPosition(4, 1, 5));
    const second = createRange(createPosition(10, 3, 2), createPosition(12, 3, 4));

    expect(mergeRanges(first, second)).toEqual({
      start: first.start,
      end: second.end,
    });
  });

  it('builds readable one-character ranges for unknown characters', () => {
    const position = createPosition(8, 4, 9);

    expect(emptyRangeAt(position)).toEqual({
      start: position,
      end: { offset: 8, line: 4, column: 10 },
    });
  });

  it('returns token ranges without copying or reshaping them', () => {
    const range = createRange(createPosition(1, 1, 2), createPosition(2, 1, 3));
    const token: Token = {
      kind: 'word',
      value: 'q0',
      range,
    };

    expect(tokenRange(token)).toBe(range);
  });

  it('creates error diagnostics with stable metadata', () => {
    const range = createRange(createPosition(0, 1, 1), createPosition(1, 1, 2));

    expect(diagnostic('TEST_CODE', 'Message.', range)).toEqual({
      code: 'TEST_CODE',
      message: 'Message.',
      range,
      severity: 'error',
    });
  });

  it('treats range boundaries as inclusive for hover lookup', () => {
    const range = createRange(createPosition(0, 2, 3), createPosition(5, 2, 8));

    expect(containsPosition(range, 2, 3)).toBe(true);
    expect(containsPosition(range, 2, 8)).toBe(true);
    expect(containsPosition(range, 2, 2)).toBe(false);
    expect(containsPosition(range, 2, 9)).toBe(false);
  });

  it('handles multi-line containment checks', () => {
    const range = createRange(createPosition(0, 2, 5), createPosition(20, 4, 2));

    expect(containsPosition(range, 2, 4)).toBe(false);
    expect(containsPosition(range, 2, 5)).toBe(true);
    expect(containsPosition(range, 3, 1)).toBe(true);
    expect(containsPosition(range, 4, 2)).toBe(true);
    expect(containsPosition(range, 4, 3)).toBe(false);
  });
});
