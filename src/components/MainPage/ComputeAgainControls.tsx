import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Slider,
  Stack,
  Typography,
} from '@mui/material';

type ComputeAgainControlsProps = {
  targetNodes: number;
  minTargetNodes: number;
  maxTargetNodes: number;
  onTargetNodesChange: (value: number) => void;
  onComputeAgain: () => void | Promise<void>;
  disabled?: boolean;
  showCompressed?: boolean;
  compressed?: boolean;
  onCompressedChange?: (value: boolean) => void;
  sliderAriaLabel: string;
};

export function ComputeAgainControls({
  targetNodes,
  minTargetNodes,
  maxTargetNodes,
  onTargetNodesChange,
  onComputeAgain,
  disabled = false,
  showCompressed = false,
  compressed = false,
  onCompressedChange,
  sliderAriaLabel,
}: ComputeAgainControlsProps) {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{
        minWidth: 0,
        minHeight: 34,
        py: 0.25,
        flexWrap: 'nowrap',
        justifyContent: 'flex-end',
        maxWidth: '100%',
        overflowX: 'auto',
      }}
    >
      {showCompressed && onCompressedChange ? (
        <FormControlLabel
          sx={{ m: 0, height: 34, whiteSpace: 'nowrap' }}
          control={
            <Checkbox
              size="small"
              checked={compressed}
              disabled={disabled}
              onChange={(event) => onCompressedChange(event.target.checked)}
            />
          }
          label={
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ lineHeight: 1, fontWeight: 500 }}
            >
              Compressed
            </Typography>
          }
        />
      ) : null}

      <Box
        sx={{ width: { xs: 96, sm: 180, md: 220 }, display: 'flex', alignItems: 'center' }}
      >
        <Slider
          size="small"
          value={targetNodes}
          min={minTargetNodes}
          max={maxTargetNodes}
          step={10}
          onChange={(_, value) => onTargetNodesChange(value as number)}
          valueLabelDisplay="off"
          disabled={disabled}
          aria-label={sliderAriaLabel}
          sx={{ py: 0 }}
        />
      </Box>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          minWidth: { xs: 68, sm: 90 },
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500,
        }}
      >
        {targetNodes} Nodes
      </Typography>

      <Button
        size="small"
        variant="contained"
        onClick={() => void onComputeAgain()}
        disabled={disabled}
        sx={{ whiteSpace: 'nowrap' }}
      >
        Compute again
      </Button>
    </Stack>
  );
}
