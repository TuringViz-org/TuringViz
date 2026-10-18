import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  getComputationTreeFromInputs,
  type ComputationTree as ComputationTreeModel,
} from '@tmfunctions/ComputationTree';
import { getStartConfiguration } from '@tmfunctions/Configurations';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useGraphCurrentConfiguration } from '@hooks/useGraphCurrentConfiguration';
import { useCurrentConfigHighlight } from '@hooks/useCurrentConfigHighlight';
import { ConfigNodeMode, MAX_COMPUTATION_TREE_TARGET_NODES } from '@utils/constants';
import {
  cancelComputationTreeCompute,
  computeComputationTreeInWorker,
} from '@utils/graphWorkerClient';
import { buildComputationTreeGraph } from './util/buildComputationTree';

const MIN_COMPUTE_OVERLAY_MS = 180;

export function useComputationTreeData(
  targetNodes: number,
  compressing: boolean,
  nodeMode: ConfigNodeMode,
  paused: boolean,
  active = true
): {
  model: ComputationTreeModel | null;
  base: ReturnType<typeof buildComputationTreeGraph>;
  isComputing: boolean;
} {
  const transitions = useGlobalZustand((s) => s.transitions);
  const blank = useGlobalZustand((s) => s.blank);
  const startState = useGlobalZustand((s) => s.startState);
  const numberOfTapes = useGlobalZustand((s) => s.numberOfTapes);
  const input = useGlobalZustand((s) => s.input);
  const currentConfig = useGraphCurrentConfiguration(active && !paused);

  const [model, setModel] = useState<ComputationTreeModel | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const requestRef = useRef(0);
  const computeHideTimerRef = useRef<number | null>(null);
  const computeStartedAtRef = useRef(0);
  const pendingModelFromComputeRef = useRef(false);
  const structure = useMemo(
    () =>
      model
        ? buildComputationTreeGraph(model, transitions, nodeMode)
        : { nodes: [], edges: [], topoKey: '' },
    [model, transitions, nodeMode]
  );
  const base = useCurrentConfigHighlight(structure, currentConfig);

  useLayoutEffect(() => {
    if (computeHideTimerRef.current != null) {
      window.clearTimeout(computeHideTimerRef.current);
      computeHideTimerRef.current = null;
    }
    if (paused) {
      pendingModelFromComputeRef.current = false;
      setIsComputing(false);
      return;
    }
    const startConfig = getStartConfiguration();
    const reqId = requestRef.current + 1;
    requestRef.current = reqId;
    setIsComputing(true);
    computeStartedAtRef.current = performance.now();
    pendingModelFromComputeRef.current = false;
    const requestedTargetNodes = targetNodes;
    const effectiveDepth = compressing
      ? MAX_COMPUTATION_TREE_TARGET_NODES
      : requestedTargetNodes;

    computeComputationTreeInWorker({
      depth: effectiveDepth,
      targetNodes: requestedTargetNodes,
      compressing,
      transitions,
      numberOfTapes,
      blank,
      startConfig,
    })
      .then((tree) => {
        if (requestRef.current !== reqId) return;
        pendingModelFromComputeRef.current = true;
        setModel(tree);
      })
      .catch(() => {
        if (requestRef.current !== reqId) return;
        try {
          const tree = getComputationTreeFromInputs(
            startConfig,
            transitions,
            numberOfTapes,
            blank,
            effectiveDepth,
            compressing,
            (msg) => toast.warning(msg),
            requestedTargetNodes
          );
          pendingModelFromComputeRef.current = true;
          setModel(tree);
        } catch {
          pendingModelFromComputeRef.current = false;
          setIsComputing(false);
        }
      });

    return () => {
      // Invalidate before rejecting the worker job so cancellation cannot trigger
      // an expensive synchronous fallback for a graph that is no longer mounted.
      requestRef.current += 1;
      cancelComputationTreeCompute();
      if (computeHideTimerRef.current != null) {
        window.clearTimeout(computeHideTimerRef.current);
        computeHideTimerRef.current = null;
      }
    };
  }, [
    targetNodes,
    compressing,
    transitions,
    blank,
    numberOfTapes,
    startState,
    input,
    paused,
  ]);

  useEffect(() => {
    if (!model) return;
    if (!pendingModelFromComputeRef.current) return;
    pendingModelFromComputeRef.current = false;
    const elapsed = performance.now() - computeStartedAtRef.current;
    const remaining = Math.max(0, MIN_COMPUTE_OVERLAY_MS - elapsed);
    if (computeHideTimerRef.current != null) {
      window.clearTimeout(computeHideTimerRef.current);
      computeHideTimerRef.current = null;
    }
    if (remaining <= 0) {
      setIsComputing(false);
      return;
    }
    computeHideTimerRef.current = window.setTimeout(() => {
      computeHideTimerRef.current = null;
      setIsComputing(false);
    }, remaining);
  }, [model, structure]);

  return { model, base, isComputing };
}
