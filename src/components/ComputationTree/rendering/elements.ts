import type { Theme } from '@mui/material/styles';
import type { Node, Edge } from '@xyflow/react';
import type { ConfigNodeData, ConfigEdgeData } from '@components/ConfigGraph/types';
import type { CytoscapeElement } from '@components/shared/cytoscapeElements';
import { normalizeColor } from '@components/shared/stateColors';
import { ConfigNodeMode } from '@utils/constants';
import { CONFIG_NODE_DIAMETER } from '../util/constants';

export function buildTreeCircleElements(
  nodes: readonly Node<ConfigNodeData>[],
  edges: readonly Edge<ConfigEdgeData>[],
  theme: Theme,
  computationTreeNodeMode: ConfigNodeMode,
  resolveColorForState: (state?: string) => string | undefined
): CytoscapeElement[] {
  return [
    ...nodes.map((n): CytoscapeElement => {
      const data = n.data;
      const stateColor = data.stateColor ?? resolveColorForState(data.config?.state);
      const displayLabel = data.showLabel === false ? '' : (data.label ?? n.id);
      const bgColor = stateColor ?? normalizeColor(theme.palette.background.paper);
      const classes = [
        computationTreeNodeMode === ConfigNodeMode.CARDS ? 'card' : 'circle',
      ];
      if (data.isStart) classes.push('start');
      if (data.isCurrent) classes.push('current');
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
            : (normalizeColor(theme.palette.border?.main) ??
              normalizeColor(theme.palette.divider)),
        borderWidth: data.isCurrent ? 12 : data.isStart ? 8 : 0,
        textOutline: normalizeColor(theme.palette.background.paper),
        width: n.width ?? CONFIG_NODE_DIAMETER,
        height: n.height ?? CONFIG_NODE_DIAMETER,
      };

      return { group: 'nodes', data: cyData, position, classes: classes.join(' ') };
    }),
    ...edges.map((e): CytoscapeElement => {
      const data = e.data ?? {};
      const classes = ['edge', 'hidden-label'];
      if (data.compressed) classes.push('compressed');
      const cyData = {
        id: e.id,
        source: e.source,
        target: e.target,
        transition: data.transition,
        compressed: data.compressed === true,
        compressedLength: data.compressedLength,
      };

      return { group: 'edges', data: cyData, classes: classes.join(' ') };
    }),
  ];
}
