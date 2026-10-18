import type cytoscape from 'cytoscape';
import type { Theme } from '@mui/material/styles';
import { normalizeColor } from '@components/shared/stateColors';
import {
  GRAPH_EDGE_ACTIVE_WIDTH,
  GRAPH_EDGE_ARROW_SCALE,
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_COMPRESSED_WIDTH,
  GRAPH_EDGE_HOVER_WIDTH,
} from '@components/shared/edgeVisualConstants';

export const getCyStyles = (theme: Theme): cytoscape.StylesheetJson =>
  [
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
        width: 'data(width)',
        height: 'data(height)',
        label: '',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 14,
        'font-weight': 600,
        color: theme.palette.text.primary,
        'text-outline-width': 2,
        'text-outline-color': normalizeColor(theme.palette.background.paper),
        'background-color': normalizeColor(theme.palette.background.paper),
        'border-width': 'data(borderWidth)',
        'border-color': normalizeColor(
          theme.palette.border?.main ?? theme.palette.divider
        ),
        'border-style': 'solid',
        shape: 'ellipse',
        'z-index': 5,
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'node[displayLabel]',
      style: { label: 'data(displayLabel)' },
    },
    {
      selector: 'node[textOutline]',
      style: { 'text-outline-color': 'data(textOutline)' },
    },
    {
      selector: 'node[bgColor]',
      style: { 'background-color': 'data(bgColor)' },
    },
    {
      selector: 'node[borderColor]',
      style: { 'border-color': 'data(borderColor)' },
    },
    {
      selector: 'node.pending',
      style: {
        'border-color':
          normalizeColor(theme.palette.accent?.dark) ??
          normalizeColor(theme.palette.secondary.dark),
        'border-width': 8,
        'border-style': 'dashed',
      },
    },
    {
      selector: 'node.card',
      style: {
        shape: 'round-rectangle',
      },
    },
    {
      selector: 'node.start',
      style: {
        'border-color': normalizeColor(theme.palette.primary.main),
        'border-width': 8,
      },
    },
    {
      selector: 'node.current',
      style: {
        'border-color':
          normalizeColor(theme.palette.node?.currentConfig) ??
          normalizeColor(theme.palette.primary.dark),
        'border-width': 12,
        'shadow-blur': 18,
        'shadow-color':
          normalizeColor(theme.palette.node?.currentConfig) ??
          normalizeColor(theme.palette.primary.dark),
        'shadow-opacity': 0.65,
        'shadow-offset-x': 0,
        'shadow-offset-y': 0,
        'z-index': 20,
      },
    },
    {
      selector: 'node.hovered',
      style: {
        'border-color':
          normalizeColor(theme.palette.border?.dark) ??
          normalizeColor(theme.palette.primary.dark),
        'border-width': 8,
      },
    },
    {
      selector: 'node.ct-selected',
      style: {
        'border-color': normalizeColor(theme.palette.primary.dark),
        'border-width': 9,
      },
    },
    {
      selector: 'node.hidden-label',
      style: { label: '' },
    },
    {
      selector: 'edge',
      style: {
        width: GRAPH_EDGE_BASE_WIDTH,
        'line-color': theme.palette.grey[500],
        'target-arrow-color': theme.palette.grey[500],
        'target-arrow-shape': 'triangle',
        'arrow-scale': GRAPH_EDGE_ARROW_SCALE,
        'curve-style': 'straight',
        'line-opacity': 0.9,
        label: 'data(label)',
        'font-size': 12,
        'text-rotation': 'autorotate',
        'text-margin-y': -6,
        'text-outline-width': 2,
        'text-outline-color': theme.palette.background.paper,
      },
    },
    {
      selector: 'edge.compressed',
      style: {
        'curve-style': 'straight',
        width: GRAPH_EDGE_COMPRESSED_WIDTH,
        'line-color': normalizeColor(theme.palette.primary.main),
        'target-arrow-color': normalizeColor(theme.palette.primary.main),
      },
    },
    {
      selector: 'edge.hovered',
      style: {
        width: GRAPH_EDGE_HOVER_WIDTH,
        'line-color': theme.palette.grey[700],
        'target-arrow-color': theme.palette.grey[700],
      },
    },
    {
      selector: 'edge.ct-selected',
      style: {
        width: GRAPH_EDGE_ACTIVE_WIDTH,
        'line-color': theme.palette.primary.dark,
        'target-arrow-color': theme.palette.primary.dark,
      },
    },
    {
      selector: 'edge.hidden-label',
      style: { label: '' },
    },
  ] as cytoscape.StylesheetJson;
