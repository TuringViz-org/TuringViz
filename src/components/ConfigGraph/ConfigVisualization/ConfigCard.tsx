// src/components/ConfigGraph/ConfigVisualization/ConfigCard.tsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Button,
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  useTheme,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
  Typography,
} from '@mui/material';
import { HourglassEmpty, AltRoute } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';

import { Configuration } from '@mytypes/TMTypes';
import { CELL_WIDTH } from './constants';
import { CONFIG_CARD_WIDTH } from '../util/constants';
import { computeDeeperGraphFromState } from '@tmfunctions/ConfigGraph';
import runTapeStyles from '@components/TapeList/TapeList.module.css';
import {
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';

import { useGlobalZustand } from '@zustands/GlobalZustand';
import TapeRow from './TapeRow';

type Props = {
  config: Configuration;
  cardWidth?: number | string;
  computed?: boolean;
  showSelect?: boolean;
  onSelect?: () => void;
  pendingInteractive?: boolean;
};

const normalizeColor = (color?: string) => {
  if (!color) return undefined;
  const m = /^#([0-9a-fA-F]{8})$/.exec(color);
  if (!m) return color;

  const hex = m[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = parseInt(hex.slice(6, 8), 16) / 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * Orchestrates the configuration visualization:
 * - Header with state/pending/selection controls
 * - N synced horizontally scrollable tape rows
 * - Initial centering to the head of the top tape
 */
export default function ConfigCard(data: Props) {
  const {
    config,
    cardWidth = CONFIG_CARD_WIDTH,
    computed,
    showSelect = false,
    onSelect,
    pendingInteractive = true,
  } = data;

  const theme = useTheme();

  // Global Zustand state
  const blank = useGlobalZustand((s) => s.blank);
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);

  const stateColor = useMemo(() => {
    const key = String(config.state);
    return normalizeColor(stateColorMatching?.get?.(key));
  }, [stateColorMatching, config.state]);
  const headerColor = stateColor ?? theme.palette.primary.main;
  const headerTextColor = theme.palette.getContrastText(headerColor);
  const tapeTintColor = stateColor ?? theme.palette.primary.main;

  // Dialog state for computing more configurations
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<number>(10);
  const MAX_AMOUNT = 50;

  const openPending = useCallback(() => setPendingOpen(true), []);
  const closePending = useCallback(() => setPendingOpen(false), []);
  const confirmPending = useCallback(() => {
    const amount = Math.max(1, Math.min(pendingAmount, MAX_AMOUNT));
    computeDeeperGraphFromState(config, amount);
    setPendingOpen(false);
  }, [config, pendingAmount]);

  const tapeContainerRef = useRef<HTMLDivElement | null>(null);

  const HEAD_CONTEXT_RADIUS = 5;

  const sharedBounds = useMemo(() => {
    let minR = Number.POSITIVE_INFINITY;
    let maxR = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < config.tapes.length; i++) {
      const tape = config.tapes[i];
      const head = config.heads[i] ?? 0;
      const leftLen = tape[0]?.length ?? 0;
      const rightLen = tape[1]?.length ?? 0;
      const localMin = -leftLen;
      const localMax = rightLen - 1;

      const relMin = Math.min(localMin - head, -HEAD_CONTEXT_RADIUS);
      const relMax = Math.max(localMax - head, HEAD_CONTEXT_RADIUS);

      minR = Math.min(minR, relMin);
      maxR = Math.max(maxR, relMax);
    }

    if (!Number.isFinite(minR) || !Number.isFinite(maxR)) {
      return { minR: -HEAD_CONTEXT_RADIUS, maxR: HEAD_CONTEXT_RADIUS };
    }

    return { minR, maxR };
  }, [config.tapes, config.heads]);

  const { minR, maxR } = sharedBounds;

  // Unlike the main UI, we don't have dots on the side, so we don't need padding. Head aligns exactly at -minR cells.
  const headX = -minR * CELL_WIDTH;

  // Initial centering
  useEffect(() => {
    if (!tapeContainerRef.current) return;
    const viewWidth = tapeContainerRef.current.clientWidth;
    const targetScrollLeft = headX - viewWidth / 2 + CELL_WIDTH / 2;
    tapeContainerRef.current.scrollTo({ left: targetScrollLeft, behavior: 'auto' });
  }, [headX]);

  // Re-center after fullscreen portal switches (entry + exit).
  useEffect(() => {
    const center = () => {
      const container = tapeContainerRef.current;
      if (!container) return;
      const viewWidth = container.clientWidth;
      const targetScrollLeft = headX - viewWidth / 2 + CELL_WIDTH / 2;
      container.scrollTo({ left: targetScrollLeft, behavior: 'auto' });
    };

    const handler: EventListener = (event) => {
      const detail = (event as CustomEvent<PortalBridgeSwitchDetail>).detail;
      if (!detail) return;
      if (detail.id !== 'configGraph' && detail.id !== 'computationTree') return;
      requestAnimationFrame(center);
    };

    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    return () => {
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, handler);
    };
  }, [headX]);

  return (
    <>
      <Card
        elevation={6}
        sx={{
          width: typeof cardWidth === 'number' ? `${cardWidth}px` : cardWidth,
          maxWidth: '100%',
          borderRadius: 2,
          border: (t) => `1px solid ${alpha(t.palette.divider, 0.32)}`,
          boxShadow: `0 8px 28px ${alpha(theme.palette.common.black, 0.18)}, 0 1px 2px ${alpha(
            theme.palette.common.black,
            0.08
          )}`,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <CardContent
          sx={{
            p: 0,
            position: 'relative',
            '&:last-child': { pb: 0 },
          }}
        >
          {/* Header */}
          <Box
            sx={{
              px: 1.25,
              py: 1,
              bgcolor: headerColor,
              color: headerTextColor,
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                {/* State */}
                <Chip
                  size="small"
                  variant="filled"
                  label={`${config.state}`}
                  sx={{
                    bgcolor: alpha(headerTextColor, 0.14),
                    color: headerTextColor,
                    border: `1px solid ${alpha(headerTextColor, 0.24)}`,
                    '& .MuiChip-label': {
                      py: 0,
                      px: 0.75,
                      lineHeight: 1.2,
                      fontWeight: 700,
                    },
                  }}
                />

                {/* Pending */}
                {!computed &&
                  (pendingInteractive ? (
                    // Interactive in ConfigGraph (default)
                    <Tooltip
                      arrow
                      title="Compute more configurations from this state"
                      placement="top"
                    >
                      <Chip
                        size="small"
                        variant="outlined"
                        icon={<HourglassEmpty sx={{ fontSize: 16 }} />}
                        label="Pending"
                        onClick={openPending}
                        sx={{
                          color: headerTextColor,
                          borderColor: alpha(headerTextColor, 0.42),
                          fontWeight: 500,
                          cursor: 'pointer',
                          '& .MuiChip-icon': { ml: 0.25, color: headerTextColor },
                        }}
                      />
                    </Tooltip>
                  ) : (
                    // Read-only in ComputationTree
                    <Chip
                      size="small"
                      variant="outlined"
                      icon={<HourglassEmpty sx={{ fontSize: 16 }} />}
                      label="Pending"
                      sx={{
                        color: headerTextColor,
                        borderColor: alpha(headerTextColor, 0.42),
                        fontWeight: 500,
                        cursor: 'default',
                        '& .MuiChip-icon': { ml: 0.25, color: headerTextColor },
                      }}
                    />
                  ))}
              </Stack>

              {/* Select button */}
              {showSelect && (
                <Tooltip
                  arrow
                  placement="top"
                  title="Set the Turing machine to this configuration"
                >
                  <Button
                    size="small"
                    variant="contained"
                    onClick={onSelect}
                    startIcon={<AltRoute />}
                    sx={{
                      bgcolor: alpha(headerTextColor, 0.16),
                      color: headerTextColor,
                      border: `1px solid ${alpha(headerTextColor, 0.28)}`,
                      boxShadow: 'none',
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 1.25,
                      py: 0.25,
                      lineHeight: 1.2,
                      display: 'inline-flex',
                      alignItems: 'center',
                      '&:hover': {
                        bgcolor: alpha(headerTextColor, 0.24),
                        boxShadow: 'none',
                      },
                      '& .MuiButton-startIcon': {
                        m: 0,
                        mr: 0.75,
                        display: 'inline-flex',
                        alignItems: 'center',
                      },
                      '& .MuiButton-startIcon > *': {
                        fontSize: 18,
                        lineHeight: 1,
                      },
                    }}
                  >
                    Select
                  </Button>
                </Tooltip>
              )}
            </Stack>
          </Box>

          <Box
            sx={{
              px: 1.25,
              py: 1,
              backgroundColor: alpha(tapeTintColor, 0.12),
              borderTop: `1px solid ${alpha(tapeTintColor, 0.28)}`,
            }}
          >
            {/* Tape rows + overlayed shared custom scrollbar */}
            <Box
              ref={tapeContainerRef}
              className={runTapeStyles.hiddenScrollbar}
              sx={{
                overflowX: 'auto',
                overflowY: 'hidden',
                width: '100%',
                backgroundColor: 'transparent',
                scrollbarWidth: 'none',
                borderRadius: 1,
              }}
            >
              <Stack spacing={0}>
                {config.tapes.map((tape, i) => (
                  <TapeRow
                    key={i}
                    tapeIndex={i}
                    tape={tape}
                    head={config.heads[i] ?? 0}
                    blank={blank}
                    minR={minR}
                    maxR={maxR}
                    headX={headX}
                  />
                ))}
              </Stack>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Pending-Dialog */}
      <Dialog
        open={pendingOpen}
        onClose={closePending}
        maxWidth="xs"
        fullWidth
        sx={{ zIndex: 2000 }}
      >
        <DialogTitle>Compute from this configuration</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Please select how many additional configurations to compute.
          </Typography>
          <Box sx={{ px: 1, pb: 1 }}>
            <Slider
              value={pendingAmount}
              min={1}
              max={MAX_AMOUNT}
              step={1}
              onChange={(_, v) => setPendingAmount(v as number)}
              valueLabelDisplay="on"
              aria-label="Number of configurations to compute"
              sx={{ mt: 4 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closePending}>Cancel</Button>
          <Button variant="contained" onClick={confirmPending}>
            Compute
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
