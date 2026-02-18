// src/components/ConfigGraph/edges/LoopEdge.tsx
import {
  Edge,
  EdgeProps,
  useInternalNode,
  BaseEdge,
  EdgeLabelRenderer,
} from '@xyflow/react';
import { memo, useMemo, useEffect } from 'react';
import { useTheme } from '@mui/material';
import { alpha, darken } from '@mui/material/styles';

import { getLoopEdgeParams } from './edgeUtils';
import { useHoverPopper } from '../hooks/useHoverPopper';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';
import { EdgeTooltip } from './EdgeTooltip';
import type { Transition } from '@mytypes/TMTypes';
import { useGraphUI } from '@components/shared/GraphUIContext';
import {
  GRAPH_EDGE_ACTIVE_WIDTH,
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_HOVER_WIDTH,
} from '@components/shared/edgeVisualConstants';

export interface LoopEdgeData extends Record<string, unknown> {
  transition?: Transition;
  tooltipLines?: string[];
}

type LoopEdge = Edge<LoopEdgeData>;

/**
 * Loop-Kante auf einem Kreis-Node (Start/Ende auf dem Umfang).
 * Selektion/Highlighting via GraphUIContext.
 */
const LoopEdgeComponent = ({
  id,
  source,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps<LoopEdge>) => {
  const theme = useTheme();
  const { highlightedEdgeId, selected, setSelected } = useGraphUI();

  const isSelected = selected.type === 'edge' && selected.id === id;

  const node = useInternalNode(source);
  if (!node) return null;

  /* --- Geometrie --- */
  const { sx, sy, ex, ey } = getLoopEdgeParams(node);

  const labelX = (sx + ex) / 2;
  const labelY = (sy + ey) / 2 - 55;

  const path = `M ${sx} ${sy} C ${sx} ${sy - 50}, ${ex} ${ey - 50}, ${ex} ${ey}`;

  /* --- Highlight/Styles --- */
  const isHighlighted = highlightedEdgeId === id;
  const baseStroke = (style as any)?.stroke ?? '#999';
  const baseWidth = Number((style as any)?.strokeWidth ?? GRAPH_EDGE_BASE_WIDTH);
  const hlColor = theme.palette.primary.dark;

  /* --- Hover/Tooltip --- */
  const {
    hovering,
    open,
    virtualAnchor,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    setAnchorPos,
  } = useHoverPopper(HOVER_POPPER_DELAY_MS, isSelected);

  useEffect(() => {
    if (isSelected && selected.anchor) setAnchorPos(selected.anchor);
  }, [isSelected, selected.anchor, setAnchorPos]);

  const strokeColorBase = isHighlighted ? hlColor : baseStroke;
  const strokeColorHover = darken(String(strokeColorBase), 0.3);

  const mergedStyle: React.CSSProperties = useMemo(
    () => ({
      ...style,
      stroke: hovering || isSelected ? strokeColorHover : strokeColorBase,
      strokeWidth:
        hovering || isSelected
          ? GRAPH_EDGE_HOVER_WIDTH
          : isHighlighted
            ? GRAPH_EDGE_ACTIVE_WIDTH
            : baseWidth,
      opacity: hovering || isSelected ? 1 : isHighlighted ? 0.95 : 0.85,
      transition:
        'stroke 120ms ease, stroke-width 120ms ease, opacity 120ms ease, filter 120ms ease',
      filter:
        hovering || isSelected
          ? `drop-shadow(0 0 8px ${alpha(strokeColorHover, 0.45)})`
          : isHighlighted
            ? `drop-shadow(0 0 6px ${alpha(hlColor, 0.45)})`
            : undefined,
    }),
    [
      style,
      hovering,
      isSelected,
      isHighlighted,
      baseWidth,
      strokeColorBase,
      strokeColorHover,
      hlColor,
    ]
  );

  /* --- Tooltip-Daten (Fallback zu Label) --- */
  const fallbackLines = useMemo(() => {
    if (data?.transition) return [];
    if (typeof label === 'string' && label.trim())
      return label.split('\n').map((s) => s.trim());
    return [];
  }, [data?.transition, label]);

  return (
    <>
      {/* Sichtbarer Edge-Pfad */}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={mergedStyle} />

      {/* Unsichtbarer Hit-Pfad */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(15, baseWidth + 15)}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          setSelected({
            type: 'edge',
            id,
            anchor: { top: e.clientY, left: e.clientX },
          });
        }}
      />

      {/* (verstecktes) Label */}
      <EdgeLabelRenderer>
        <p
          style={{
            display: 'none',
            fontSize: '0.7rem',
            color: '#444',
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          {label}
        </p>
      </EdgeLabelRenderer>

      {/* Tooltip */}
      <EdgeTooltip
        open={open}
        anchorEl={virtualAnchor}
        transition={data?.transition}
        onClose={() => setSelected({ type: null, id: null })}
      />
    </>
  );
};

export const LoopEdge = memo(LoopEdgeComponent);
LoopEdge.displayName = 'LoopEdge';
