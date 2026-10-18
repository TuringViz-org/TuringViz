import { useMemo } from 'react';
import type { Configuration } from '@mytypes/TMTypes';
import type { GraphAnchor } from './GraphUIContext';
import { makeVirtualAnchor } from './graphAnchor';
import { ClickAwayListener, Paper, Popper } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ConfigCard from '@components/ConfigGraph/ConfigVisualization/ConfigCard';
import { setConfiguration } from '@tmfunctions/Running';
import { CONFIG_CARD_WIDTH } from './configGraphConstants';

export function ConfigurationDetailPopper({
  config,
  computed,
  anchor,
  open,
  onClose,
  pendingInteractive,
}: {
  config?: Configuration;
  computed?: boolean;
  anchor: GraphAnchor | null;
  open: boolean;
  onClose: () => void;
  pendingInteractive?: boolean;
}) {
  const virtualAnchor = useMemo(() => makeVirtualAnchor(anchor), [anchor]);
  if (!config || !anchor) return null;

  return (
    <Popper
      open={open}
      anchorEl={virtualAnchor}
      placement="top-start"
      modifiers={[
        { name: 'offset', options: { offset: [0, 10] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
      sx={{ zIndex: (t) => t.zIndex.tooltip }}
    >
      <ClickAwayListener
        onClickAway={onClose}
        mouseEvent="onMouseDown"
        touchEvent="onTouchStart"
      >
        <Paper
          elevation={6}
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
            computed={computed}
            showSelect
            onSelect={() => setConfiguration(config)}
            pendingInteractive={pendingInteractive}
          />
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
