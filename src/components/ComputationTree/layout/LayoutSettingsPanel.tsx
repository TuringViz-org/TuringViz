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

type Props = {
  open: boolean;
  onClose: () => void;
  value: ElkOptions;
  onChange: (next: ElkOptions) => void;
  onReset?: () => void;
  onRecalc?: () => void;
  running?: boolean;
};

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" sx={{ minWidth: 92, color: 'text.secondary' }}>
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
}: Props) {
  if (!open) return null;

  const handleNumber = (k: keyof ElkOptions) => (_: any, val: number | number[]) =>
    onChange({ ...value, [k]: Array.isArray(val) ? val[0] : val });
  const directionMode = value.autoDirection ? 'AUTO' : value.direction;

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
        <Stack direction="row" spacing={1} alignItems="center">
          <RowLabel>Direction</RowLabel>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              overflowX: 'auto',
              overflowY: 'hidden',
              pr: 0.5,
              scrollbarWidth: 'thin',
              '&::-webkit-scrollbar': { height: 6 },
              '&::-webkit-scrollbar-thumb': (theme) => ({
                backgroundColor: alpha(theme.palette.divider, 0.8),
                borderRadius: 999,
              }),
              '&::-webkit-scrollbar-track': { background: 'transparent' },
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
                width: 'max-content',
                minWidth: '100%',
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
              min={20}
              max={200}
              step={2}
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
              min={60}
              max={400}
              step={4}
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
              min={0}
              max={120}
              step={2}
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
              min={40}
              max={400}
              step={4}
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
              min={0}
              max={200}
              step={2}
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
