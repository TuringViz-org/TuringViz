import { useMemo } from 'react';
import {
  Box,
  Button,
  Fab,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import { Adjust, ViewAgenda, Tune, CenterFocusStrong } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { LegendPanel } from '@components/shared/LegendPanel';
import { useGraphUI } from '@components/shared/GraphUIContext';
import { useDeveloperControls } from '@hooks/useDeveloperControls';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  useComputationTreeNodeMode,
  useComputationTreeELKSettings,
  useGraphZustand,
} from '@zustands/GraphZustand';
import {
  ConfigNodeMode,
  DEFAULT_GRAPH_CARDS_ELK_OPTS,
  DEFAULT_GRAPH_ELK_OPTS,
} from '@utils/constants';
import { TreeLayoutSettingsPanel } from './layout/LayoutSettingsPanel';
import { CONTROL_HEIGHT } from './util/constants';

type Props = {
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onFit: () => void;
  fitDisabled: boolean;
  onRecalc: () => void;
  running: boolean;
  nodeCount: number;
};

export function TreeControls({
  settingsOpen,
  onSettingsOpenChange,
  onFit,
  fitDisabled,
  onRecalc,
  running,
  nodeCount,
}: Props) {
  const showDeveloperControls = useDeveloperControls();
  const computationTreeNodeMode = useComputationTreeNodeMode();
  const computationTreeELKSettings = useComputationTreeELKSettings();
  const setComputationTreeNodeMode = useGraphZustand(
    (s) => s.setComputationTreeNodeMode
  );
  const setComputationTreeELKSettings = useGraphZustand(
    (s) => s.setComputationTreeELKSettings
  );
  const stateColorMatching = useGlobalZustand((s) => s.stateColorMatching);
  const { hoveredState } = useGraphUI();
  const legendItems = useMemo(
    () =>
      Array.from(stateColorMatching.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, color]) => ({ key, color })),
    [stateColorMatching]
  );
  const showLegend = legendItems.length > 0 && nodeCount > 0;
  const resetLayoutSettings = () =>
    setComputationTreeELKSettings({
      ...(computationTreeNodeMode === ConfigNodeMode.CARDS
        ? DEFAULT_GRAPH_CARDS_ELK_OPTS
        : DEFAULT_GRAPH_ELK_OPTS),
    });
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
              onClick={() => onSettingsOpenChange(!settingsOpen)}
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
      <TreeLayoutSettingsPanel
        open={showDeveloperControls && settingsOpen}
        onClose={() => onSettingsOpenChange(false)}
        value={computationTreeELKSettings}
        onChange={(next) => setComputationTreeELKSettings(next)}
        onReset={resetLayoutSettings}
        onRecalc={onRecalc}
        running={running}
        mode={computationTreeNodeMode}
      />

      {/* Top-left controls panel (fit view and node mode switch) */}
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
            startIcon={<CenterFocusStrong fontSize="small" />}
            disabled={fitDisabled}
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
            value={computationTreeNodeMode}
            onChange={(_, v) => {
              if (!v) return;
              setComputationTreeNodeMode(v);
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

      {/* Legend panel */}
      <LegendPanel
        items={legendItems}
        visible={showLegend}
        hoveredKey={hoveredState}
        contentClassName="ct-scrollable"
      />
    </>
  );
}
