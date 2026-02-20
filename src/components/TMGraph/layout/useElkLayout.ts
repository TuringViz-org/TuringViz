// src/components/TMGraph/layout/useElkLayout.ts
import { useRef, useState } from 'react';
import Elk, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import { Node as RFNode, useReactFlow } from '@xyflow/react';

import { STATE_NODE_DIAMETER } from '../util/constants';
import { resolveElkAlgorithm, type ElkAlgo } from '@components/shared/layout/elkUtils';

export type Options = {
  algorithm?: ElkAlgo;
  nodeSep?: number;
  rankSep?: number;
  edgeSep?: number;
  padding?: number;
  direction?: 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';
};

export type LayoutAPI = {
  restart: () => void;
  running: boolean;
};

const readDimension = (raw: unknown) =>
  typeof raw === 'number' && Number.isFinite(raw) && raw > 1 ? raw : undefined;

export function useElkLayout({
  algorithm = 'layered',
  nodeSep = 60,
  rankSep = 100,
  edgeSep = 24,
  padding = 20,
  direction = 'RIGHT',
}: Options = {}): LayoutAPI {
  const { getNodes, getEdges, setNodes } = useReactFlow();
  const elkRef = useRef<InstanceType<typeof Elk> | null>(null);
  const isRunningRef = useRef(false);
  const rerunRequestedRef = useRef(false);
  const [running, setRunning] = useState(false);

  if (!elkRef.current) elkRef.current = new Elk();

  const runLayout = async () => {
    if (isRunningRef.current) {
      rerunRequestedRef.current = true;
      return;
    }

    isRunningRef.current = true;
    const elk = elkRef.current!;
    setRunning(true);
    try {
      while (true) {
        rerunRequestedRef.current = false;

        const rfNodes = getNodes();
        const rfEdges = getEdges();

        if (!rfNodes.length) break;

        const elkNodes: ElkNode[] = rfNodes.map((n) => {
          const measured = (n as any).measured;
          return {
            id: n.id,
            width:
              readDimension(measured?.width) ??
              readDimension(n.width) ??
              STATE_NODE_DIAMETER,
            height:
              readDimension(measured?.height) ??
              readDimension(n.height) ??
              STATE_NODE_DIAMETER,
          };
        });

        const elkEdges: ElkExtendedEdge[] = rfEdges
          .filter((e) => e.source !== e.target)
          .map((e) => ({
            id: `${e.source}→${e.target}`,
            sources: [String(e.source)],
            targets: [String(e.target)],
          }));

        const elkGraph: ElkNode = {
          id: 'root',
          layoutOptions: {
            'elk.algorithm':
              resolveElkAlgorithm(algorithm),
            'elk.spacing.nodeNode': String(nodeSep),
            'elk.layered.spacing.nodeNodeBetweenLayers': String(rankSep),
            'elk.spacing.edgeEdge': String(edgeSep),
            'elk.padding': String(padding),
            'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
            'elk.direction': direction,
          },
          children: elkNodes,
          edges: elkEdges,
        };

        const res = await elk.layout(elkGraph);

        const posById = new Map<string, { x: number; y: number }>();
        for (const c of res.children ?? []) {
          if (!c.id) continue;
          posById.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
        }

        setNodes((prev: RFNode[]) =>
          prev.map((n) => {
            const p = posById.get(n.id);
            if (!p) return n;
            const same = n.position?.x === p.x && n.position?.y === p.y;
            return same ? n : { ...n, position: p };
          })
        );

        if (!rerunRequestedRef.current) break;
      }
    } finally {
      isRunningRef.current = false;
      setRunning(false);
    }
  };

  const restart = () => {
    void runLayout();
  };

  return { restart, running };
}
