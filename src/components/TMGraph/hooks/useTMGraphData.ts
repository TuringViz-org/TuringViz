import { useMemo, useState, useLayoutEffect, useEffect, useRef } from 'react';
import { buildTMGraph } from '../util/buildTMGraph';
import { reconcileNodes, reconcileEdges } from '@utils/reactflow';
import type { Transition } from '@mytypes/TMTypes';
type BuildTMGraphArgs = Parameters<typeof buildTMGraph>;
type TransitionMap = Map<string, Transition[]>;
type BuildResult = ReturnType<typeof buildTMGraph>;
export type TMGraphNode = BuildResult['nodes'][number];
export type TMGraphEdge = BuildResult['edges'][number];

export function useTMGraphData({
  states,
  transitions,
  startState,
  currentState,
  lastState,
}: {
  states: BuildTMGraphArgs[0];
  transitions: BuildTMGraphArgs[1];
  startState: string;
  currentState: string;
  lastState: string;
}) {
  const {
    nodes: rawNodes,
    edges: rawEdges,
    topoKey,
  } = useMemo(() => buildTMGraph(states, transitions), [states, transitions]);

  const [nodes, setNodes] = useState<TMGraphNode[]>(rawNodes);
  const [edges, setEdges] = useState<TMGraphEdge[]>(rawEdges);

  useLayoutEffect(() => {
    setNodes((prev) =>
      reconcileNodes(prev, rawNodes, (node) => ({
        ...node.data,
        isStart: node.id === startState,
        isCurrent: node.id === currentState,
        isLast: node.id === lastState,
      }))
    );
    setEdges((prev) => reconcileEdges(prev, rawEdges));
  }, [rawNodes, rawEdges, startState, currentState, lastState]);

  return {
    nodes,
    edges,
    setNodes,
    topoKey,
    expectedNodeKey: rawNodes
      .map((n) => n.id)
      .sort((a, b) => a.localeCompare(b))
      .join('|'),
    expectedEdgeKey: rawEdges
      .map((e) => e.id)
      .sort((a, b) => a.localeCompare(b))
      .join('|'),
  };
}

export function useHighlightedTransition({
  lastState,
  lastTransition,
  transitions,
  lastTransitionTrigger,
  runSpeedMs,
  setHighlightedEdgeId,
}: {
  lastState: string;
  lastTransition: number;
  transitions: TransitionMap;
  lastTransitionTrigger: unknown;
  runSpeedMs: number;
  setHighlightedEdgeId: (edgeId: string | null) => void;
}) {
  const runSpeedMsRef = useRef(runSpeedMs);
  useEffect(() => {
    runSpeedMsRef.current = runSpeedMs;
  }, [runSpeedMs]);

  useEffect(() => {
    if (!lastState || lastTransition === -1) return;

    const ts = transitions.get(lastState);
    if (!ts || !ts[lastTransition]) return;

    const t = ts[lastTransition];
    const from = t.from;
    const to = t.to ?? from;

    const edgeId = `${from}→${to}`;
    setHighlightedEdgeId(edgeId);

    // Keep edge highlight shorter for fast run speeds so repeated hits can still pulse.
    const highlightMs = Math.max(
      60,
      Math.min(400, Math.round(runSpeedMsRef.current * 0.55))
    );
    const timeout = setTimeout(() => setHighlightedEdgeId(null), highlightMs);
    return () => clearTimeout(timeout);
  }, [
    lastTransition,
    lastState,
    transitions,
    lastTransitionTrigger,
    setHighlightedEdgeId,
  ]);
}
