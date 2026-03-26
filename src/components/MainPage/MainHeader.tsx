// src/components/MainPage/MainHeader.tsx
import {
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import ExampleMenu from '@components/MainPage/ExampleMenu';
import RecentMachinesMenu from '@components/MainPage/RecentMachinesMenu';
import { APP_TABS, type AppTab } from './appTabs';

type MainHeaderProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
};

export function MainHeader({ activeTab, onTabChange }: MainHeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (isMobile) {
    return (
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: theme.palette.primary.main,
          borderBottom: `5px solid ${theme.palette.primary.dark}`,
          color: theme.palette.primary.contrastText,
        }}
      >
        <Toolbar
          variant="dense"
          sx={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 0.75,
            py: 0.75,
          }}
        >
          <Stack
            direction="row"
            sx={{
              minHeight: 34,
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 500,
                fontSize: '1rem',
                lineHeight: 1,
                whiteSpace: 'normal',
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 32,
              }}
            >
              TuringViz
            </Typography>

            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
              <RecentMachinesMenu compact />
              <ExampleMenu compact />
            </Stack>
          </Stack>

          <Tabs
            value={activeTab}
            onChange={(_, tab: AppTab) => onTabChange(tab)}
            variant="scrollable"
            allowScrollButtonsMobile
            scrollButtons="auto"
            textColor="inherit"
            indicatorColor="secondary"
            sx={{
              minHeight: 42,
              width: '100%',
              '& .MuiTabs-indicator': {
                height: 3,
              },
              '& .MuiTabs-flexContainer': {
                alignItems: 'stretch',
              },
              '& .MuiTab-root': {
                minHeight: 42,
                px: 1.5,
                py: 0.75,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                lineHeight: 1.2,
              },
            }}
          >
            {APP_TABS.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={tab.label} />
            ))}
          </Tabs>
        </Toolbar>
      </AppBar>
    );
  }

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: theme.palette.primary.main,
        borderBottom: `5px solid ${theme.palette.primary.dark}`,
        color: theme.palette.primary.contrastText,
      }}
    >
      <Toolbar
        variant="dense"
        sx={{
          flexWrap: { xs: 'wrap', md: 'nowrap' },
          alignItems: { xs: 'stretch', md: 'center' },
          gap: { xs: 1, md: 0 },
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 0.5, md: 1.25 }}
          sx={{ minWidth: 0, flexGrow: 1, alignItems: { xs: 'stretch', md: 'center' } }}
        >
          <Typography
            variant="h5"
            sx={{
              fontWeight: 500,
              fontSize: { xs: '1.1rem', sm: '1.3rem', md: '1.5rem' },
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              minHeight: { md: 36 },
            }}
          >
            TuringViz
          </Typography>

          <Tabs
            value={activeTab}
            onChange={(_, tab: AppTab) => onTabChange(tab)}
            variant="scrollable"
            scrollButtons="auto"
            textColor="inherit"
            indicatorColor="secondary"
            sx={{
              minHeight: 46,
              alignSelf: { md: 'center' },
              '& .MuiTabs-indicator': {
                height: 3,
              },
              '& .MuiTab-root': {
                minHeight: 46,
                px: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: { xs: '0.98rem', md: '1.08rem' },
              },
            }}
          >
            {APP_TABS.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={tab.label} />
            ))}
          </Tabs>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <RecentMachinesMenu />
          <ExampleMenu />
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
