import * as React from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Slider,
  Divider,
  IconButton,
  Tooltip,
  Button,
} from '@mui/material';
import { Close, RestartAlt } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';

import { CONTROL_HEIGHT } from '../util/constants';
import type { ElkOptions } from '@mytypes/graphTypes';
import { ConfigNodeMode } from '@utils/constants';

type Props = {
  open: boolean;
  onClose: () => void;
  value: ElkOptions;
  onChange: (next: ElkOptions) => void;
  onReset?: () => void;
  onRecalc?: () => void;
  running?: boolean;
  mode?: ConfigNodeMode;
};

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" sx={{ minWidth: 80, color: 'text.secondary' }}>
      {children}
    </Typography>
  );
}

/**
 * Panel für ELK-Layout (layered-only), analog zum ConfigGraph-Panel
 * – ohne Algorithmus-Auswahl.
 */
export function TreeLayoutSettingsPanel({
  open,
  onClose,
  value,
  onChange,
  onReset,
  onRecalc,
  running,
  mode = ConfigNodeMode.NODES,
}: Props) {
  if (!open) return null;

  const handleNumber = (k: keyof ElkOptions) => (_: any, val: number | number[]) =>
    onChange({ ...value, [k]: Array.isArray(val) ? val[0] : val });
  const directionMode = value.autoDirection ? 'AUTO' : value.direction;
  const sliderLimits =
    mode === ConfigNodeMode.CARDS
      ? {
          nodeSep: { min: 20, max: 200, step: 2 },
          rankSep: { min: 60, max: 400, step: 4 },
          edgeSep: { min: 0, max: 120, step: 2 },
          edgeNodeSep: { min: 40, max: 400, step: 4 },
          padding: { min: 0, max: 200, step: 2 },
        }
      : {
          nodeSep: { min: 0, max: 160, step: 2 },
          rankSep: { min: 0, max: 200, step: 2 },
          edgeSep: { min: 0, max: 80, step: 1 },
          edgeNodeSep: { min: 0, max: 260, step: 2 },
          padding: { min: 0, max: 120, step: 2 },
        };

  return (
    <Paper
      elevation={3}
      sx={(t) => ({
        position: 'absolute',
        top: 56,
        right: 12,
        zIndex: t.zIndex.appBar + 1,
        minWidth: 340,
        maxWidth: 380,
        p: 1.25,
        borderRadius: 2,
        bgcolor: t.palette.background.paper,
        border: (t) => `1px solid ${alpha(t.palette.divider, 0.32)}`,
        pointerEvents: 'auto',
      })}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Layout Settings
        </Typography>
        <Box sx={{ flex: 1 }} />

        {onReset && (
          <Button
            size="small"
            variant="contained"
            color="accent"
            startIcon={<RestartAlt fontSize="small" />}
            onClick={onReset}
            sx={{ textTransform: 'none' }}
          >
            Reset
          </Button>
        )}

        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose}>
            <Close fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack spacing={1.25}>
        {/* Direction */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={0.75}>
          <RowLabel>Direction</RowLabel>
          <Box
            sx={{
              flex: 1,
              minWidth: 132,
            }}
          >
            <ToggleButtonGroup
              size="small"
              exclusive
              value={directionMode}
              onChange={(_, v) => {
                if (!v) return;
                if (v === 'AUTO') {
                  onChange({ ...value, autoDirection: true });
                  return;
                }
                onChange({
                  ...value,
                  direction: v,
                  autoDirection: false,
                });
              }}
              sx={{
                width: '100%',
                minWidth: 0,
                height: CONTROL_HEIGHT,
                borderRadius: 1.5,
                overflow: 'hidden',
                border: (theme) => `1px solid ${theme.palette.divider}`,
                '& .MuiToggleButton-root': {
                  flex: 1,
                  minWidth: 0,
                  height: CONTROL_HEIGHT,
                  border: 'none',
                  borderRadius: 0,
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  px: 0.75,
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
              <ToggleButton value="AUTO">Auto</ToggleButton>
              <ToggleButton value="DOWN">Down</ToggleButton>
              <ToggleButton value="RIGHT">Right</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <span>
            <Button
              size="small"
              variant="contained"
              onClick={onRecalc}
              loading={!!running}
              startIcon={<RestartAlt fontSize="small" />}
              sx={{
                textTransform: 'none',
                height: CONTROL_HEIGHT,
                borderRadius: 1.5,
                px: 1.25,
              }}
            >
              Recalculate
            </Button>
          </span>
        </Stack>

        <Divider />

        {/* Spacings */}
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <RowLabel>Node sep</RowLabel>
            <Slider
              size="small"
              min={sliderLimits.nodeSep.min}
              max={sliderLimits.nodeSep.max}
              step={sliderLimits.nodeSep.step}
              value={value.nodeSep}
              onChange={handleNumber('nodeSep')}
            />
            <Typography variant="caption" sx={{ width: 36, textAlign: 'right' }}>
              {value.nodeSep}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <RowLabel>Rank sep</RowLabel>
            <Slider
              size="small"
              min={sliderLimits.rankSep.min}
              max={sliderLimits.rankSep.max}
              step={sliderLimits.rankSep.step}
              value={value.rankSep}
              onChange={handleNumber('rankSep')}
            />
            <Typography variant="caption" sx={{ width: 36, textAlign: 'right' }}>
              {value.rankSep}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <RowLabel>Edge sep</RowLabel>
            <Slider
              size="small"
              min={sliderLimits.edgeSep.min}
              max={sliderLimits.edgeSep.max}
              step={sliderLimits.edgeSep.step}
              value={value.edgeSep}
              onChange={handleNumber('edgeSep')}
            />
            <Typography variant="caption" sx={{ width: 36, textAlign: 'right' }}>
              {value.edgeSep}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <RowLabel>Edge↔Node</RowLabel>
            <Slider
              size="small"
              min={sliderLimits.edgeNodeSep.min}
              max={sliderLimits.edgeNodeSep.max}
              step={sliderLimits.edgeNodeSep.step}
              value={value.edgeNodeSep}
              onChange={handleNumber('edgeNodeSep')}
            />
            <Typography variant="caption" sx={{ width: 36, textAlign: 'right' }}>
              {value.edgeNodeSep}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <RowLabel>Padding</RowLabel>
            <Slider
              size="small"
              min={sliderLimits.padding.min}
              max={sliderLimits.padding.max}
              step={sliderLimits.padding.step}
              value={value.padding}
              onChange={handleNumber('padding')}
            />
            <Typography variant="caption" sx={{ width: 36, textAlign: 'right' }}>
              {value.padding}
            </Typography>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
