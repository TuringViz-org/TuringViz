import { BaseEdge } from '@xyflow/react';
import { useTheme } from '@mui/material';
import { alpha, darken } from '@mui/material/styles';
import { useEffect, useMemo, type CSSProperties } from 'react';

import { useGraphUI } from '@components/shared/GraphUIContext';
import {
  GRAPH_EDGE_ACTIVE_WIDTH,
  GRAPH_EDGE_BASE_WIDTH,
  GRAPH_EDGE_HOVER_WIDTH,
} from '@components/shared/edgeVisualConstants';
import { useHoverPopper } from '../hooks/useHoverPopper';
import { EdgeTooltip, type EdgeTooltipContent } from './EdgeTooltip';

type Props = {
  id: string;
  path: string;
  markerEnd?: string;
  style?: CSSProperties;
  tooltip: EdgeTooltipContent;
};

/** The same hit area, selection, hover and highlight behavior for every edge shape. */
export function InteractiveEdge({ id, path, markerEnd, style, tooltip }: Props) {
  const theme = useTheme();
  const { active, highlightedEdgeId, selected, setSelected } = useGraphUI();
  const isSelected = selected.type === 'edge' && selected.id === id;
  const isHighlighted = highlightedEdgeId === id;
  const {
    hovering,
    open,
    virtualAnchor,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    setAnchorPos,
  } = useHoverPopper(undefined, isSelected, active);

  useEffect(() => {
    if (isSelected && selected.anchor) setAnchorPos(selected.anchor);
  }, [isSelected, selected.anchor, setAnchorPos]);

  const baseWidth = Number(style?.strokeWidth ?? GRAPH_EDGE_BASE_WIDTH);
  const highlightColor = theme.palette.primary.dark;
  const strokeColor = isHighlighted ? highlightColor : (style?.stroke ?? '#999');
  const hoverColor = darken(String(strokeColor), 0.3);
  const emphasized = hovering || isSelected;
  const mergedStyle = useMemo<CSSProperties>(
    () => ({
      ...style,
      stroke: emphasized ? hoverColor : strokeColor,
      strokeWidth: emphasized
        ? GRAPH_EDGE_HOVER_WIDTH
        : isHighlighted
          ? GRAPH_EDGE_ACTIVE_WIDTH
          : baseWidth,
      opacity: emphasized ? 1 : isHighlighted ? 0.95 : 0.85,
      transition:
        'stroke 120ms ease, stroke-width 120ms ease, opacity 120ms ease, filter 120ms ease',
      filter: emphasized
        ? `drop-shadow(0 0 8px ${alpha(hoverColor, 0.45)})`
        : isHighlighted
          ? `drop-shadow(0 0 6px ${alpha(highlightColor, 0.45)})`
          : undefined,
    }),
    [
      style,
      emphasized,
      isHighlighted,
      baseWidth,
      strokeColor,
      hoverColor,
      highlightColor,
    ]
  );

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
        onClick={(event) => {
          event.stopPropagation();
          setSelected({
            type: 'edge',
            id,
            anchor: { top: event.clientY, left: event.clientX },
          });
        }}
      />
      <EdgeTooltip
        {...tooltip}
        open={open}
        anchorEl={virtualAnchor}
        onClose={() => setSelected({ type: null, id: null })}
      />
    </>
  );
}
