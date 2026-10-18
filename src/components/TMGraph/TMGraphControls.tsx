import type { Dispatch, SetStateAction } from 'react';
import { Box, Stack, Tooltip, Fab, Button, Paper, IconButton } from '@mui/material';
import { Cached, Tune, Add, Remove, CenterFocusStrong } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { LayoutSettingsPanel } from './layout/LayoutSettingsPanel';
import { CONTROL_HEIGHT } from './util/constants';
import { DEFAULT_ELK_OPTS } from '@utils/constants';
import { useDeveloperControls } from '@hooks/useDeveloperControls';
import { useTMGraphELKSettings, useGraphZustand } from '@zustands/GraphZustand';

export function TMGraphControls({
  settingsOpen,
  setSettingsOpen,
  running,
  recalcLayout,
  runFitView,
  zoomBy,
}: {
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  running: boolean;
  recalcLayout: () => void;
  runFitView: () => void;
  zoomBy: (factor: number) => void;
}) {
  const showDeveloperControls = useDeveloperControls();
  const tmGraphELKSettings = useTMGraphELKSettings();
  const setTMGraphELKSettings = useGraphZustand((s) => s.setTMGraphELKSettings);
  const resetToDefaults = () =>
    setTMGraphELKSettings({ ...DEFAULT_ELK_OPTS, direction: 'RIGHT' });
  return (
    <>
      {showDeveloperControls && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: (t) => t.zIndex.appBar + 1,
            pointerEvents: 'auto',
          }}
        >
          <Tooltip title="Layout settings">
            <Fab
              size="small"
              variant="extended"
              color="primary"
              onClick={(evt) => {
                evt.stopPropagation();
                setSettingsOpen((v) => !v);
              }}
              sx={{
                textTransform: 'none',
                boxShadow: (t) => `0 4px 12px ${alpha(t.palette.common.black, 0.2)}`,
                '& .MuiSvgIcon-root': { mr: 0.75, fontSize: 18 },
                px: 1.5,
                minHeight: 32,
              }}
            >
              <Tune />
              Layout
            </Fab>
          </Tooltip>
        </Box>
      )}

      <LayoutSettingsPanel
        open={showDeveloperControls && settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={tmGraphELKSettings}
        onChange={(next) => setTMGraphELKSettings(next)}
        onReset={resetToDefaults}
        onRecalc={recalcLayout}
        running={running}
      />

      <Box
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: (t) => t.zIndex.appBar + 1,
          pointerEvents: 'auto',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="contained"
            onClick={(evt) => {
              evt.stopPropagation();
              recalcLayout();
            }}
            disabled={running}
            startIcon={<Cached fontSize="small" />}
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              textTransform: 'none',
              px: 1.25,
            }}
          >
            Reset Layout
          </Button>
        </Stack>
      </Box>

      <Paper
        elevation={3}
        sx={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          zIndex: (t) => t.zIndex.appBar + 1,
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 1,
          overflow: 'hidden',
          border: (t) => `1px solid ${alpha(t.palette.divider, 0.55)}`,
        }}
        onClick={(evt) => evt.stopPropagation()}
      >
        <IconButton size="small" onClick={() => zoomBy(1.2)}>
          <Add fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => zoomBy(1 / 1.2)}>
          <Remove fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => runFitView()}>
          <CenterFocusStrong fontSize="small" />
        </IconButton>
      </Paper>
    </>
  );
}
