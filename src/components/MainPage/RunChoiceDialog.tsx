import { useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';

import {
  closePendingRunChoiceDialog,
  selectPendingRunChoice,
} from '@tmfunctions/Running';
import {
  isTapePatternRealFieldbyField,
  isTapeWriteRealFieldbyField,
} from '@mytypes/TMTypes';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { Tape } from '@components/TapeList/Tape';

function symbol(value: string, blank: string): string {
  if (value === blank && blank === ' ') return '□';
  if (value === ' ') return '□';
  return value;
}

export function RunChoiceDialog() {
  const pendingRunChoice = useGlobalZustand((s) => s.pendingRunChoice);
  const blank = useGlobalZustand((s) => s.blank);

  const activeGroup = useMemo(() => {
    if (!pendingRunChoice || !pendingRunChoice.selectedState) return null;
    return (
      pendingRunChoice.byState.find(
        (entry) => entry.nextState === pendingRunChoice.selectedState
      ) ?? null
    );
  }, [pendingRunChoice]);

  const open = Boolean(activeGroup);
  if (!pendingRunChoice) return null;

  return (
    <Dialog
      open={open}
      onClose={closePendingRunChoiceDialog}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Choose Next Configuration
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {pendingRunChoice.fromConfig.state} →{' '}
          {activeGroup?.nextState ?? 'Select a highlighted transition first'}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {!activeGroup ? null : (
          <Stack spacing={1.25}>
            <Paper
              variant="outlined"
              sx={{
                p: 1.25,
                borderRadius: 2,
                borderColor: (t) => alpha(t.palette.divider, 0.8),
                backgroundColor: (t) => t.palette.background.paper,
                position: 'sticky',
                top: -1,
                zIndex: 2,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                <Typography variant="subtitle2">Current Configuration</Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`State: ${pendingRunChoice.fromConfig.state}`}
                />
              </Stack>

              <Stack spacing={0.25}>
                {pendingRunChoice.fromConfig.tapes.map((_, tapeIdx) => (
                  <Tape
                    key={`current-${tapeIdx}`}
                    index={tapeIdx}
                    configuration={pendingRunChoice.fromConfig}
                  />
                ))}
              </Stack>
            </Paper>

            {activeGroup.options.map((option, idx) => {
              const transition = option.transition;
              const tapes = Math.max(
                transition.tapecondition?.length ?? 0,
                transition.write?.length ?? 0,
                transition.direction?.length ?? 0
              );

              return (
                <Paper
                  key={`${option.transitionIndex}-${idx}`}
                  variant="outlined"
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    borderColor: (t) => alpha(t.palette.divider, 0.8),
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 0.75 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" label={`Option ${idx + 1}`} />
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={`Transition #${option.transitionIndex + 1}`}
                      />
                    </Stack>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() =>
                        selectPendingRunChoice(activeGroup.nextState, idx)
                      }
                    >
                      Choose
                    </Button>
                  </Stack>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '64px 1fr 1fr 64px',
                      columnGap: 1,
                      mb: 0.5,
                      opacity: 0.7,
                    }}
                  >
                    <Typography variant="caption">Tape</Typography>
                    <Typography variant="caption">Read</Typography>
                    <Typography variant="caption">Write</Typography>
                    <Typography variant="caption">Move</Typography>
                  </Box>

                  <Stack spacing={0.25}>
                    {Array.from({ length: tapes }).map((_, tapeIdx) => {
                      const read = transition.tapecondition?.[tapeIdx];
                      const write = transition.write?.[tapeIdx];
                      const move = transition.direction?.[tapeIdx] ?? 'S';

                      const readText = read && isTapePatternRealFieldbyField(read)
                        ? symbol(read.value, blank)
                        : '*';
                      const writeText = write && isTapeWriteRealFieldbyField(write)
                        ? symbol(write.value, blank)
                        : 'same';

                      return (
                        <Box
                          key={tapeIdx}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: '64px 1fr 1fr 64px',
                            columnGap: 1,
                            alignItems: 'center',
                          }}
                        >
                          <Typography variant="body2">#{tapeIdx + 1}</Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: (t) => t.typography.fontFamilyMonospace }}
                          >
                            {readText}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: (t) => t.typography.fontFamilyMonospace }}
                          >
                            {writeText}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: (t) => t.typography.fontFamilyMonospace }}
                          >
                            {move}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>

                  <Divider sx={{ my: 1 }} />

                  <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2">Resulting Configuration</Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`State: ${option.config.state}`}
                      />
                    </Stack>

                    <Stack spacing={0.25}>
                      {option.config.tapes.map((_, tapeIdx) => (
                        <Tape
                          key={`preview-${idx}-${tapeIdx}`}
                          index={tapeIdx}
                          configuration={option.config}
                        />
                      ))}
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={closePendingRunChoiceDialog}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
