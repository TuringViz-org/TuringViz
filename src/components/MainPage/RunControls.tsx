// src/components/MainPage/RunControl.tsx
import { ButtonGroup, Button, useTheme } from '@mui/material';
import { PlayArrow, Stop, SkipNext, RestartAlt } from '@mui/icons-material';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  startRunningLive,
  stopRunningLive,
  makeStep,
  runningReset,
} from '@tmfunctions/Running';

const buttonAlignSx = {
  display: 'inline-flex',
  alignItems: 'center',
  lineHeight: 1.2,
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
} as const;

export function RunControls() {
  const theme = useTheme();
  const isRunningLive = useGlobalZustand((state) => state.runningLive);
  const makeControlButtonSx = (bg: string, hover: string) => ({
    ...buttonAlignSx,
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
    <ButtonGroup
      size="small"
      variant="contained"
      sx={{
        '& .MuiButtonGroup-grouped': {
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
          startIcon={<PlayArrow fontSize="small" />}
          sx={makeControlButtonSx(theme.palette.primary.main, theme.palette.primary.dark)}
        >
          Start
        </Button>
      ) : (
        <Button
          onClick={() => stopRunningLive()}
          disableElevation
          startIcon={<Stop fontSize="small" />}
          sx={makeControlButtonSx(theme.palette.error.main, theme.palette.error.dark)}
        >
          Stop
        </Button>
      )}

      <Button
        onClick={() => makeStep()}
        disabled={isRunningLive}
        disableElevation
        startIcon={<SkipNext fontSize="small" />}
        sx={makeControlButtonSx(theme.palette.primary.dark, theme.palette.primary.main)}
      >
        Step
      </Button>

      <Button
        onClick={() => runningReset()}
        disableElevation
        startIcon={<RestartAlt fontSize="small" />}
        sx={makeControlButtonSx(theme.palette.accent.main, theme.palette.accent.main)}
      >
        Reset
      </Button>
    </ButtonGroup>
  );
}
