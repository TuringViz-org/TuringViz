import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useTheme } from '@mui/material/styles';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useGraphCurrentConfiguration } from '@hooks/useGraphCurrentConfiguration';
import { useCurrentConfigHighlight } from '@hooks/useCurrentConfigHighlight';
import { normalizeColor, resolveStateColor } from '@components/shared/stateColors';
import { reconcileEdges, reconcileNodes } from '@utils/reactflow';
import { ConfigNodeMode } from '@utils/constants';
import { COLOR_STATE_SWITCH } from '../util/constants';
import { buildConfigGraph } from '../util/buildConfigGraph';
import type { ConfigNodeData, ConfigEdgeData } from '../types';

export function useConfigGraphCircleData(active: boolean) {
  const theme = useTheme();
  const configGraph = useGlobalZustand((s) => s.configGraph);
  const configGraphVersion = useGlobalZustand((s) => s.configGraphVersion);
  const transitions = useGlobalZustand((s) => s.transitions);
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  const currentConfig = useGraphCurrentConfiguration(active);
  const resolveColorForState = useCallback(
    (stateName?: string) => {
      const res = resolveStateColor(stateName, stateColorMatching);
      if (res === 'accept') return normalizeColor(theme.palette.success.light);
      if (res === 'reject') return normalizeColor(theme.palette.error.light);
      return normalizeColor(res);
    },
    [stateColorMatching, theme.palette.error.light, theme.palette.success.light]
  );

  // Base graph structure
  const model = configGraph;
  const structure = useMemo(() => {
    if (!configGraph) return { nodes: [], edges: [], topoKey: '' };
    return buildConfigGraph(configGraph, transitions, null, ConfigNodeMode.NODES);
  }, [configGraph, configGraphVersion, transitions]);
  const base = useCurrentConfigHighlight(structure, currentConfig);
  const [nodes, setNodes] = useState<Node<ConfigNodeData>[]>(base.nodes);
  const [edges, setEdges] = useState<Edge<ConfigEdgeData>[]>(base.edges);
  const [structureKey, setStructureKey] = useState('');

  const nodeCount = model?.Graph?.size ?? 0;

  // Hide labels when many nodes
  const hideLabels = nodeCount >= COLOR_STATE_SWITCH;

  // Sync builder output
  useEffect(() => {
    if (!configGraph) return;
    setNodes((prev) =>
      reconcileNodes(prev, base.nodes, (node) => {
        const stateName = node.data.config?.state;
        const mappedColor = resolveColorForState(stateName);

        return {
          ...node.data,
          showLabel: !hideLabels,
          stateColor: mappedColor,
        };
      })
    );

    setEdges((prev) => reconcileEdges(prev, base.edges));
    setStructureKey((prev) => (prev === base.topoKey ? prev : base.topoKey));
  }, [
    configGraph,
    base.nodes,
    base.edges,
    base.topoKey,
    structureKey,
    hideLabels,
    stateColorMatching,
  ]);

  // Legend items
  const legendItems = useMemo(() => {
    const entries = Array.from(stateColorMatching.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([state, color]) => ({ key: state, color }));
  }, [stateColorMatching]);

  const showLegend = legendItems.length > 0 && (model?.Graph?.size ?? 0) > 0;

  return {
    nodes,
    edges,
    setNodes,
    baseTopologyKey: base.topoKey,
    structureKey,
    structureSyncPending: base.topoKey !== structureKey,
    resolveColorForState,
    legendItems,
    showLegend,
  };
}
