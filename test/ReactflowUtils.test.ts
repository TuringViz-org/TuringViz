import { describe, expect, it } from 'vitest';
import type { Node as RFNode } from '@xyflow/react';

import { reconcileNodes } from '@utils/reactflow';

describe('reconcileNodes', () => {
  it('removes nodes that no longer exist in the rebuilt graph', () => {
    const prev: RFNode[] = [
      { id: 'keep', position: { x: 10, y: 20 }, data: { label: 'keep' } },
      { id: 'removed', position: { x: 30, y: 40 }, data: { label: 'removed' } },
    ];
    const base: RFNode[] = [
      { id: 'keep', position: { x: 0, y: 0 }, data: { label: 'keep' } },
    ];

    const next = reconcileNodes(prev, base, (node) => node.data);

    expect(next.map((node) => node.id)).toEqual(['keep']);
    expect(next[0]?.position).toEqual({ x: 10, y: 20 });
  });
});
