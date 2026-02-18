// src/components/TapeList/TapeList.tsx
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

  const isRunningLive = useGlobalZustand((state) => state.runningLive);
  const runSpeedMs = useGlobalZustand((state) => state.runSpeedMs);
  const setRunSpeedMs = useGlobalZustand((state) => state.setRunSpeedMs);
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const stepsPerSecond = (1000 / runSpeedMs).toFixed(2);

  return (
    <Stack spacing={1}>
      {/* Tapes */}
      <Stack spacing={0.5}>
        {Array.from({ length: numTapes }, (_, i) => (
          <Tape key={i} index={i} />
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
            min={100}
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
            },
          }}
        >
          {!isRunningLive ? (
            <Button
              onClick={() => startRunningLive()}
              startIcon={
                <PlayArrow fontSize="small" sx={{ transform: 'translateY(-1px)' }} />
              }
              sx={{
                alignItems: 'center',
                backgroundColor: theme.palette.primary.main,
              }}
            >
              Start
            </Button>
          ) : (
            <Button
              onClick={() => stopRunningLive()}
              startIcon={
                <Stop fontSize="small" sx={{ transform: 'translateY(-1px)' }} />
              }
              sx={{
                alignItems: 'center',
                backgroundColor: theme.palette.error.main,
              }}
            >
              Stop
            </Button>
          )}
          <Button
            onClick={() => makeStep()}
            disabled={isRunningLive}
            startIcon={
              <SkipNext fontSize="small" sx={{ transform: 'translateY(-1px)' }} />
            }
            sx={{
              alignItems: 'center',
              backgroundColor: theme.palette.primary.dark,
            }}
          >
            Step
          </Button>
          <Button
            onClick={() => runningReset()}
            startIcon={
              <RestartAlt fontSize="small" sx={{ transform: 'translateY(-1px)' }} />
            }
            sx={{ alignItems: 'center', backgroundColor: theme.palette.accent.main }}
          >
            Reset
          </Button>
        </ButtonGroup>
      </Box>
    </Stack>
  );
}

export default TapeList;
