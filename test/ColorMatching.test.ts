import { describe, expect, it } from 'vitest';

import { getColorMatching } from '@utils/ColorMatching';

describe('ColorMatching', () => {
  it('assigns colors independently of state insertion order', () => {
    const forward = getColorMatching(
      new Set(['start', 'middle', 'done', 'error']),
      new Map()
    );
    const reverse = getColorMatching(
      new Set(['error', 'done', 'middle', 'start']),
      new Map()
    );

    expect(Array.from(forward.entries()).sort()).toEqual(
      Array.from(reverse.entries()).sort()
    );
  });

  it('keeps previous colors for states that are still present', () => {
    const matching = getColorMatching(
      new Set(['b', 'a']),
      new Map([['b', '#abcdef']])
    );

    expect(matching.get('b')).toBe('#abcdef');
  });
});
