// src/components/MainPage/FullscreenShell.tsx
import { useEffect } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Paper,
  Stack,
  Dialog,
  Tooltip,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { CloseFullscreen } from '@mui/icons-material';

/* --- Fullscreen Shell (for the three fullscreen views) --- */
export function FullscreenShell(props: {
  title: string;
  open: boolean;
  onClose: () => void;
  render: boolean;
  setRender: (v: boolean) => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { title, open, onClose, render, setRender, children, actions } = props;

  // After mounting the fullscreen content, fire a "resize" event once,
  // so that React Flow measures correctly right away
  useEffect(() => {
    if (!render) return;
    const id = requestAnimationFrame(() =>
      window.dispatchEvent(new Event('resize'))
    );
    return () => cancelAnimationFrame(id);
  }, [render]);

  const handleClose = () => {
    setRender(false);
    onClose();
  };

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={handleClose}
      keepMounted
      disableEscapeKeyDown={false}
      TransitionProps={{
        onEntering: () => setRender(false),
        onEntered: () => setRender(true),
        onExit: () => setRender(false),
      }}
    >
      <AppBar
        elevation={0}
        sx={{
          position: 'relative',
          bgcolor: (t) => t.palette.background.default,
          color: (t) => t.palette.text.primary,
          borderBottom: '1px solid',
          borderColor: (t) => t.palette.divider,
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 56, columnGap: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </Typography>

          {actions ? (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ flexShrink: 0, minWidth: 0, maxWidth: '100%' }}
            >
              {actions}
            </Stack>
          ) : null}

          <Tooltip title="Close Fullscreen">
            <IconButton
              edge="end"
              onClick={() => {
                setRender(false);
                onClose();
              }}
              sx={{ ml: 1 }}
            >
              <CloseFullscreen />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box sx={{ height: '100%', p: 2 }}>
        <Paper
          variant="outlined"
          sx={{ height: '100%', borderRadius: 2, overflow: 'hidden' }}
        >
          <Box sx={{ height: '100%', position: 'relative' }}>
            {render ? (
              children
            ) : (
              <Stack
                alignItems="center"
                justifyContent="center"
                sx={{ height: '100%' }}
                spacing={2}
              >
                <CircularProgress size={28} />
                <Typography variant="body2" color="text.secondary">
                  Preparing fullscreen view…
                </Typography>
              </Stack>
            )}
          </Box>
        </Paper>
      </Box>
    </Dialog>
  );
}
