// src/components/ConfigGraph/edges/FloatingEdge.tsx
import {
  Edge,
  useInternalNode,
  EdgeProps,
  BaseEdge,
  EdgeLabelRenderer,
} from '@xyflow/react';
import { memo, useEffect, useMemo } from 'react';
import { useTheme } from '@mui/material';
import { alpha, darken } from '@mui/material/styles';

import type { Transition } from '@mytypes/TMTypes';
import { getFloatingEdgeParams, getNodeCenter } from './edgeUtils';
import { useHoverPopper } from '../hooks/useHoverPopper';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';
import { EdgeTooltip } from './EdgeTooltip';
import { useGraphUI } from '@components/shared/GraphUIContext';

export interface FloatingEdgeData extends Record<string, unknown> {
  bended?: boolean;
  bendDirection?: 'up' | 'down';
  tooltipLines?: string[];
  transition: Transition;
  compressed?: boolean;
  compressedLength?: number;
}

type FloatingEdge = Edge<FloatingEdgeData>;

/**
 * Edge, die vom Mittelpunkt der Quelle zum Rand des Ziels läuft.
 * Optional mit Krümmung (bended) und kontext-gesteuerter Selektion/Highlight.
 */
const FloatingEdgeComponent = ({
  id,
  source,
  target,
  markerEnd,
  style,
  label,
  data,
}: EdgeProps<FloatingEdge>) => {
  const theme = useTheme();
  const { highlightedEdgeId, selected, setSelected } = useGraphUI();

  const isSelected = selected.type === 'edge' && selected.id === id;

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  // Labels (Fallback auf IDs)
  const sourceLabel =
    (sourceNode.data as any)?.label ??
    (sourceNode as any)?.data?.label ??
    String(source);
  const targetLabel =
    (targetNode.data as any)?.label ??
    (targetNode as any)?.data?.label ??
    String(target);

  /* --- Geometrie --- */
  const { sx, sy, tx, ty } = getFloatingEdgeParams(sourceNode, targetNode);

  // Kanonische Richtung + Normalenvektor (für Biegung & Labelversatz)
  const srcIsA = source < target;
  const a = srcIsA ? sourceNode : targetNode;
  const b = srcIsA ? targetNode : sourceNode;

  const { cx: ax, cy: ay } = getNodeCenter(a);
  const { cx: bx, cy: by } = getNodeCenter(b);

  const vdx = bx - ax;
  const vdy = by - ay;
  const vlen = Math.hypot(vdx, vdy) || 1;

  const nxCanon = -vdy / vlen;
  const nyCanon = vdx / vlen;

  const SHOULD_BEND = data?.bended === true;
  const bendSign =
    data?.bendDirection === 'up' ? 1 : data?.bendDirection === 'down' ? -1 : 0;

  const CURVE_OFFSET = 28;
  const LABEL_GAP = 12;

  const curveOffset = SHOULD_BEND ? CURVE_OFFSET * bendSign : 0;

  const midLineX = (sx + tx) / 2;
  const midLineY = (sy + ty) / 2;

  const controlX = midLineX + nxCanon * curveOffset;
  const controlY = midLineY + nyCanon * curveOffset;

  const path =
    curveOffset !== 0
      ? `M ${sx},${sy} Q ${controlX},${controlY} ${tx},${ty}`
      : `M ${sx},${sy} L ${tx},${ty}`;

  /* --- Labelposition/Rotation --- */
  const midCurveX = curveOffset !== 0 ? (sx + 2 * controlX + tx) / 4 : midLineX;
  const midCurveY = curveOffset !== 0 ? (sy + 2 * controlY + ty) / 4 : midLineY;

  const labelSide = SHOULD_BEND ? bendSign : 0;
  const labelX = midCurveX + nxCanon * LABEL_GAP * labelSide;
  const labelY = midCurveY + nyCanon * LABEL_GAP * labelSide;

  let angle = (Math.atan2(ty - sy, tx - sx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;

  /* --- Highlight/Styles --- */
  const isHighlighted = highlightedEdgeId === id;
  const baseStroke = (style as any)?.stroke ?? '#999';
  const baseWidth = Number((style as any)?.strokeWidth ?? 2.2);
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
        hovering || isSelected ? baseWidth + 1 : isHighlighted ? 4.4 : baseWidth,
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

  return (
    <>
      {/* Sichtbarer Edge-Pfad */}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={mergedStyle} />

      {/* Unsichtbarer Hit-Pfad (für Hover/Click) */}
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

      {/* (verstecktes) Label – Position wird dennoch berechnet */}
      {label && (
        <EdgeLabelRenderer>
          <p
            style={{
              display: 'none',
              fontSize: '0.7rem',
              color: '#444',
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) rotate(${angle}deg)`,
              pointerEvents: 'all',
              whiteSpace: 'pre',
            }}
          >
            {label}
          </p>
        </EdgeLabelRenderer>
      )}

      {/* Tooltip */}
      <EdgeTooltip
        open={open}
        anchorEl={virtualAnchor}
        sourceLabel={sourceLabel}
        targetLabel={targetLabel}
        transition={data?.transition}
        isCompressed={data?.compressed === true}
        compressedLength={
          typeof data?.compressedLength === 'number'
            ? data?.compressedLength
            : undefined
        }
        onClose={() => setSelected({ type: null, id: null })}
      />
    </>
  );
};

export const FloatingEdge = memo(FloatingEdgeComponent);
FloatingEdge.displayName = 'FloatingEdge';
