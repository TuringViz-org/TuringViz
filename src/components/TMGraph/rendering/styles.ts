import type cytoscape from 'cytoscape';
import type { Theme } from '@mui/material/styles';
import { STATE_NODE_DIAMETER } from '../util/constants';
import { normalizeColor } from '@components/shared/stateColors';
import {
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_ARROW_SCALE,
  GRAPH_EDGE_ACTIVE_WIDTH,
  GRAPH_EDGE_HOVER_WIDTH,
} from '@components/shared/edgeVisualConstants';

export const getTMGraphStyles = (theme: Theme): cytoscape.StylesheetJson => {
  const baseEdge = theme.palette.grey[500];
  const hoverEdge = theme.palette.grey[700];
  const selectedEdge = theme.palette.primary.dark;

  // Cytoscape accepts partial core styles; its declaration requires every key.
  return [
    {
      selector: 'core',
      style: {
        'active-bg-color': theme.palette.grey[500],
        'active-bg-opacity': 0.2,
        'active-bg-size': 28,
        'selection-box-opacity': 0,
        'selection-box-border-width': 0,
      },
    },
    {
      selector: 'node',
      style: {
        width: STATE_NODE_DIAMETER,
        height: STATE_NODE_DIAMETER,
        label: '',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 16,
        'font-weight': 700,
        color: theme.palette.text.primary,
        'background-color': normalizeColor(theme.palette.background.paper),
        'border-width': 3,
        'border-color': normalizeColor(theme.palette.border.main),
        'border-style': 'solid',
        shape: 'ellipse',
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'node[label]',
      style: { label: 'data(label)' },
    },
    {
      selector: 'node[width]',
      style: { width: 'data(width)' },
    },
    {
      selector: 'node[height]',
      style: { height: 'data(height)' },
    },
    {
      selector: 'node[bgColor]',
      style: { 'background-color': 'data(bgColor)' },
    },
    {
      selector: 'node[borderWidth]',
      style: { 'border-width': 'data(borderWidth)' },
    },
    {
      selector: 'node[borderColor]',
      style: { 'border-color': 'data(borderColor)' },
    },
    {
      selector: 'node.start',
      style: {
        'border-style': 'double',
        'border-width': 6,
      },
    },
    {
      selector: 'node.current',
      style: {
        'border-width': 6,
      },
    },
    {
      selector: 'node.last',
      style: {
        'border-width': 6,
      },
    },
    {
      selector: 'edge',
      style: {
        width: GRAPH_EDGE_BASE_WIDTH,
        'line-color': baseEdge,
        'target-arrow-color': baseEdge,
        'target-arrow-shape': 'triangle',
        'arrow-scale': GRAPH_EDGE_ARROW_SCALE,
        'curve-style': 'straight',
        'line-opacity': 0.85,
        label: '',
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge.loop',
      style: {
        'curve-style': 'bezier',
        'loop-direction': '-45deg',
        'loop-sweep': '75deg',
        'control-point-step-size': 64,
      },
    },
    {
      selector: 'edge.bended',
      style: {
        'curve-style': 'unbundled-bezier',
        'control-point-distances': 'data(curveDistance)',
        'control-point-weights': 0.5,
      },
    },
    {
      selector: 'edge.hovered',
      style: {
        width: GRAPH_EDGE_HOVER_WIDTH,
        'line-color': hoverEdge,
        'target-arrow-color': hoverEdge,
        'line-opacity': 1,
      },
    },
    {
      selector: 'edge.ct-selected',
      style: {
        width: GRAPH_EDGE_ACTIVE_WIDTH,
        'line-color': selectedEdge,
        'target-arrow-color': selectedEdge,
        'line-opacity': 1,
      },
    },
    {
      selector: 'edge.tm-highlighted',
      style: {
        width: 3.5,
        'line-color': normalizeColor(theme.palette.primary.main),
        'target-arrow-color': normalizeColor(theme.palette.primary.main),
        'line-opacity': 0.95,
      },
    },
  ] as cytoscape.StylesheetJson;
};
