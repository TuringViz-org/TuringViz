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
import { TapeViewport } from './TapeViewport';

function TapeList() {
  const theme = useTheme();
  const isRunningLive = useGlobalZustand((state) => state.runningLive);
  const runSpeedMs = useGlobalZustand((state) => state.runSpeedMs);
  const setRunSpeedMs = useGlobalZustand((state) => state.setRunSpeedMs);
  const stackControls = useMediaQuery(theme.breakpoints.down('lg'));
  const stepsPerSecond = (1000 / runSpeedMs).toFixed(2);

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
      <TapeViewport />

      {/* Controls */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: stackControls
            ? 'minmax(0, 1fr)'
            : 'minmax(0, 1fr) auto',
          alignItems: 'center',
          columnGap: 1,
          rowGap: 0.5,
          width: '100%',
        }}
      >
        <Box
          sx={{
            gridColumn: '1 / 2',
            width: '100%',
            maxWidth: stackControls ? '100%' : 360,
            justifySelf: stackControls ? 'stretch' : 'center',
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
            width: '100%',
            maxWidth: stackControls ? '100%' : 360,
            justifySelf: stackControls ? 'stretch' : 'center',
          }}
        >
          <Slider
            size="medium"
            min={10}
            max={2000}
            step={10}
            value={runSpeedMs}
            onChange={(_, value) =>
              setRunSpeedMs(Array.isArray(value) ? value[0] : value)
            }
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
          orientation={stackControls ? 'vertical' : 'horizontal'}
          fullWidth={stackControls}
          sx={{
            gridColumn: stackControls ? '1 / 2' : '2 / 3',
            gridRow: stackControls ? 'auto' : '2 / 3',
            justifySelf: stackControls ? 'stretch' : 'end',
            alignSelf: stackControls ? 'stretch' : 'start',
            '& .MuiButtonGroup-grouped': {
              minWidth: stackControls ? '100%' : undefined,
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
              sx={makeControlButtonSx(
                theme.palette.error.main,
                theme.palette.error.dark
              )}
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
