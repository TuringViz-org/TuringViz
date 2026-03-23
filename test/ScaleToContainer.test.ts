import { describe, expect, it } from 'vitest';

import { scaleToContainer } from '@components/shared/layout/scaleToContainer';

describe('scaleToContainer', () => {
  it('stretches x when the graph is narrower than the container', () => {
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 100, y: 200 }],
    ]);

    const scaled = scaleToContainer({
      positions,
      containerWidth: 400,
      containerHeight: 200,
    });

    expect(scaled.get('a')).toEqual({ x: -150, y: 0 });
    expect(scaled.get('b')).toEqual({ x: 250, y: 200 });
  });

  it('stretches y when the graph is wider than the container', () => {
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 200, y: 100 }],
    ]);

    const scaled = scaleToContainer({
      positions,
      containerWidth: 200,
      containerHeight: 400,
    });

    expect(scaled.get('a')).toEqual({ x: 0, y: -150 });
    expect(scaled.get('b')).toEqual({ x: 200, y: 250 });
  });

  it('does not shrink when the aspect ratios already match', () => {
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 100, y: 100 }],
    ]);

    const scaled = scaleToContainer({
      positions,
      containerWidth: 200,
      containerHeight: 200,
    });

    expect(scaled).toBe(positions);
  });
});
