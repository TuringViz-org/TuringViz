import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Slider,
  Typography,
} from '@mui/material';
import { MIN_CONFIG_GRAPH_TARGET_NODES } from '@utils/constants';

type ComputeConfigGraphDialogProps = {
  open: boolean;
  targetNodes: number;
  onTargetNodesChange: (value: number) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ComputeConfigGraphDialog({
  open,
  targetNodes,
  onTargetNodesChange,
  onClose,
  onConfirm,
}: ComputeConfigGraphDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      sx={{ zIndex: 3000 }}
    >
      <DialogTitle>Compute Configuration Graph</DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" sx={{ mb: 2.5 }}>
          Please select the approximate target number of nodes.
        </Typography>

        <Slider
          value={targetNodes}
          min={MIN_CONFIG_GRAPH_TARGET_NODES}
          max={30000}
          step={10}
          onChange={(_, value) => onTargetNodesChange(value as number)}
          valueLabelDisplay="on"
          aria-label="Configuration graph target nodes"
          sx={{ mt: 2, mb: 0 }}
        />
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
