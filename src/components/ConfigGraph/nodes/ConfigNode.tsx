// src/components/ConfigGraph/nodes/ConfigNode.tsx
import { Handle, Position, Node, NodeProps } from '@xyflow/react';
import {
  Box,
  Typography,
  Tooltip,
  Paper,
  useTheme,
  ClickAwayListener,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import Popper from '@mui/material/Popper';
import { memo, useEffect, useMemo } from 'react';

import { CONFIG_CARD_WIDTH, CONFIG_NODE_DIAMETER } from '../util/constants';
import { useHoverPopper } from '../hooks/useHoverPopper';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';
import ConfigCard from '../ConfigVisualization/ConfigCard';
import type { Configuration } from '@mytypes/TMTypes';
import { setConfiguration } from '@tmfunctions/Running';
import { useGraphUI } from '@components/shared/GraphUIContext';

export interface ConfigNodeData extends Record<string, unknown> {
  label: string;
  config: Configuration;
  isStart: boolean;
  isCurrent: boolean;
  isComputed?: boolean;
  isSelectable?: boolean;
  showLabel?: boolean;
  stateColor?: string;
  pendingInteractive?: boolean;
}

type ConfigNode = Node<ConfigNodeData>;

const ConfigNodeComponent = ({ id, data }: NodeProps<ConfigNode>) => {
  // <-- id dazu
  const theme = useTheme();
  const {
    label,
    config,
    isStart,
    isCurrent,
    isComputed,
    pendingInteractive,
    isSelectable = false,
    showLabel = true,
    stateColor,
  } = data;

  const { selected, setSelected, setHoveredState } = useGraphUI();

  // Selection richtig prüfen: nach Node-ID, nicht Label
  const isSelected = selected.type === 'node' && selected.id === id;

  const {
    open,
    virtualAnchor,
    anchorPos,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    setAnchorPos,
    close,
  } = useHoverPopper(HOVER_POPPER_DELAY_MS, isSelected);

  const greenLabels = ['done', 'accept', 'accepted'];
  const redLabels = ['error', 'reject', 'rejected'];

  const isAccepting = greenLabels.includes(label.toLowerCase());
  const isRejecting = redLabels.includes(label.toLowerCase());

  useEffect(() => {
    if (isSelected && selected.anchor) setAnchorPos(selected.anchor);
  }, [isSelected, selected.anchor, setAnchorPos]);

  const handleEnter = (e: React.MouseEvent) => {
    onMouseEnter(e);
    setHoveredState(label);
  };
  const handleMove = (e: React.MouseEvent) => {
    onMouseMove(e);
  };
  const handleLeave = () => {
    onMouseLeave();
    setHoveredState(null);
  };

  const roles: string[] = [];
  if (isStart) roles.push('Start configuration');
  if (isCurrent) roles.push('Current configuration');
  if (isSelectable) roles.push('Selectable configuration');
  if (isAccepting) roles.push('Accepting configuration');
  if (isRejecting) roles.push('Rejecting configuration');
  const hasRole = roles.length > 0;

  const colorOnlyMode = !showLabel;
  const baseBgColor = useMemo(() => {
    if (colorOnlyMode && stateColor) return stateColor;
    if (isCurrent) return theme.palette.background.paper;
    if (isAccepting) return theme.palette.success.light;
    if (isRejecting) return theme.palette.error.light;
    return theme.palette.background.paper;
  }, [colorOnlyMode, stateColor, isCurrent, isAccepting, isRejecting, theme]);

  // Hier `isSelected` verwenden (nicht "selected")
  const borderColor = isCurrent
    ? theme.palette.node.currentConfig
    : isSelectable
      ? theme.palette.node.selectableConfig
      : isSelected
        ? theme.palette.border.dark
        : theme.palette.border.main;

  const highlightColor = isCurrent
    ? alpha(theme.palette.primary.main, 0.4)
    : isSelectable
      ? alpha(theme.palette.accent?.main ?? theme.palette.secondary.main, 0.25)
      : 'transparent';

  const boxShadow =
    isCurrent
      ? [
          `0 0 0 4px ${alpha(theme.palette.node.currentConfig, 0.34)}`,
          `0 0 18px ${alpha(theme.palette.node.currentConfig, 0.55)}`,
          `inset 0 0 0 9999px ${highlightColor}`,
        ].join(', ')
      : highlightColor !== 'transparent'
        ? `inset 0 0 0 9999px ${highlightColor}`
        : undefined;

  return (
    <>
      <Tooltip
        title={hasRole ? roles.join(' · ') : ''}
        placement="left"
        arrow
        disableHoverListener={!hasRole}
      >
        <Box
          onMouseEnter={handleEnter}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          sx={{
            position: 'relative',
            width: CONFIG_NODE_DIAMETER,
            height: CONFIG_NODE_DIAMETER,
            border: '6px solid',
            borderColor,
            borderRadius: '50%',
            backgroundColor: baseBgColor,
            boxShadow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            outline: isCurrent
              ? `2px solid ${alpha(theme.palette.node.currentConfig, 0.65)}`
              : 'none',
            outlineOffset: 3,
            transition: 'transform 120ms ease, box-shadow 120ms ease',
            '&:hover': { borderColor: theme.palette.border.dark },
            zIndex: 900,
          }}
          onDoubleClick={() => setConfiguration(config)}
        >
          {isStart && (
            <Box
              sx={{
                position: 'absolute',
                top: 2,
                left: 2,
                right: 2,
                bottom: 2,
                border: '3px solid',
                borderColor,
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />
          )}

          {showLabel && (
            <Typography variant="subtitle1" fontWeight="bold" sx={{ zIndex: 1000 }}>
              {label}
            </Typography>
          )}

          <Handle
            type="target"
            position={Position.Top}
            style={{ display: 'none' }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            style={{ display: 'none' }}
          />
        </Box>
      </Tooltip>

      <Popper
        open={open}
        anchorEl={anchorPos ? (virtualAnchor as any) : null}
        placement="top-start"
        modifiers={[
          { name: 'offset', options: { offset: [0, 10] } },
          { name: 'preventOverflow', options: { padding: 8 } },
        ]}
        sx={{ zIndex: (t) => t.zIndex.tooltip }}
      >
        <ClickAwayListener
          onClickAway={() => {
            setSelected({ type: null, id: null });
            close();
          }}
        >
          <Paper
            elevation={6}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: (t) => alpha(t.palette.background.paper, 0.97),
              backdropFilter: 'blur(6px)',
              border: (t) => `1px solid ${alpha(t.palette.divider, 0.32)}`,
              boxShadow: (t) =>
                `0 8px 28px ${alpha(t.palette.common.black, 0.18)}, 0 1px 2px ${alpha(
                  t.palette.common.black,
                  0.08
                )}`,
            }}
          >
            <ConfigCard
              config={config}
              cardWidth={CONFIG_CARD_WIDTH}
              computed={isComputed}
              showSelect
              onSelect={() => setConfiguration(config)}
              pendingInteractive={pendingInteractive}
            />
          </Paper>
        </ClickAwayListener>
      </Popper>
    </>
  );
};

export const ConfigNode = memo(ConfigNodeComponent);
ConfigNode.displayName = 'ConfigNode';
