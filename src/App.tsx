import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Button,
  CircularProgress,
  Stack,
} from '@mui/material';

import { theme } from '@theme';
import { MainHeader } from '@components/MainPage/MainHeader';
import { DashboardLayout } from '@components/MainPage/DashboardLayout';
import { RunControls } from '@components/MainPage/RunControls';
import {
  FullscreenPortals,
  type FullscreenPortalConfig,
} from '@components/MainPage/FullscreenPortals';
import { type AppTab } from '@components/MainPage/appTabs';
import { AppToaster } from '@components/MainPage/AppToaster';
import SiteFooter from '@components/Footer/SiteFooter';
import {
  useComputationTreeDepth,
  useGraphZustand,
} from '@zustands/GraphZustand';
import { useEditorZustand } from '@zustands/EditorZustand';
import {
  DEFAULT_TREE_DEPTH,
} from '@utils/constants';
import { useFullscreenState } from '@components/MainPage/hooks/useFullscreenState';
import { useGistBootstrap } from '@components/MainPage/hooks/useGistBootstrap';
import { useSharedMachineBootstrap } from '@components/MainPage/hooks/useSharedMachineBootstrap';
import {
  LazyTMGraphWrapper,
  LazyConfigGraphWrapper,
  LazyComputationTreeWrapper,
  LazyRunChoiceDialog,
} from '@components/MainPage/lazyPanels';

const graphLoader = (
  <Stack
    alignItems="center"
    justifyContent="center"
    sx={{ height: '100%' }}
    spacing={1}
  >
    <CircularProgress size={26} />
  </Stack>
);

function useDeferredPanelMount(activeTab: AppTab) {
  const [hasMountedConfigGraph, setHasMountedConfigGraph] = useState(false);
  const [hasMountedTree, setHasMountedTree] = useState(false);

  const configTabActive = activeTab === 'configurationGraph';
  const treeTabActive = activeTab === 'configurationTree';

  useEffect(() => {
    if (configTabActive) {
      setHasMountedConfigGraph(true);
    }
  }, [configTabActive]);

  useEffect(() => {
    if (treeTabActive) {
      setHasMountedTree(true);
    }
  }, [treeTabActive]);

  return {
    hasMountedConfigGraph,
    hasMountedTree,
    configTabActive,
    treeTabActive,
  };
}

