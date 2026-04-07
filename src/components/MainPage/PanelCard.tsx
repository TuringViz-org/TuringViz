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
  hideHeader?: boolean;
}) {
  const {
    title,
    children,
    actions,
    minHeight,
    denseBodyPadding = false,
    fillHeight = true,
    hideHeader = false,
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
      {!hideHeader ? (
        <>
          <Box
            sx={{
              px: 2,
              py: 1,
              minHeight: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              columnGap: 1,
              flexWrap: 'nowrap',
              bgcolor: (t) => t.palette.background.default,
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                minWidth: 0,
                flex: 1,
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
                sx={{
                  width: 'auto',
                  justifyContent: 'flex-end',
                  flexWrap: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {actions}
              </Stack>
            ) : null}
          </Box>
          <Divider />
        </>
      ) : null}
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
