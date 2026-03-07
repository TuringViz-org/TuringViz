// src/components/TapeList/TapeList.tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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

import styles from './TapeList.module.css';

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
  const tapeContainerRef = useRef<HTMLDivElement | null>(null);
  const CELL_SIZE = 50;
  const EXTRA_SCROLL_CELLS = 100;

  const sharedBoundsR = useMemo(() => {
    let minR = Number.POSITIVE_INFINITY;
    let maxR = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < numTapes; i++) {
      const tape = tapes[i];
      const head = heads[i] ?? 0;

      if (!tape) continue;
      const leftLen = tape[0]?.length ?? 0;
      const rightLen = tape[1]?.length ?? 0;
      
      const minPos = Math.min(head - Math.floor(EXTRA_SCROLL_CELLS/2), -leftLen - 10);
      const maxPos = Math.max(head + Math.floor(EXTRA_SCROLL_CELLS/2), rightLen + 10);

      minR = Math.min(minR, minPos - head);
      maxR = Math.max(maxR, maxPos - head);
    }

    if (!Number.isFinite(minR) || !Number.isFinite(maxR)) {
      return { sharedMinR: -EXTRA_SCROLL_CELLS, sharedMaxR: EXTRA_SCROLL_CELLS };
    }

    return { sharedMinR: minR, sharedMaxR: maxR };
  }, [heads, tapes, numTapes]);

  const { sharedMinR, sharedMaxR } = sharedBoundsR;
  // Shift by 1 cell to the right to leave space for the left dots (which are at position - 1)
  const headX = -(sharedMinR - 1) * CELL_SIZE;
  const prevHeadXRef = useRef(headX);

  useLayoutEffect(() => {
    const diff = headX - prevHeadXRef.current;
    if (diff !== 0 && tapeContainerRef.current) {
      tapeContainerRef.current.scrollLeft += diff;
    }
    prevHeadXRef.current = headX;
  }, [headX]);

  const centerHeads = useCallback((smooth = false) => {
    if (!tapeContainerRef.current) return;
    const viewWidth = tapeContainerRef.current.clientWidth;
    const targetScrollLeft = headX - viewWidth / 2 + CELL_SIZE / 2;
    tapeContainerRef.current.scrollTo({
      left: targetScrollLeft,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, [headX]);

  // Center initially and on load/reset
  useEffect(() => {
    const t = setTimeout(() => centerHeads(false), 10);
    return () => clearTimeout(t);
  }, [centerHeads, machineLoadVersion, numTapes]);

  // Ensure heads stay in view during normal running
  useEffect(() => {
    if (!tapeContainerRef.current) return;
    const viewWidth = tapeContainerRef.current.clientWidth;
    const currentScroll = tapeContainerRef.current.scrollLeft;
    
    // Smooth track during live running or center when stopped
    const margin = 100;
    if (
      !running ||
      headX < currentScroll + margin ||
      headX > currentScroll + viewWidth - margin
    ) {
      centerHeads(running);
    }
  }, [heads, numTapes, running, headX, centerHeads]);

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
      <div 
        ref={tapeContainerRef}
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          width: '100%',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          backgroundColor: '#ffffff',
          padding: '10px 0',
          scrollbarWidth: 'none' /* Hide standard scrollbar completely */
        }}
        className={styles.hiddenScrollbar}
      >
        <Stack spacing={1} style={{ width: 'max-content' }}>
          {Array.from({ length: numTapes }, (_, i) => (
            <Tape
              key={i}
              index={i}
              scrollable
              sharedMinR={sharedMinR}
              sharedMaxR={sharedMaxR}
            />
          ))}
        </Stack>
      </div>

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