export default function App() {
  const computationTreeTargetNodes = useComputationTreeDepth();
  const setComputationTreeDepth = useGraphZustand((s) => s.setComputationTreeDepth);
  const { setCode } = useEditorZustand();

  useSharedMachineBootstrap(setCode);
  useGistBootstrap(setCode);

  // Compute controls state
  const [compressed, setCompressed] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<AppTab>('input');

  // Fullscreen state
  const tmFullscreen = useFullscreenState();
  const configFullscreen = useFullscreenState();
  const treeFullscreen = useFullscreenState();

  const tmPanelRef = useRef<HTMLDivElement | null>(null);
  const tmFullscreenRef = useRef<HTMLDivElement | null>(null);
  const configPanelRef = useRef<HTMLDivElement | null>(null);
  const configFullscreenRef = useRef<HTMLDivElement | null>(null);
  const treePanelRef = useRef<HTMLDivElement | null>(null);
  const treeFullscreenRef = useRef<HTMLDivElement | null>(null);

  const { hasMountedConfigGraph, hasMountedTree, configTabActive, treeTabActive } =
    useDeferredPanelMount(activeTab);

  const applyTreeSettings = useCallback(
    (nextTargetNodes: number, nextCompressed: boolean) => {
      setComputationTreeDepth(nextTargetNodes);
      setCompressed(nextCompressed);

      // Re-render the tree in fullscreen after settings changes so sizing stays correct.
      if (treeFullscreen.open) {
        treeFullscreen.setRender(false);
        requestAnimationFrame(() => treeFullscreen.setRender(true));
      }
    },
    [setComputationTreeDepth, treeFullscreen.open, treeFullscreen.setRender]
  );

  const configComputeActions = null;

  const treeComputeActions = (
    <Button
      size="small"
      variant="contained"
      onClick={() => applyTreeSettings(DEFAULT_TREE_DEPTH, !compressed)}
      sx={{ whiteSpace: 'nowrap' }}
    >
      {compressed ? 'Uncompress Tree' : 'Compress Tree'}
    </Button>
  );

  const tmGraphEnabled =
    activeTab === 'input' ||
    activeTab === 'run' ||
    tmFullscreen.open ||
    tmFullscreen.render;

  const configGraphEnabled =
    configTabActive ||
    hasMountedConfigGraph ||
    configFullscreen.open ||
    configFullscreen.render;

  const treeEnabled =
    treeTabActive || hasMountedTree || treeFullscreen.open || treeFullscreen.render;

  const fullscreenConfigs: FullscreenPortalConfig[] = useMemo(
    () => [
      {
        id: 'tmGraph',
        title: 'Turing Machine — Fullscreen',
        open: tmFullscreen.open,
        onClose: tmFullscreen.closeFullscreen,
        render: tmFullscreen.render,
        setRender: tmFullscreen.setRender,
        fallbackRef: tmPanelRef,
        fullscreenRef: tmFullscreenRef,
        actions: <RunControls />,
        enabled: tmGraphEnabled,
        content: tmGraphEnabled ? (
          <Suspense fallback={graphLoader}>
            <LazyTMGraphWrapper />
          </Suspense>
        ) : null,
      },
      {
        id: 'configGraph',
        title: 'Configuration Graph — Fullscreen',
        open: configFullscreen.open,
        onClose: configFullscreen.closeFullscreen,
        render: configFullscreen.render,
        setRender: configFullscreen.setRender,
        fallbackRef: configPanelRef,
        fullscreenRef: configFullscreenRef,
        actions: configComputeActions,
        enabled: configGraphEnabled,
        content: configGraphEnabled ? (
          <Suspense fallback={graphLoader}>
            <LazyConfigGraphWrapper />
          </Suspense>
        ) : null,
      },
      {
        id: 'computationTree',
        title: 'Computation Tree — Fullscreen',
        open: treeFullscreen.open,
        onClose: treeFullscreen.closeFullscreen,
        render: treeFullscreen.render,
        setRender: treeFullscreen.setRender,
        fallbackRef: treePanelRef,
        fullscreenRef: treeFullscreenRef,
        actions: treeComputeActions,
        enabled: treeEnabled,
        content: treeEnabled ? (
          <Suspense fallback={graphLoader}>
            <LazyComputationTreeWrapper
              targetNodes={computationTreeTargetNodes}
              compressing={compressed}
            />
          </Suspense>
        ) : null,
      },
    ],
    [
      tmFullscreen.open,
      tmFullscreen.closeFullscreen,
      tmFullscreen.render,
      tmFullscreen.setRender,
      tmGraphEnabled,
      configFullscreen.open,
      configFullscreen.closeFullscreen,
      configFullscreen.render,
      configFullscreen.setRender,
      configGraphEnabled,
      treeFullscreen.open,
      treeFullscreen.closeFullscreen,
      treeFullscreen.render,
      treeFullscreen.setRender,
      treeEnabled,
      computationTreeTargetNodes,
      compressed,
      configComputeActions,
      treeComputeActions,
    ]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MainHeader activeTab={activeTab} onTabChange={setActiveTab} />

      <DashboardLayout
        activeTab={activeTab}
        tmPanelRef={tmPanelRef}
        configPanelRef={configPanelRef}
        treePanelRef={treePanelRef}
        tmFsOpen={tmFullscreen.open}
        configFsOpen={configFullscreen.open}
        treeFsOpen={treeFullscreen.open}
        onOpenTmFullscreen={tmFullscreen.openFullscreen}
        onOpenConfigFullscreen={configFullscreen.openFullscreen}
        onOpenTreeFullscreen={treeFullscreen.openFullscreen}
        configActions={configComputeActions}
        treeActions={treeComputeActions}
      />

      <Suspense fallback={null}>
        <LazyRunChoiceDialog />
      </Suspense>

      <FullscreenPortals items={fullscreenConfigs} />

      <SiteFooter activeTab={activeTab} />
      <AppToaster />
    </ThemeProvider>
  );
}
