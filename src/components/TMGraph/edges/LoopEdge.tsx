// src/components/TMGraph/edges/LoopEdge.tsx
import {
  Edge,
  EdgeProps,
  useInternalNode,
  BaseEdge,
  EdgeLabelRenderer,
} from '@xyflow/react';
import { memo, useEffect, useMemo } from 'react';
import { useTheme } from '@mui/material';
import { alpha, darken } from '@mui/material/styles';

import { getLoopEdgeParams } from './edgeUtils';
import { useEdgeHoverPopper } from './useEdgeHoverPopper';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';
import { EdgeTooltip } from './EdgeTooltip';
import type { Transition } from '@mytypes/TMTypes';
import { useGraphUI } from '@components/shared/GraphUIContext';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { handleTMGraphRunChoiceEdgeClick } from '@tmfunctions/Running';

export interface LoopEdgeData extends Record<string, unknown> {
  transitions?: Transition[];
  tooltipLines?: string[];
}

type LoopEdge = Edge<LoopEdgeData>;

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
  const runChoiceHighlightedTMEdges = useGlobalZustand(
    (s) => s.runChoiceHighlightedTMEdges
  );

  const node = useInternalNode(source);
  if (!node) return null;

  const { sx, sy, ex, ey } = getLoopEdgeParams(node);

  const labelX = (sx + ex) / 2;
  const labelY = (sy + ey) / 2 - 55;

  const path = `M ${sx} ${sy} C ${sx} ${sy - 50}, ${ex} ${ey - 50}, ${ex} ${ey}`;

  const isSelected = selected.type === 'edge' && selected.id === id;
  const isHighlighted =
    highlightedEdgeId === id || runChoiceHighlightedTMEdges.includes(id);
  const baseStroke = (style as any)?.stroke ?? '#999';
  const baseWidth = Number((style as any)?.strokeWidth ?? 1.5);
  const hlColor = theme.palette.primary.dark;

  const {
    hovering,
    open,
    virtualAnchor,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    setAnchorPos,
  } = useEdgeHoverPopper(HOVER_POPPER_DELAY_MS, isSelected);

  useEffect(() => {
    if (isSelected && selected.anchor) {
      setAnchorPos(selected.anchor);
    }
  }, [isSelected, selected.anchor, setAnchorPos]);

  const strokeColorBase = isHighlighted ? hlColor : baseStroke;
  const strokeColorHover = darken(String(strokeColorBase), 0.3);
  const isActive = hovering || isSelected;

  const mergedStyle: React.CSSProperties = useMemo(
    () => ({
      ...style,
      stroke: isActive ? strokeColorHover : strokeColorBase,
      strokeWidth: isActive ? baseWidth + 1 : isHighlighted ? 3.5 : baseWidth,
      opacity: isActive ? 1 : isHighlighted ? 0.95 : 0.85,
      transition:
        'stroke 120ms ease, stroke-width 120ms ease, opacity 120ms ease, filter 120ms ease',
      filter: isActive
        ? `drop-shadow(0 0 8px ${alpha(strokeColorHover, 0.45)})`
        : isHighlighted
          ? `drop-shadow(0 0 6px ${alpha(hlColor, 0.45)})`
          : undefined,
    }),
    [
      style,
      isActive,
      isHighlighted,
      baseWidth,
      strokeColorBase,
      strokeColorHover,
      hlColor,
    ]
  );

  const transitions = (data?.transitions as Transition[] | undefined) ?? [];
  const fallbackLines = useMemo(() => {
    if (transitions.length > 0) return [];
    if (typeof label === 'string' && label.trim())
      return label.split('\n').map((s) => s.trim());
    return [];
  }, [transitions.length, label]);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={mergedStyle} />

      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(15, baseWidth + 15)}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={(evt) => {
          evt.stopPropagation();
          if (handleTMGraphRunChoiceEdgeClick(source, source)) {
            setSelected({ type: null, id: null });
            return;
          }
          setSelected({
            type: 'edge',
            id,
            anchor: { top: evt.clientY, left: evt.clientX },
          });
        }}
      />

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

      <EdgeTooltip
        open={open || isSelected}
        anchorEl={virtualAnchor}
        edgeId={id}
        source={source}
        target={source}
        transitions={transitions}
        fallbackLines={fallbackLines}
        onClose={() => setSelected({ type: null, id: null })}
      />
    </>
  );
};

export const LoopEdge = memo(LoopEdgeComponent);
LoopEdge.displayName = 'LoopEdge';
