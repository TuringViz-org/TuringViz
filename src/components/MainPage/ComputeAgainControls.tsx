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
      sx={{ minWidth: 0, py: 0.25 }}
    >
      <Box
        sx={{ width: { xs: 150, sm: 220 }, display: 'flex', alignItems: 'center' }}
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
          minWidth: 90,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500,
        }}
      >
        {targetNodes} Nodes
      </Typography>

      {showCompressed && onCompressedChange ? (
        <FormControlLabel
          sx={{ mr: 0, my: 0 }}
          control={
            <Checkbox
              size="small"
              checked={compressed}
              disabled={disabled}
              onChange={(event) => onCompressedChange(event.target.checked)}
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Compressed
            </Typography>
          }
        />
      ) : null}

      <Button
        size="small"
        variant="contained"
        onClick={() => void onComputeAgain()}
        disabled={disabled}
      >
        Compute again
      </Button>
    </Stack>
  );
}
