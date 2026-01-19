import { Box, useTheme } from '@mui/material';
import { alpha, darken } from '@mui/material/styles';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import ConfigCard from '@components/ConfigGraph/ConfigVisualization/ConfigCard';
import type { ConfigCardNodeData } from '@components/ConfigGraph/nodes/ConfigCardNode';
import { CONFIG_CARD_WIDTH } from '../util/constants';
import { setConfiguration } from '@tmfunctions/Running';
import { useGraphUI } from '@components/shared/GraphUIContext';

type Props = {
  id: string;
  data: ConfigCardNodeData;
  onSize?: (id: string, size: { width: number; height: number }) => void;
};

const StaticConfigCardNodeComponent = ({ id, data, onSize }: Props) => {
  const theme = useTheme();
  const { config, isComputed, isCurrent, isSelectable = false, pendingInteractive } =
    data;
  const { setSelected } = useGraphUI();

  const [hovered, setHovered] = useState(false);
  const onEnter = useCallback(() => setHovered(true), []);
  const onLeave = useCallback(() => setHovered(false), []);

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

  return (
    <Box
      ref={nodeRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      sx={{
        pointerEvents: 'auto',
        display: 'inline-block',
        width: 'max-content',
        maxWidth: 'none',
        border: isCurrent || isSelectable ? '10px solid' : 'none',
        borderColor,
        borderRadius: 5,
        transition: 'border-color 120ms ease',
        position: 'relative',
        boxShadow:
          overlay !== 'transparent' ? `inset 0 0 0 9999px ${overlay}` : undefined,
        '&:hover': {
          borderColor:
            isCurrent || isSelectable ? darken(borderColor as string, 0.05) : borderColor,
        },
        cursor: 'pointer',
      }}
      onWheelCapture={(e) => {
        e.stopPropagation();
      }}
      onPointerDownCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest('[data-ct-interactive="true"], .ct-scrollbar, .ct-scrollable')) {
          e.stopPropagation();
        }
      }}
      onDoubleClick={() => setConfiguration(config)}
      onClick={(e) => {
        e.stopPropagation();
        setSelected({
          type: 'node',
          id,
          anchor: { top: e.clientY, left: e.clientX },
        });
      }}
    >
      <ConfigCard
        config={config}
        cardWidth={CONFIG_CARD_WIDTH}
        computed={isComputed}
        showSelect={hovered}
        onSelect={() => setConfiguration(config)}
        pendingInteractive={pendingInteractive}
      />
    </Box>
  );
};

export const StaticConfigCardNode = memo(StaticConfigCardNodeComponent);
StaticConfigCardNode.displayName = 'StaticConfigCardNode';
