import { lazy, Suspense, useEffect, useState, type MutableRefObject } from 'react';
import {
  Container,
  Tooltip,
  IconButton,
  Button,
  Box,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import type { Theme } from '@mui/material/styles';

import { PanelCard } from '@components/MainPage/PanelCard';
import styles from '../../App.module.css';
import type { AppTab } from './appTabs';

const LazyTapeList = lazy(() => import('@components/TapeList/TapeList'));
const LazyCodeEditor = lazy(() => import('@components/CodeEditor/CodeEditor'));

type DashboardLayoutProps = {
  activeTab: AppTab;
  tmPanelRef: MutableRefObject<HTMLDivElement | null>;
  configPanelRef: MutableRefObject<HTMLDivElement | null>;
  treePanelRef: MutableRefObject<HTMLDivElement | null>;
  tmFsOpen: boolean;
  configFsOpen: boolean;
  treeFsOpen: boolean;
  onOpenTmFullscreen: () => void;
  onOpenConfigFullscreen: () => void;
  onOpenTreeFullscreen: () => void;
  onOpenComputeConfigGraph: () => void;
  onOpenCompute: () => void;
};

type LayoutMode = {
  gridTemplateColumns: { xs: string; md: string };
  gridTemplateAreas: { xs: string; md: string };
};

const TAB_LAYOUTS: Record<AppTab, LayoutMode> = {
  input: {
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
    gridTemplateAreas: { xs: '"tm" "editor"', md: '"tm editor"' },
  },
  run: {
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
    gridTemplateAreas: { xs: '"tm" "tapes"', md: '"tm tapes"' },
  },
  configurationGraph: {
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr)' },
    gridTemplateAreas: { xs: '"config"', md: '"config"' },
  },
  configurationTree: {
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr)' },
    gridTemplateAreas: { xs: '"tree"', md: '"tree"' },
  },
};

const graphPanelMinHeight = { xs: 460, sm: 540, md: 680 };
const fullscreenButtonSx = {
  border: '1px solid',
  borderColor: (theme: Theme) => theme.palette.divider,
  bgcolor: (theme: Theme) => theme.palette.background.paper,
  '&:hover': { bgcolor: (theme: Theme) => theme.palette.action.hover },
};

function PanelLoadingFallback({ label }: { label: string }) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }} spacing={1}>
      <CircularProgress size={22} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

function FullscreenButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip title="Open Fullscreen">
      <IconButton size="small" onClick={onClick} sx={fullscreenButtonSx}>
        <OpenInFullIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

export function DashboardLayout({
  activeTab,
  tmPanelRef,
  configPanelRef,
  treePanelRef,
  tmFsOpen,
  configFsOpen,
  treeFsOpen,
  onOpenTmFullscreen,
  onOpenConfigFullscreen,
  onOpenTreeFullscreen,
  onOpenComputeConfigGraph,
  onOpenCompute,
}: DashboardLayoutProps) {
  const layout = TAB_LAYOUTS[activeTab];

  const tmVisible = activeTab === 'input' || activeTab === 'run';
  const editorVisible = activeTab === 'input';
  const tapesVisible = activeTab === 'run';
  const configVisible = activeTab === 'configurationGraph';
  const treeVisible = activeTab === 'configurationTree';
  const [editorMounted, setEditorMounted] = useState(editorVisible);
  const [tapesMounted, setTapesMounted] = useState(false);

  useEffect(() => {
    if (editorVisible) {
      setEditorMounted(true);
    }
  }, [editorVisible]);

  useEffect(() => {
    if (tapesVisible) {
      setTapesMounted(true);
    }
  }, [tapesVisible]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTab]);

  return (
    <Container
      maxWidth={false}
      sx={{
        px: { xs: 1.5, sm: 2, lg: 3 },
        pt: { xs: 1.5, md: 2 },
        pb: 0,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          width: '100%',
          gap: { xs: 1.25, md: 2 },
          minHeight: { xs: 'calc(100vh - 180px)', md: 'calc(100vh - 190px)' },
          gridTemplateColumns: layout.gridTemplateColumns,
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateAreas: layout.gridTemplateAreas,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            gridArea: 'tm',
            minWidth: 0,
            minHeight: 0,
            display: tmVisible ? 'flex' : 'none',
            flexDirection: 'column',
            '& > *': { flex: 1, minWidth: 0, minHeight: 0 },
          }}
        >
          <PanelCard
            title="Turing Machine"
            minHeight={graphPanelMinHeight}
            actions={<FullscreenButton onClick={onOpenTmFullscreen} />}
          >
            <div
              ref={tmPanelRef}
              className={`${styles.portal_mount} ${tmFsOpen ? styles.portal_hidden : ''}`}
            />
          </PanelCard>
        </Box>

        <Box
          sx={{
            gridArea: 'editor',
            minWidth: 0,
            minHeight: 0,
            display: editorVisible ? 'flex' : 'none',
            flexDirection: 'column',
            '& > *': { flex: 1, minWidth: 0, minHeight: 0 },
          }}
        >
          <PanelCard title="Editor" minHeight={graphPanelMinHeight} hideHeader>
            <Suspense fallback={<PanelLoadingFallback label="Loading editor..." />}>
              {editorMounted ? <LazyCodeEditor /> : null}
            </Suspense>
          </PanelCard>
        </Box>

        <Box
          sx={{
            gridArea: 'tapes',
            minWidth: 0,
            minHeight: 0,
            display: tapesVisible ? 'flex' : 'none',
            flexDirection: 'column',
            justifyContent: { md: 'center' },
            '& > *': { minWidth: 0 },
          }}
        >
          <PanelCard title="Tapes" denseBodyPadding fillHeight={false}>
            <Suspense fallback={<PanelLoadingFallback label="Loading tapes..." />}>
              {tapesMounted ? <LazyTapeList /> : null}
            </Suspense>
          </PanelCard>
        </Box>

        <Box
          sx={{
            gridArea: 'config',
            minWidth: 0,
            minHeight: 0,
            display: configVisible ? 'flex' : 'none',
            flexDirection: 'column',
            '& > *': { flex: 1, minWidth: 0, minHeight: 0 },
          }}
        >
          <PanelCard
            title="Configuration Graph"
            minHeight={graphPanelMinHeight}
            actions={
              <>
                <Button size="small" variant="contained" onClick={onOpenComputeConfigGraph}>
                  Compute Graph
                </Button>
                <FullscreenButton onClick={onOpenConfigFullscreen} />
              </>
            }
          >
            <div
              ref={configPanelRef}
              className={`${styles.portal_mount} ${
                configFsOpen ? styles.portal_hidden : ''
              }`}
            />
          </PanelCard>
        </Box>

        <Box
          sx={{
            gridArea: 'tree',
            minWidth: 0,
            minHeight: 0,
            display: treeVisible ? 'flex' : 'none',
            flexDirection: 'column',
            '& > *': { flex: 1, minWidth: 0, minHeight: 0 },
          }}
        >
          <PanelCard
            title="Configuration Tree"
            minHeight={graphPanelMinHeight}
            actions={
              <>
                <Button size="small" variant="contained" onClick={onOpenCompute}>
                  Compute Tree
                </Button>
                <FullscreenButton onClick={onOpenTreeFullscreen} />
              </>
            }
          >
            <div
              ref={treePanelRef}
              className={`${styles.portal_mount} ${treeFsOpen ? styles.portal_hidden : ''}`}
            />
          </PanelCard>
        </Box>
      </Box>
    </Container>
  );
}
