import { Paper, Stack, Typography, Box } from '@mui/material';

type Item = { k: string; d: string; ex?: string };

export function LanguageLegend(props: { title: string; items: Item[] }) {
  const { title, items } = props;

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={1.25}>
        {items.map((it, idx) => (
          <Box key={idx}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {it.k}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {it.d}
            </Typography>
            {it.ex && (
              <Typography
                variant="caption"
                sx={{
                  display: 'inline-block',
                  mt: 0.5,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: (t) =>
                    t.palette.mode === 'light'
                      ? t.palette.grey[100]
                      : t.palette.grey[900],
                  border: (t) => `1px solid ${t.palette.divider}`,
                  fontFamily: (t) => t.typography.fontFamilyMonospace,
                }}
              >
                {it.ex}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
