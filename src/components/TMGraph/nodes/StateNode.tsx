// src/components/TMGraph/nodes/StateNode.tsx
import { Handle, Position, Node, NodeProps } from '@xyflow/react';
import { Box, Typography, Tooltip, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { memo } from 'react';

import { STATE_NODE_DIAMETER } from '../util/constants';

export interface StateNodeData extends Record<string, unknown> {
  label: string;
  isStart: boolean;
  isCurrent: boolean;
  isLast: boolean;
}

type StateNode = Node<StateNodeData>;

const StateNodeComponent = ({ data }: NodeProps<StateNode>) => {
  const theme = useTheme();
  const { label, isStart, isCurrent, isLast } = data;

  // Label color mapping
  const greenLabels = ['done', 'accept', 'accepted'];
  const redLabels = ['error', 'reject', 'rejected'];

  const isAccepting = greenLabels.includes(label.toLowerCase());
  const isRejecting = redLabels.includes(label.toLowerCase());

  // List of all roles of the state node
  const roles: string[] = [];
  if (isStart) roles.push('Start state');
  if (isCurrent) roles.push('Current state');
  if (isLast) roles.push('Last state');
  if (isAccepting) roles.push('Accepting state');
  if (isRejecting) roles.push('Rejecting state');
  const hasRole = roles.length > 0;

  // Color logic (priority: current > last > start > neutral)
  const borderColor = isCurrent
    ? theme.palette.primary.main
    : isLast
      ? theme.palette.accent.light
      : theme.palette.border.main;

  // Highlight color as overlay
  const highlightColor = isCurrent
    ? alpha(theme.palette.primary.main, 0.4)
    : isLast
      ? alpha(theme.palette.accent.light, 0.6)
      : 'transparent';

  const stateStatusColor = isAccepting
    ? theme.palette.success.light
    : isRejecting
      ? theme.palette.error.light
      : undefined;

  // Current accept/reject states keep their semantic color; other current/last states stay neutral.
  const backgroundColor =
    isCurrent && stateStatusColor
      ? stateStatusColor
      : isCurrent || isLast
        ? theme.palette.background.paper
        : stateStatusColor ?? theme.palette.background.paper;

  const boxShadow =
    highlightColor !== 'transparent'
      ? `inset 0 0 0 9999px ${highlightColor}`
      : undefined;

  return (
    <Tooltip
      title={hasRole ? roles.join(' · ') : ''}
      placement="top"
      arrow
      disableHoverListener={!hasRole}
    >
      <Box
        sx={{
          position: 'relative',
          width: STATE_NODE_DIAMETER,
          height: STATE_NODE_DIAMETER,
          border: '3px solid',
          borderColor,
          borderRadius: '50%',
          backgroundColor: backgroundColor,
          boxShadow,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          transition: 'transform 120ms ease',
          '&:hover': { transform: 'translateY(-1px)' },
        }}
      >
        {isStart && (
          <Box
            sx={{
              position: 'absolute',
              top: 2, // Distance to outer edge
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

        <Typography variant="subtitle1" fontWeight="bold" sx={{ zIndex: 1000 }}>
          {label}
        </Typography>

        {/* Connection handles (hidden) */}
        <Handle type="target" position={Position.Top} style={{ display: 'none' }} />
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ display: 'none' }}
        />
      </Box>
    </Tooltip>
  );
};

export const StateNode = memo(StateNodeComponent);
StateNode.displayName = 'StateNode';
