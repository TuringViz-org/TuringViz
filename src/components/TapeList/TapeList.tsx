// src/components/TapeList/TapeList.tsx
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Slider,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { PlayArrow, Stop, SkipNext, RestartAlt } from '@mui/icons-material';

import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  makeStep,
  runningReset,
  startRunningLive,
  stopRunningLive,
} from '@tmfunctions/Running';
import { Tape } from './Tape';

function TapeList() {
  const theme = useTheme();
  const numTapes = useGlobalZustand((state) => state.numberOfTapes);
  const heads = useGlobalZustand((state) => state.heads);
  const tapes = useGlobalZustand((state) => state.tapes);
  const running = useGlobalZustand((state) => state.running);
  const machineLoadVersion = useGlobalZustand((state) => state.machineLoadVersion);

  const isRunningLive = useGlobalZustand((state) => state.runningLive);
  const runSpeedMs = useGlobalZustand((state) => state.runSpeedMs);
  const setRunSpeedMs = useGlobalZustand((state) => state.setRunSpeedMs);
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const stepsPerSecond = (1000 / runSpeedMs).toFixed(2);
  const tapeRowsRef = useRef<HTMLDivElement | null>(null);
  const viewportsRef = useRef<Array<HTMLDivElement | null>>([]);
  const isSyncingRef = useRef(false);
  const activeManualSourceRef = useRef<number | null>(null);
  const centerTimeoutRef = useRef<number | null>(null);
  const scrollAnimRef = useRef<number | null>(null);
  const sharedPanRef = useRef(0);
  const prevHeadsRef = useRef<number[] | null>(null);
  const prevIdleTapesRef = useRef(tapes);
  const headsRef = useRef(heads);
  const boundsRef = useRef<{ minPos: number; maxPos: number }>({
    minPos: -32,
    maxPos: 32,
  });
  const numTapesRef = useRef(numTapes);
  const CELL_SIZE = 50;
  const EXTRA_SCROLL_CELLS = 32;

  const sharedBounds = useMemo(() => {
    let minPos = Number.POSITIVE_INFINITY;
    let maxPos = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < numTapes; i++) {
      const tape = tapes[i];
      const head = heads[i] ?? 0;

      if (!tape) continue;
      const leftLen = tape[0]?.length ?? 0;
      const rightLen = tape[1]?.length ?? 0;
      const localMin = Math.min(head, -leftLen);
      const localMax = Math.max(head, rightLen - 1);

      minPos = Math.min(minPos, localMin);
      maxPos = Math.max(maxPos, localMax);
    }

    if (!Number.isFinite(minPos) || !Number.isFinite(maxPos)) {
      return { minPos: -EXTRA_SCROLL_CELLS, maxPos: EXTRA_SCROLL_CELLS };
    }

    return {
      minPos: minPos - EXTRA_SCROLL_CELLS,
      maxPos: maxPos + EXTRA_SCROLL_CELLS,
    };
  }, [heads, tapes, numTapes]);

  useEffect(() => {
    headsRef.current = heads;
  }, [heads]);

  useEffect(() => {
    boundsRef.current = sharedBounds;
  }, [sharedBounds]);

  useEffect(() => {
    numTapesRef.current = numTapes;
    if (viewportsRef.current.length > numTapes) {
      viewportsRef.current.length = numTapes;
    }
  }, [numTapes]);

  const getHeadCenteredScrollLeft = (
    head: number,
    minPos: number,
    clientWidth: number,
    totalWidth: number
  ) => {
    const headCenter = (head - minPos) * CELL_SIZE + CELL_SIZE / 2;
    const raw = headCenter - clientWidth / 2;
    const maxLeft = Math.max(0, totalWidth - clientWidth);
    return Math.max(0, Math.min(raw, maxLeft));
  };

  const setOverlayPan = useCallback((pan: number) => {
    const root = tapeRowsRef.current;
    if (!root) return;
    root.style.setProperty('--tv-shared-pan-px', `${pan}px`);
  }, []);

  const syncAllByPan = useCallback((
    pan: number,
    animated: boolean,
    fromHeads?: number[] | null,
    toHeads?: number[] | null
  ) => {
    const { minPos, maxPos } = boundsRef.current;
    const totalWidth = (maxPos - minPos + 1) * CELL_SIZE;
    const currentHeads = toHeads ?? headsRef.current;
    const sourceHeads = fromHeads ?? currentHeads;
    const tapeCount = numTapesRef.current;
    const targets: Array<{
      viewport: HTMLDivElement;
      startLeft: number;
      targetLeft: number;
    }> = [];

    for (let i = 0; i < tapeCount; i++) {
      const viewport = viewportsRef.current[i];
      if (!viewport) continue;
      const baseTarget = getHeadCenteredScrollLeft(
        currentHeads[i] ?? 0,
        minPos,
        viewport.clientWidth,
        totalWidth
      );
      const maxLeft = Math.max(0, totalWidth - viewport.clientWidth);
      const targetLeft = Math.max(0, Math.min(baseTarget + pan, maxLeft));
      let startLeft = viewport.scrollLeft;

      if (animated && sourceHeads) {
        const baseStart = getHeadCenteredScrollLeft(
          sourceHeads[i] ?? 0,
          minPos,
          viewport.clientWidth,
          totalWidth
        );
        startLeft = Math.max(0, Math.min(baseStart + pan, maxLeft));
        viewport.scrollLeft = startLeft;
      }

      targets.push({
        viewport,
        startLeft,
        targetLeft,
      });
    }

    if (scrollAnimRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }

    if (centerTimeoutRef.current !== null) {
      window.clearTimeout(centerTimeoutRef.current);
      centerTimeoutRef.current = null;
    }

    isSyncingRef.current = true;
    setOverlayPan(pan);
    if (!animated) {
      for (const item of targets) {
        item.viewport.scrollLeft = item.targetLeft;
      }
      centerTimeoutRef.current = window.setTimeout(() => {
        isSyncingRef.current = false;
      }, 0);
      return;
    }

    const durationMs = 200;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min(1, (timestamp - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);

      for (const item of targets) {
        item.viewport.scrollLeft =
          item.startLeft + (item.targetLeft - item.startLeft) * eased;
      }

      if (progress < 1) {
        scrollAnimRef.current = window.requestAnimationFrame(animate);
        return;
      }

      scrollAnimRef.current = null;
      isSyncingRef.current = false;
    };

    scrollAnimRef.current = window.requestAnimationFrame(animate);
  }, [setOverlayPan]);

  const registerScrollableViewport = useCallback(
    (index: number, viewport: HTMLDivElement | null) => {
      if (viewportsRef.current[index] === viewport) return;
      viewportsRef.current[index] = viewport;
      if (!viewport) return;
      requestAnimationFrame(() => {
        syncAllByPan(sharedPanRef.current, false, null, null);
      });
    },
    [syncAllByPan]
  );

  const onScrollableViewportScroll = useCallback((index: number) => {
    const activeSource = activeManualSourceRef.current;
    if (activeSource !== null && index !== activeSource) {
      return;
    }

    if (isSyncingRef.current) return;
    if (activeManualSourceRef.current === null) activeManualSourceRef.current = index;

    const source = viewportsRef.current[index];
    if (!source) return;
    const { minPos, maxPos } = boundsRef.current;
    const totalWidth = (maxPos - minPos + 1) * CELL_SIZE;
    const currentHeads = headsRef.current;
    const tapeCount = numTapesRef.current;
    const baseByTape = new Array<number>(tapeCount).fill(0);
    const maxLeftByTape = new Array<number>(tapeCount).fill(0);
    let globalPanMin = Number.NEGATIVE_INFINITY;
    let globalPanMax = Number.POSITIVE_INFINITY;

    for (let i = 0; i < tapeCount; i++) {
      const viewport = viewportsRef.current[i];
      if (!viewport) continue;

      const base = getHeadCenteredScrollLeft(
        currentHeads[i] ?? 0,
        minPos,
        viewport.clientWidth,
        totalWidth
      );
      const maxLeft = Math.max(0, totalWidth - viewport.clientWidth);
      baseByTape[i] = base;
      maxLeftByTape[i] = maxLeft;

      globalPanMin = Math.max(globalPanMin, -base);
      globalPanMax = Math.min(globalPanMax, maxLeft - base);
    }

    if (!Number.isFinite(globalPanMin) || !Number.isFinite(globalPanMax)) {
      return;
    }

    const rawPan = source.scrollLeft - baseByTape[index];
    const pan = Math.max(globalPanMin, Math.min(rawPan, globalPanMax));
    if (Math.abs(pan - rawPan) > 0.25) {
      source.scrollLeft = Math.max(
        0,
        Math.min(baseByTape[index] + pan, maxLeftByTape[index])
      );
    }

    sharedPanRef.current = pan;
    setOverlayPan(pan);

    isSyncingRef.current = true;
    for (let i = 0; i < tapeCount; i++) {
      if (i === index) continue;
      const viewport = viewportsRef.current[i];
      if (!viewport) continue;
      const targetLeft = Math.max(
        0,
        Math.min(baseByTape[i] + pan, maxLeftByTape[i])
      );
      if (Math.abs(viewport.scrollLeft - targetLeft) > 0.25) {
        viewport.scrollLeft = targetLeft;
      }
    }
    isSyncingRef.current = false;
  }, [setOverlayPan]);

  const onScrollableViewportHoverChange = useCallback((index: number | null) => {
    activeManualSourceRef.current = index;
  }, []);

  const recenterTapeView = useCallback(() => {
    const currentHeads = Array.from({ length: numTapesRef.current }, (_, i) => headsRef.current[i] ?? 0);
    sharedPanRef.current = 0;
    activeManualSourceRef.current = null;
    setOverlayPan(0);
    syncAllByPan(0, false, currentHeads, currentHeads);
  }, [setOverlayPan, syncAllByPan]);

  useEffect(() => {
    return () => {
      if (centerTimeoutRef.current !== null) {
        window.clearTimeout(centerTimeoutRef.current);
      }
      if (scrollAnimRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimRef.current);
      }
    };
  }, []);

  useEffect(() => {
    recenterTapeView();
  }, [machineLoadVersion, recenterTapeView]);

  useEffect(() => {
    if (running || isRunningLive) {
      prevIdleTapesRef.current = tapes;
      return;
    }
    if (prevIdleTapesRef.current === tapes) return;

    prevIdleTapesRef.current = tapes;
    recenterTapeView();
  }, [tapes, running, isRunningLive, recenterTapeView]);

  useEffect(() => {
    const currentHeads = Array.from({ length: numTapes }, (_, i) => heads[i] ?? 0);
    const oldHeads = prevHeadsRef.current;
    prevHeadsRef.current = currentHeads;

    if (!oldHeads) {
      sharedPanRef.current = 0;
      setOverlayPan(0);
      syncAllByPan(0, false, null, currentHeads);
      return;
    }

    let changed = false;
    for (let i = 0; i < numTapes; i++) {
      const diff = Math.abs((currentHeads[i] ?? 0) - (oldHeads[i] ?? 0));
      if (diff > 0) changed = true;
    }

    if (!changed) return;

    sharedPanRef.current = 0;
    setOverlayPan(0);
    syncAllByPan(0, running, oldHeads, currentHeads);
  }, [heads, numTapes, running, syncAllByPan, setOverlayPan]);
  const makeControlButtonSx = (bg: string, hover: string) => ({
    alignItems: 'center',
    color: theme.palette.getContrastText(bg),
    backgroundColor: bg,
    borderColor: `${bg} !important`,
    '&:hover': {
      backgroundColor: hover,
      borderColor: `${hover} !important`,
    },
    '&.Mui-disabled': {
      color: theme.palette.action.disabled,
      backgroundColor: theme.palette.action.disabledBackground,
      borderColor: `${theme.palette.action.disabledBackground} !important`,
    },
  });

  return (
    <Stack spacing={1}>
      {/* Tapes */}
      <Stack spacing={0.5} ref={tapeRowsRef}>
        {Array.from({ length: numTapes }, (_, i) => (
          <Tape
            key={i}
            index={i}
            scrollable
            sharedMinPos={sharedBounds.minPos}
            sharedMaxPos={sharedBounds.maxPos}
            registerScrollableViewport={registerScrollableViewport}
            onScrollableViewportScroll={onScrollableViewportScroll}
            onScrollableViewportHoverChange={onScrollableViewportHoverChange}
            showHorizontalScrollbar={false}
            disableManualScroll={isRunningLive}
          />
        ))}
      </Stack>

      {/* Controls */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: isSmallScreen ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) auto',
          alignItems: 'center',
          columnGap: 1,
          rowGap: 0.5,
          width: '100%',
        }}
      >
        <Box
          sx={{
            gridColumn: '1 / 2',
            width: isSmallScreen ? '100%' : 360,
            justifySelf: 'center',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              textAlign: 'center',
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            Run speed: {runSpeedMs} ms/step ({stepsPerSecond} steps/s)
          </Typography>
        </Box>

        <Box
          sx={{
            gridColumn: '1 / 2',
            width: isSmallScreen ? '100%' : 360,
            justifySelf: 'center',
          }}
        >
          <Slider
            size="medium"
            min={10}
            max={2000}
            step={10}
            value={runSpeedMs}
            onChange={(_, value) => setRunSpeedMs(Array.isArray(value) ? value[0] : value)}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value} ms`}
            sx={{
              '& .MuiSlider-rail, & .MuiSlider-track': { height: 8 },
              '& .MuiSlider-thumb': { width: 20, height: 20 },
              '& .MuiSlider-valueLabel': { fontSize: '0.9rem' },
            }}
          />
        </Box>

        <ButtonGroup
          size="small"
          variant="contained"
          orientation={isSmallScreen ? 'vertical' : 'horizontal'}
          fullWidth={isSmallScreen}
          sx={{
            gridColumn: isSmallScreen ? '1 / 2' : '2 / 3',
            gridRow: isSmallScreen ? 'auto' : '2 / 3',
            justifySelf: isSmallScreen ? 'stretch' : 'end',
            alignSelf: isSmallScreen ? 'stretch' : 'start',
            '& .MuiButtonGroup-grouped': {
              minWidth: isSmallScreen ? '100%' : undefined,
              boxShadow: 'none',
            },
            '& .MuiButtonGroup-grouped:not(:first-of-type)': {
              borderLeftColor: 'transparent',
            },
          }}
        >
          {!isRunningLive ? (
            <Button
              onClick={() => startRunningLive()}
              disableElevation
              startIcon={
                <PlayArrow fontSize="small" sx={{ transform: 'translateY(-1px)' }} />
              }
              sx={makeControlButtonSx(
                theme.palette.primary.main,
                theme.palette.primary.dark
              )}
            >
              Start
            </Button>
          ) : (
            <Button
              onClick={() => stopRunningLive()}
              disableElevation
              startIcon={
                <Stop fontSize="small" sx={{ transform: 'translateY(-1px)' }} />
              }
              sx={makeControlButtonSx(theme.palette.error.main, theme.palette.error.dark)}
            >
              Stop
            </Button>
          )}
          <Button
            onClick={() => makeStep()}
            disabled={isRunningLive}
            disableElevation
            startIcon={
              <SkipNext fontSize="small" sx={{ transform: 'translateY(-1px)' }} />
            }
            sx={makeControlButtonSx(
              theme.palette.primary.dark,
              theme.palette.primary.main
            )}
          >
            Step
          </Button>
          <Button
            onClick={() => runningReset()}
            disableElevation
            startIcon={
              <RestartAlt fontSize="small" sx={{ transform: 'translateY(-1px)' }} />
            }
            sx={makeControlButtonSx(
              theme.palette.accent.main,
              theme.palette.accent.main
            )}
          >
            Reset
          </Button>
        </ButtonGroup>
      </Box>
    </Stack>
  );
}

export default TapeList;
