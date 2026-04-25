// src/theme/index.tsx
import { createTheme } from '@mui/material/styles';
import { grey } from '@mui/material/colors';

import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/600.css';

const sansStack = `'Roboto', system-ui, Avenir, Helvetica, Arial, sans-serif`;
const monoStack =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export const theme = createTheme({
  typography: {
    fontFamily: sansStack,
    fontFamilyMonospace: monoStack,
    h1: { fontWeight: 600 },
    h2: { fontWeight: 600 },
    h6: { fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  palette: {
    mode: 'light',
    primary: {
      light: '#6ea7db',
      main: '#4885c4',
      dark: '#2f5d8d',
      contrastText: '#fff',
    },
    secondary: {
      light: '#e8b6d9',
      main: '#dd97c8',
      dark: '#a76495',
      contrastText: '#fff',
    },
    accent: {
      light: '#e5989b',
      main: '#d06e73',
      dark: '#9a4449',
      contrastText: '#fff',
    },
    success: {
      light: '#00ff00ff',
      main: '#00e600ff',
      dark: '#047857',
      contrastText: '#fff',
    },
    border: { main: grey.A400, dark: grey[600] },
    error: {
      main: '#f94952ff',
      light: '#ff0000ff',
      dark: '#95242aff',
      contrastText: '#fff',
    },
    background: { default: '#f8f9fc', paper: '#fff' },
    node: { currentConfig: '#fcc600ff', selectableConfig: '#f30000ff' },
  },
});
