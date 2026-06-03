// src/components/MainPage/RunModeSelector.tsx
import {
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  useTheme,
} from '@mui/material';

import { useGlobalZustand } from '@zustands/GlobalZustand';
import { changeRunMode } from '@tmfunctions/Running';
import type { RunMode } from '@utils/constants';

const RUN_MODE_OPTIONS: { value: RunMode; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'random', label: 'Random' },
  { value: 'accepting', label: 'Accepting' },
  { value: 'rejecting', label: 'Rejecting' },
];

export function RunModeSelector() {
  const theme = useTheme();
  const runMode = useGlobalZustand((state) => state.runMode);
  const stack = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      fullWidth
      orientation={stack ? 'vertical' : 'horizontal'}
      value={runMode}
      onChange={(_, next: RunMode | null) => {
        // Ignore deselection clicks: keep exactly one mode active at all times.
        if (next === null) return;
        changeRunMode(next);
      }}
      sx={{
        // The whole group casts a single elevation (like the Start/Step/Reset
        // ButtonGroup) so the shadow appears only around the bar, never between
        // adjacent buttons.
        boxShadow: theme.shadows[2],
        '& .MuiToggleButton-root': {
          // Colors match the Start/Step/Reset buttons (MUI contained, size small):
          // unselected = Start color, selected = Step color. No per-button shadow.
          fontWeight: 500,
          border: 'none',
          boxShadow: 'none',
          color: theme.palette.getContrastText(theme.palette.primary.main),
          backgroundColor: theme.palette.primary.main,
          '&:hover': {
            boxShadow: 'none',
            backgroundColor: theme.palette.primary.dark,
          },
          '&.Mui-selected': {
            boxShadow: 'none',
            color: theme.palette.getContrastText(theme.palette.primary.dark),
            backgroundColor: theme.palette.primary.dark,
            // Keep the selected color steady on hover.
            '&:hover': {
              boxShadow: 'none',
              backgroundColor: theme.palette.primary.dark,
            },
          },
        },
        // Keep dividers only between buttons, no outer frame.
        '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
          [stack ? 'borderTop' : 'borderLeft']: `1px solid ${theme.palette.primary.dark}`,
        },
      }}
    >
      {RUN_MODE_OPTIONS.map((option) => (
        <ToggleButton key={option.value} value={option.value}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
