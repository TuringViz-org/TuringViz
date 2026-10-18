import {
  Box,
  Button,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Fab,
} from '@mui/material';
import { Adjust, ViewAgenda, Tune, CenterFocusStrong } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useDeveloperControls } from '@hooks/useDeveloperControls';
import {
  useConfigGraphNodeMode,
  useConfigGraphELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import { ConfigNodeMode } from '@utils/constants';
import { CONTROL_HEIGHT } from './util/constants';
import { LayoutSettingsPanel } from './layout/LayoutSettingsPanel';

type Props = {
  settingsOpen: boolean;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showLoadingOverlay: boolean;
  running: boolean;
  onFit: () => void;
  onReset: () => void;
  onRecalc: () => void;
};

/** The same controls accompany both rendering engines. */
export function ConfigGraphControls({
  settingsOpen,
  setSettingsOpen,
  showLoadingOverlay,
  running,
  onFit,
  onReset,
  onRecalc,
}: Props) {
  const showDeveloperControls = useDeveloperControls();
  const configGraphNodeMode = useConfigGraphNodeMode();
  const configGraphELKSettings = useConfigGraphELKSettings();
  const setConfigGraphNodeMode = useGraphZustand((s) => s.setConfigGraphNodeMode);
  const setConfigGraphELKSettings = useGraphZustand(
    (s) => s.setConfigGraphELKSettings
  );
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
              onClick={() => setSettingsOpen((v) => !v)}
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

      {/* Layout settings panel */}
      <LayoutSettingsPanel
        open={showDeveloperControls && settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={configGraphELKSettings}
        onChange={(next) => setConfigGraphELKSettings(next)}
        onReset={onReset}
        onRecalc={onRecalc}
        running={running}
        mode={configGraphNodeMode}
      />

      {/* Top-left controls */}
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
            onClick={onFit}
            disabled={showLoadingOverlay}
            startIcon={<CenterFocusStrong fontSize="small" />}
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              textTransform: 'none',
              px: 1.25,
            }}
          >
            Fit view
          </Button>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={configGraphNodeMode}
            onChange={(_, v) => {
              if (!v) return;
              setConfigGraphNodeMode(v);
            }}
            aria-label="node rendering mode"
            sx={{
              height: CONTROL_HEIGHT,
              borderRadius: 1.5,
              overflow: 'hidden',
              border: (theme) => `1px solid ${theme.palette.divider}`,
              '& .MuiToggleButton-root': {
                height: CONTROL_HEIGHT,
                border: 'none',
                borderRadius: 0,
                textTransform: 'none',
                fontWeight: 500,
                px: 1.25,
                py: 0,
                boxShadow: (theme) => `inset 1px 0 0 ${theme.palette.divider}`,
                '&:first-of-type': { boxShadow: 'none' },
              },
              '& .Mui-selected': (theme) => ({
                backgroundColor: theme.palette.primary.main,
                color: theme.palette.primary.contrastText,
                '&:hover': { backgroundColor: theme.palette.primary.dark },
              }),
            }}
          >
            <ToggleButton value={ConfigNodeMode.NODES} aria-label="nodes">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Adjust fontSize="small" />
                <span>Nodes</span>
              </Stack>
            </ToggleButton>

            <ToggleButton value={ConfigNodeMode.CARDS} aria-label="card nodes">
              <Stack direction="row" spacing={0.75} alignItems="center">
                <ViewAgenda fontSize="small" />
                <span>Cards</span>
              </Stack>
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Box>
    </>
  );
}
