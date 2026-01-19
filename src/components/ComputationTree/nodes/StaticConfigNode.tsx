import { Box, Typography, Tooltip, Paper, useTheme, ClickAwayListener } from '@mui/material';
import { alpha } from '@mui/material/styles';
import Popper from '@mui/material/Popper';
import { memo, useEffect, useMemo, useRef } from 'react';

import { CONFIG_CARD_WIDTH, CONFIG_NODE_DIAMETER } from '../util/constants';
import { useHoverPopper } from '@components/ConfigGraph/hooks/useHoverPopper';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';
import ConfigCard from '@components/ConfigGraph/ConfigVisualization/ConfigCard';
import { setConfiguration } from '@tmfunctions/Running';
import { useGraphUI } from '@components/shared/GraphUIContext';
import type { ConfigNodeData } from '@components/ConfigGraph/nodes/ConfigNode';

type Props = {
  id: string;
  data: ConfigNodeData;
  onSize?: (id: string, size: { width: number; height: number }) => void;
};

const StaticConfigNodeComponent = ({ id, data, onSize }: Props) => {
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

  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!onSize || !nodeRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      onSize(id, { width, height });
    });
    ro.observe(nodeRef.current);
    return () => ro.disconnect();
  }, [id, onSize]);

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

  const greenLabels = ['done', 'accept', 'accepted'];
  const redLabels = ['error', 'reject', 'rejected'];

  const isAccepting = greenLabels.includes(label.toLowerCase());
  const isRejecting = redLabels.includes(label.toLowerCase());

  const colorOnlyMode = !showLabel;
  const baseBgColor = useMemo(() => {
    if (colorOnlyMode && stateColor) return stateColor;
    if (isCurrent) return theme.palette.background.paper;
    if (isAccepting) return theme.palette.success.light;
    if (isRejecting) return theme.palette.error.light;
    return theme.palette.background.paper;
  }, [colorOnlyMode, stateColor, isCurrent, isAccepting, isRejecting, theme]);

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
    highlightColor !== 'transparent'
      ? `inset 0 0 0 9999px ${highlightColor}`
      : undefined;

  const handleClick = (evt: React.MouseEvent) => {
    evt.stopPropagation();
    setSelected({
      type: 'node',
      id,
      anchor: { top: evt.clientY, left: evt.clientX },
    });
    setAnchorPos({ top: evt.clientY, left: evt.clientX });
  };

  return (
    <>
      <Tooltip
        title={
          isStart
            ? 'Start configuration'
            : isCurrent
              ? 'Current configuration'
              : undefined
        }
        placement="left"
        arrow
        disableHoverListener={!(isStart || isCurrent)}
      >
        <Box
          ref={nodeRef}
          onMouseEnter={handleEnter}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          onClick={handleClick}
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
            transition: 'transform 120ms ease',
            cursor: 'pointer',
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

export const StaticConfigNode = memo(StaticConfigNodeComponent);
StaticConfigNode.displayName = 'StaticConfigNode';
