import { Box, Stack, CircularProgress, Typography } from '@mui/material';

export function LoadingOverlay({ label = 'Calculating layout...' }: { label?: string }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        pointerEvents: 'none',
        bgcolor: 'transparent',
      }}
    >
      <Stack alignItems="center" spacing={2}>
        <CircularProgress size={28} />
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Stack>
    </Box>
  );
}
