// src/components/Footer/CodeBlock.tsx
import { useCallback, useState } from 'react';
import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';

type Props = {
  code: string;
  language?: 'tvm' | 'json' | 'ts' | 'tsx' | 'js' | 'css' | 'text';
  rounded?: boolean;
};

// A simple code block with copy button for the footer
export function CodeBlock({ code, language = 'text', rounded = true }: Props) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const bg =
    theme.palette.mode === 'light'
      ? theme.palette.grey[100]
      : theme.palette.grey[900];

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  }, [code]);

  return (
    <Box
      sx={{
        position: 'relative',
        bgcolor: bg,
        border: (t) => `1px solid ${t.palette.divider}`,
        borderRadius: rounded ? 2 : 0,
        fontFamily: theme.typography.fontFamilyMonospace,
        fontSize: 13,
        lineHeight: 1.6,
        pr: 5,
      }}
    >
      <Box sx={{ overflow: 'auto', borderRadius: 'inherit' }}>
        <pre style={{ margin: 0, padding: '12px 12px' }}>
          <code className={`language-${language}`}>{code}</code>
        </pre>
      </Box>

      <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
        <IconButton
          size="small"
          onClick={onCopy}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            bgcolor: (t) => t.palette.background.paper,
            border: (t) => `1px solid ${t.palette.divider}`,
            '&:hover': { bgcolor: (t) => t.palette.action.hover },
          }}
        >
          {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
