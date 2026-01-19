import { useEffect, useMemo } from 'react';
import { useTheme, alpha, darken } from '@mui/material/styles';

import type { CTEdge } from '../util/buildComputationTree';
import { getFloatingEdgePoints, type PositionedNode } from '../util/edgeGeometry';
import { useHoverPopper } from '@components/ConfigGraph/hooks/useHoverPopper';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';
import { useGraphUI } from '@components/shared/GraphUIContext';
import { EdgeTooltip } from '@components/ConfigGraph/edges/EdgeTooltip';

type Props = {
  edge: CTEdge;
  source: PositionedNode;
  target: PositionedNode;
  markerId: string;
};

export function D3FloatingEdge({ edge, source, target, markerId }: Props) {
  const theme = useTheme();
  const { setSelected, selected, highlightedEdgeId } = useGraphUI();
  const isSelected = selected.type === 'edge' && selected.id === edge.id;
  const isHighlighted = highlightedEdgeId === edge.id;

  const sourceLabel = (source.data as any)?.label ?? source.id;
  const targetLabel = (target.data as any)?.label ?? target.id;

  const { sx, sy, tx, ty } = getFloatingEdgePoints(source, target);
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;

  const path = `M ${sx},${sy} L ${tx},${ty}`;

  const baseStroke = (edge.style as any)?.stroke ?? theme.palette.text.secondary;
  const baseWidth = Number((edge.style as any)?.strokeWidth ?? 1.5);
  const strokeColorHover = darken(String(baseStroke), 0.3);

  const {
    hovering,
    open,
    virtualAnchor,
    anchorPos,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    setAnchorPos,
  } = useHoverPopper(HOVER_POPPER_DELAY_MS, isSelected);

  useEffect(() => {
    if (isSelected && selected.anchor) setAnchorPos(selected.anchor);
  }, [isSelected, selected.anchor, setAnchorPos]);

  const stroke = hovering || isSelected ? strokeColorHover : baseStroke;
  const width = hovering || isSelected ? baseWidth + 1 : isHighlighted ? baseWidth + 0.5 : baseWidth;
  const opacity = hovering || isSelected ? 1 : isHighlighted ? 0.95 : 0.85;

  const overlayStyle = useMemo(
    () => ({
      stroke,
      strokeWidth: width,
      opacity,
      transition: 'stroke 120ms ease, stroke-width 120ms ease, opacity 120ms ease',
      strokeDasharray: (edge.style as any)?.strokeDasharray,
      filter:
        hovering || isSelected
          ? `drop-shadow(0 0 8px ${alpha(strokeColorHover, 0.45)})`
          : isHighlighted
            ? `drop-shadow(0 0 6px ${alpha(theme.palette.primary.dark, 0.45)})`
            : undefined,
    }),
    [stroke, width, opacity, edge.style, hovering, isSelected, strokeColorHover, isHighlighted, theme.palette.primary.dark]
  );

  return (
    <g>
      <path
        d={path}
        fill="none"
        markerEnd={`url(#${markerId})`}
        style={overlayStyle as any}
      />

      {/* hit area */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(15, width + 12)}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          setSelected({
            type: 'edge',
            id: edge.id,
            anchor: { top: e.clientY, left: e.clientX },
          });
        }}
      />

      <EdgeTooltip
        open={open}
        anchorEl={virtualAnchor}
        transition={edge.data?.transition}
        isCompressed={edge.data?.compressed === true}
        compressedLength={
          typeof edge.data?.compressedLength === 'number'
            ? edge.data?.compressedLength
            : undefined
        }
        sourceLabel={sourceLabel}
        targetLabel={targetLabel}
        onClose={() => setSelected({ type: null, id: null })}
      />

      {edge.label && (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          alignmentBaseline="middle"
          fill={theme.palette.text.secondary}
          fontSize="10px"
          style={{ userSelect: 'none' }}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}
