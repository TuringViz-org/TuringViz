// src/components/MainPage/PanelCard.tsx
import { Box, Typography, Paper, Divider, Stack } from '@mui/material';
import type { ResponsiveStyleValue } from '@mui/system';

/* --- Reusable Card for Panels --- */
export function PanelCard(props: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  minHeight?: ResponsiveStyleValue<number | string>;
  denseBodyPadding?: boolean;
  fillHeight?: boolean;
}) {
  const {
    title,
    children,
    actions,
    minHeight,
    denseBodyPadding = false,
    fillHeight = true,
  } = props;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        height: fillHeight ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: (t) => t.palette.background.default,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {actions ? (
          <Stack direction="row" spacing={1} alignItems="center">
            {actions}
          </Stack>
        ) : null}
      </Box>
      <Divider />
      <Box
        sx={{
          flex: 1,
          minHeight,
          position: 'relative',
          ...(denseBodyPadding ? { p: 1.5 } : {}),
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}
