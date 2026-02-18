// src/components/shared/LegendPanel.tsx
import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Divider,
  Collapse,
  Stack,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ExpandMore } from '@mui/icons-material';
import { Panel, type PanelPosition } from '@xyflow/react';

export type LegendItem = { key: string; color: string; label?: string };

type LegendPanelProps = {
  items: LegendItem[];
  visible?: boolean;
  hoveredKey?: string | null;
  title?: string;
  chipLabel?: string;
  position?: PanelPosition;
  defaultOpen?: boolean;
  contentClassName?: string;
  addon?: ReactNode;
};

export function LegendPanel({
  items,
  visible = true,
  hoveredKey = null,
  title = 'Legend — States',
  chipLabel,
  position = 'bottom-right',
  defaultOpen = false,
  contentClassName,
  addon,
}: LegendPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (!hoveredKey || !open) return;
    const container = containerRef.current;
    const item = itemRefs.current.get(hoveredKey) || null;
    if (!container || !item) return;

    const cRect = container.getBoundingClientRect();
    const iRect = item.getBoundingClientRect();
    const fullyVisible = iRect.top >= cRect.top && iRect.bottom <= cRect.bottom;

    if (!fullyVisible) {
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [hoveredKey, open]);

  if (!visible || items.length === 0) return null;

  return (
    <Panel position={position}>
      <Stack spacing={0.75} alignItems="flex-end">
        {addon}

        <Paper
          elevation={0}
          sx={{
            width: 300,
            maxHeight: 260,
            overflow: 'hidden',
            borderRadius: 2,
            border: (t) => `1px solid ${t.palette.divider}`,
            bgcolor: (t) => alpha(t.palette.background.paper, 0.98),
            backdropFilter: 'blur(6px)',
          }}
        >
          <Box sx={{ p: 1.25, pb: 1, display: 'flex', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            <Chip
              size="small"
              label={chipLabel ?? String(items.length)}
              sx={{ ml: 1 }}
            />
            <IconButton
              size="small"
              onClick={() => setOpen((v) => !v)}
              sx={{
                ml: 'auto',
                transform: `rotate(${open ? 180 : 0}deg)`,
                transition: 'transform 200ms ease',
              }}
              aria-label={open ? 'Collapse legend' : 'Expand legend'}
            >
              <ExpandMore fontSize="small" />
            </IconButton>
          </Box>
          <Divider />

          <Collapse in={open} timeout="auto" unmountOnExit={false}>
            <Box
              ref={containerRef}
              sx={{
                px: 1.25,
                pb: 1.25,
                maxHeight: 200,
                overflowY: 'auto',
                pr: 1.25,
              }}
              className={contentClassName}
            >
              <Stack spacing={0.5}>
                {items.map(({ key, color, label }) => {
                  const isHovered = hoveredKey === key;
                  return (
                    <Stack
                      key={key}
                      ref={(el) => {
                        itemRefs.current.set(key, el);
                      }}
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{
                        px: 1,
                        py: 0.5,
                        borderRadius: 1.5,
                        transition:
                          'background-color 120ms ease, box-shadow 120ms ease',
                        bgcolor: isHovered
                          ? (t) => alpha(t.palette.primary.main, 0.1)
                          : 'transparent',
                        boxShadow: isHovered
                          ? (t) =>
                              `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.35)}`
                          : 'none',
                      }}
                    >
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          flex: '0 0 14px',
                          bgcolor: color,
                          border: (t) =>
                            `1px solid ${alpha(t.palette.common.black, 0.25)}`,
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: isHovered ? 600 : 400,
                        }}
                        title={label ?? key}
                      >
                        {label ?? key}
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>
            </Box>
          </Collapse>
        </Paper>
      </Stack>
    </Panel>
  );
}
