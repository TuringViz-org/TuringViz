// src/components/MainPage/ComputeTreeDialog.tsx
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Slider,
  Typography,
  Divider,
  Box,
  Stack,
  Checkbox,
  Chip,
} from '@mui/material';
import {
  MAX_COMPUTATION_TREE_TARGET_NODES,
  MIN_COMPUTATION_TREE_TARGET_NODES,
} from '@utils/constants';

type ComputeTreeDialogProps = {
  open: boolean;
  targetNodes: number;
  compressed: boolean;
  onTargetNodesChange: (value: number) => void;
  onCompressedChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ComputeTreeDialog({
  open,
  targetNodes,
  compressed,
  onTargetNodesChange,
  onCompressedChange,
  onClose,
  onConfirm,
}: ComputeTreeDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      sx={{ zIndex: 3000 }}
    >
      <DialogTitle>Compute Tree</DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" sx={{ mb: 2.5 }}>
          Please select the approximate target number of nodes.
        </Typography>

        <Slider
          value={targetNodes}
          min={MIN_COMPUTATION_TREE_TARGET_NODES}
          max={MAX_COMPUTATION_TREE_TARGET_NODES}
          step={10}
          onChange={(_, value) => onTargetNodesChange(value as number)}
          valueLabelDisplay="on"
          aria-label="Computation tree target nodes"
          sx={{ mt: 2, mb: 0 }}
        />

        <Divider sx={{ my: 1 }} />

        <Typography
          variant="overline"
          sx={{ display: 'block', mb: 0, color: 'text.secondary' }}
        >
          Further options
        </Typography>

        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Checkbox
              checked={compressed}
              onChange={(event) => onCompressedChange(event.target.checked)}
            />
            <Chip
              size="small"
              label="Compressed"
              color={compressed ? 'primary' : 'default'}
              variant={compressed ? 'filled' : 'outlined'}
            />
          </Stack>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ ml: 6.5, mt: -0.5 }}
          >
            Merge linear paths into single edges
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm}>
          Compute
        </Button>
      </DialogActions>
    </Dialog>
  );
}
