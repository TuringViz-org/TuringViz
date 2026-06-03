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
import { TapeViewport } from '@components/TapeList/TapeViewport';

function symbol(value: string, blank: string): string {
  if (value === blank && blank === ' ') return '□';
  if (value === ' ') return '□';
  return value;
}

export function RunChoiceDialog() {
  const pendingRunChoice = useGlobalZustand((s) => s.pendingRunChoice);
  const blank = useGlobalZustand((s) => s.blank);

  const open = Boolean(pendingRunChoice);
  if (!pendingRunChoice) return null;

  const options = pendingRunChoice.byState.flatMap((group) =>
    group.options.map((option, optionIndex) => ({
      option,
      nextState: group.nextState,
      optionIndex,
    }))
  );

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
          From state {pendingRunChoice.fromConfig.state} — pick one of the{' '}
          {options.length} possible next configurations.
        </Typography>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          p: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: (t) => t.palette.background.paper,
        }}
      >
        <Box sx={{ display: 'flex', minHeight: 0, flexDirection: 'column' }}>
          <Box
            sx={{
              flexShrink: 0,
              backgroundColor: (t) => alpha(t.palette.primary.light, 0.16),
              px: { xs: 2, sm: 3 },
              pt: 2,
              pb: 1.25,
              borderBottom: (t) =>
                `1px solid ${alpha(t.palette.primary.light, 0.35)}`,
            }}
          >
            <Paper
              variant="outlined"
              sx={{
                p: 1.25,
                borderRadius: 2,
                borderColor: (t) => alpha(t.palette.divider, 0.8),
                backgroundColor: (t) => t.palette.background.paper,
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mb: 0.75 }}
              >
                <Typography variant="subtitle2">Current Configuration</Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`State: ${pendingRunChoice.fromConfig.state}`}
                />
              </Stack>

              <TapeViewport
                configuration={pendingRunChoice.fromConfig}
                resetKey={pendingRunChoice.fromConfig.state}
              />
            </Paper>
          </Box>

          <Stack
            spacing={1.25}
            sx={{
              minHeight: 0,
              overflowY: 'auto',
              px: { xs: 2, sm: 3 },
              py: 1.25,
            }}
          >
            {options.map(({ option, nextState, optionIndex }, idx) => {
              const transition = option.transition;
              const tapes = Math.max(
                transition.tapecondition?.length ?? 0,
                transition.write?.length ?? 0,
                transition.direction?.length ?? 0
              );

              return (
                <Paper
                  key={`${nextState}-${option.transitionIndex}-${idx}`}
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
                      onClick={() => selectPendingRunChoice(nextState, optionIndex)}
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

                      const readText =
                        read && isTapePatternRealFieldbyField(read)
                          ? symbol(read.value, blank)
                          : '*';
                      const writeText =
                        write && isTapeWriteRealFieldbyField(write)
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
                            sx={{
                              fontFamily: (t) => t.typography.fontFamilyMonospace,
                            }}
                          >
                            {readText}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: (t) => t.typography.fontFamilyMonospace,
                            }}
                          >
                            {writeText}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: (t) => t.typography.fontFamilyMonospace,
                            }}
                          >
                            {move}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>

                  <Divider sx={{ my: 1 }} />

                  <Box
                    sx={{
                      borderRadius: 2,
                      p: 1,
                      backgroundColor: (t) => alpha(t.palette.info.light, 0.18),
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle2">
                          Resulting Configuration
                        </Typography>
                        <Chip
                          size="small"
                          label={`State: ${option.config.state}`}
                          sx={{
                            fontWeight: 600,
                            backgroundColor: (t) =>
                              alpha(t.palette.info.light, 0.45),
                          }}
                        />
                      </Stack>

                      <TapeViewport
                        configuration={option.config}
                        resetKey={`${nextState}-${idx}`}
                      />
                    </Stack>
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={closePendingRunChoiceDialog}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
