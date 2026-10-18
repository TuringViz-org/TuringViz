import type { Theme } from '@mui/material/styles';
import type { Node, Edge } from '@xyflow/react';
import type { ConfigNodeData, ConfigEdgeData } from '../types';
import type { CytoscapeElement } from '@components/shared/cytoscapeElements';
import { normalizeColor } from '@components/shared/stateColors';
import { CONFIG_NODE_DIAMETER } from '../util/constants';

export function buildConfigCytoscapeElements(
  nodes: Node<ConfigNodeData>[],
  edges: Edge<ConfigEdgeData>[],
  theme: Theme,
  resolveColorForState: (state?: string) => string | undefined
): CytoscapeElement[] {
  const cyNodes = nodes.map((n): CytoscapeElement => {
    const data = n.data;
    const displayLabel = data.showLabel === false ? '' : (data.label ?? n.id);
    const stateColor = data.stateColor ?? resolveColorForState(n.data.config?.state);
    const bgColor =
      displayLabel === '' && stateColor
        ? stateColor
        : (stateColor ?? normalizeColor(theme.palette.background.paper));
    const classes = ['node'];
    if (data.isStart) classes.push('start');
    if (data.isCurrent) classes.push('current');
    if (data.isSelectable) classes.push('selectable');
    if (data.isComputed === false) classes.push('pending');
    if (displayLabel === '') classes.push('hidden-label');
    const position = n.position ?? { x: 0, y: 0 };
    const cyData = {
      id: n.id,
      label: data.label ?? n.id,
      displayLabel,
      bgColor,
      borderColor: data.isStart
        ? normalizeColor(theme.palette.primary.main)
        : data.isCurrent
          ? (normalizeColor(theme.palette.node?.currentConfig) ??
            normalizeColor(theme.palette.primary.dark))
          : data.isSelectable
            ? (normalizeColor(theme.palette.node?.selectableConfig) ??
              normalizeColor(theme.palette.accent?.main) ??
              normalizeColor(theme.palette.secondary.main))
            : (normalizeColor(theme.palette.border?.main) ??
              normalizeColor(theme.palette.divider)),
      borderWidth: data.isStart ? 8 : 0,
      textOutline: normalizeColor(theme.palette.background.paper),
      width: n.width ?? CONFIG_NODE_DIAMETER,
      height: n.height ?? CONFIG_NODE_DIAMETER,
    };

    return { group: 'nodes', data: cyData, position, classes: classes.join(' ') };
  });
  const cyEdges = edges.map((e): CytoscapeElement => {
    const data = e.data;
    const classes = ['edge', 'hidden-label'];
    if (e.source === e.target) classes.push('loop');
    const cyData = {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label ?? '',
      transition: data?.transition,
    };

    return { group: 'edges', data: cyData, classes: classes.join(' ') };
  });
  return [...cyNodes, ...cyEdges];
}
