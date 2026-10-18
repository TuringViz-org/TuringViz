import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useEdgesState, useNodesState, type Node, type Edge } from '@xyflow/react';
import { normalizeColor, resolveStateColor } from '@components/shared/stateColors';
import { COLOR_STATE_SWITCH } from '@components/ConfigGraph/util/constants';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useComputationTreeNodeMode,
  useComputationTreeELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import {
  ConfigNodeMode,
  DEFAULT_GRAPH_CARDS_ELK_OPTS,
  DEFAULT_GRAPH_NODES_ELK_OPTS,
} from '@utils/constants';
import { reconcileNodes, reconcileEdges } from '@utils/reactflow';
import type { ConfigNodeData, ConfigEdgeData } from '@components/ConfigGraph/types';
import type { useComputationTreeData } from './useComputationTreeData';

export function useTreeColors() {
  const theme = useTheme();
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  return useCallback(
    (stateName?: string) => {
      const color = resolveStateColor(stateName, stateColorMatching);
      if (color === 'accept') return normalizeColor(theme.palette.success.light);
      if (color === 'reject') return normalizeColor(theme.palette.error.light);
      return normalizeColor(color);
    },
    [stateColorMatching, theme.palette.error.light, theme.palette.success.light]
  );
}

/** Renderer-specific spacing remains the same for both presentation adapters. */
export function useTreeSettings() {
  const nodeMode = useComputationTreeNodeMode();
  const settings = useComputationTreeELKSettings();
  const setSettings = useGraphZustand((s) => s.setComputationTreeELKSettings);
  useEffect(() => {
    const defaults =
      nodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_NODES_ELK_OPTS;
    const { nodeSep, rankSep, edgeSep, edgeNodeSep, padding } = defaults;
    if (
      settings.nodeSep === nodeSep &&
      settings.rankSep === rankSep &&
      settings.edgeSep === edgeSep &&
      settings.edgeNodeSep === edgeNodeSep &&
      settings.padding === padding
    )
      return;
    setSettings({ nodeSep, rankSep, edgeSep, edgeNodeSep, padding });
  }, [nodeMode, settings, setSettings]);
  return { nodeMode, settings };
}

/** Reconcile data without discarding positions or measured card dimensions. */
export function useTreeStructure(
  { model, base }: ReturnType<typeof useComputationTreeData>,
  onTopologyChange: () => void
) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ConfigNodeData>>(
    base.nodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ConfigEdgeData>>(
    base.edges
  );
  const [structureKey, setStructureKey] = useState('');
  const resolveColorForState = useTreeColors();
  const nodeCount = model?.nodes.length ?? 0;
  const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

  useEffect(() => {
    if (!model) return;
    if (base.topoKey !== structureKey) onTopologyChange();
    setNodes((prev) =>
      reconcileNodes(prev, base.nodes, (node) => ({
        ...node.data,
        showLabel: !hideLabels,
        stateColor: resolveColorForState(node.data.config?.state),
      }))
    );
    setEdges((prev) => reconcileEdges(prev, base.edges));
    setStructureKey(base.topoKey);
  }, [
    model,
    base.nodes,
    base.edges,
    base.topoKey,
    structureKey,
    hideLabels,
    resolveColorForState,
    onTopologyChange,
    setNodes,
    setEdges,
  ]);

  const applyPositions = useCallback(
    (positions: Map<string, { x: number; y: number }>) => {
      setNodes((prev) =>
        prev.map((node) => {
          const position = positions.get(node.id);
          return !position ||
            (node.position.x === position.x && node.position.y === position.y)
            ? node
            : { ...node, position };
        })
      );
    },
    [setNodes]
  );

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    structureKey,
    nodeCount,
    structureSyncPending: base.topoKey !== structureKey,
    applyPositions,
  };
}
