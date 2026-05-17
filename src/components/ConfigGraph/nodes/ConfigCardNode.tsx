// src/components/ConfigGraph/nodes/ConfigCardNode.tsx
import { Node, NodeProps, Handle, Position } from '@xyflow/react';
import { Box, useTheme } from '@mui/material';
import { alpha, darken } from '@mui/material/styles';
import { memo, useState, useCallback } from 'react';

import ConfigCard from '../ConfigVisualization/ConfigCard';
import type { Configuration } from '@mytypes/TMTypes';
import { CONFIG_CARD_WIDTH } from '../util/constants';
import { setConfiguration } from '@tmfunctions/Running';

export interface ConfigCardNodeData extends Record<string, unknown> {
  label: string;
  config: Configuration;
  isStart: boolean;
  isCurrent: boolean;
  isComputed?: boolean;
  isSelectable?: boolean;
  pendingInteractive?: boolean;
}

type ConfigCardNode = Node<ConfigCardNodeData>;

const ConfigCardNodeComponent = ({ data }: NodeProps<ConfigCardNode>) => {
  const theme = useTheme();
  const {
    config,
    isComputed,
    isCurrent,
    isSelectable = false,
    pendingInteractive,
  } = data;

  const [hovered, setHovered] = useState(false);
  const onEnter = useCallback(() => setHovered(true), []);
  const onLeave = useCallback(() => setHovered(false), []);

  // Styling: current > selectable
  const borderColor = isCurrent
    ? theme.palette.node.currentConfig
    : isSelectable
      ? theme.palette.node.selectableConfig
      : 'transparent';

  const overlay = isCurrent
    ? alpha(theme.palette.primary.main, 0.4)
    : isSelectable
      ? alpha(theme.palette.accent?.main ?? theme.palette.secondary.main, 0.25)
      : 'transparent';

  return (
    <Box
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      sx={{
        pointerEvents: 'auto',
        display: 'inline-block',
        width: 'max-content',
        maxWidth: 'none',
        border: '10px solid',
        borderColor,
        borderRadius: 5,
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        position: 'relative',
        boxShadow: isCurrent
          ? [
              `0 0 0 4px ${alpha(theme.palette.node.currentConfig, 0.34)}`,
              `0 0 22px ${alpha(theme.palette.node.currentConfig, 0.5)}`,
              `inset 0 0 0 9999px ${overlay}`,
            ].join(', ')
          : overlay !== 'transparent'
            ? `inset 0 0 0 9999px ${overlay}`
            : undefined,
        '&:hover': {
          borderColor:
            isCurrent || isSelectable
              ? darken(borderColor as string, 0.05)
              : borderColor,
        },
      }}
      onWheelCapture={(e) => {
        e.stopPropagation();
      }}
      onPointerDownCapture={(e) => {
        const el = e.target as HTMLElement;
        if (
          el.closest('[data-ct-interactive="true"], .ct-scrollbar, .ct-scrollable')
        ) {
          e.stopPropagation();
        }
      }}
      onDoubleClick={() => setConfiguration(config)} // Double-click to select
    >
      <ConfigCard
        config={config}
        cardWidth={CONFIG_CARD_WIDTH}
        computed={isComputed}
        showSelect={hovered}
        onSelect={() => setConfiguration(config)}
        pendingInteractive={pendingInteractive}
      />

      {/* Handles */}
      <Handle type="target" position={Position.Top} style={{ display: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ display: 'none' }} />
    </Box>
  );
};

export const ConfigCardNode = memo(ConfigCardNodeComponent);
ConfigCardNode.displayName = 'ConfigCardNode';
