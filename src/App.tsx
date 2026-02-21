import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, CssBaseline, Button, CircularProgress, Stack } from '@mui/material';
import { toast } from 'sonner';

import { theme } from '@theme';
import { MainHeader } from '@components/MainPage/MainHeader';
import { DashboardLayout } from '@components/MainPage/DashboardLayout';
import { RunControls } from '@components/MainPage/RunControls';
import { ComputeTreeDialog } from '@components/MainPage/ComputeTreeDialog';
import { ComputeConfigGraphDialog } from '@components/MainPage/ComputeConfigGraphDialog';
import {
  FullscreenPortals,
  type FullscreenPortalConfig,
} from '@components/MainPage/FullscreenPortals';
import { type AppTab } from '@components/MainPage/appTabs';
import { AppToaster } from '@components/MainPage/AppToaster';
import SiteFooter from '@components/Footer/SiteFooter';
import {
  useComputationTreeDepth,
  useConfigGraphTargetNodes,
  useGraphZustand,
} from '@zustands/GraphZustand';
import { useEditorZustand } from '@zustands/EditorZustand';
import {
  DEFAULT_TREE_DEPTH,
  MIN_COMPUTATION_TREE_TARGET_NODES,
  MIN_CONFIG_GRAPH_TARGET_NODES,
} from '@utils/constants';
import { recomputeConfigGraphWithTargetNodes } from '@tmfunctions/ConfigGraph';
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
  <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }} spacing={1}>
    <CircularProgress size={26} />
  </Stack>
);

function sanitizeTargetNodes(value: number): number {
  return Math.max(MIN_CONFIG_GRAPH_TARGET_NODES, Math.floor(value));
}

function sanitizeTreeTargetNodes(value: number): number {
  return Math.max(MIN_COMPUTATION_TREE_TARGET_NODES, Math.floor(value));
}

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
  const configGraphTargetNodes = useConfigGraphTargetNodes();
  const setComputationTreeDepth = useGraphZustand((s) => s.setComputationTreeDepth);
  const setConfigGraphTargetNodes = useGraphZustand(
    (s) => s.setConfigGraphTargetNodes
  );
  const { setCode } = useEditorZustand();

  useSharedMachineBootstrap(setCode);
  useGistBootstrap(setCode);

  // Dialog state
  const [computeOpen, setComputeOpen] = useState(false);
  const [pendingTreeTargetNodes, setPendingTreeTargetNodes] =
    useState<number>(DEFAULT_TREE_DEPTH);
  const [pendingCompressed, setPendingCompressed] = useState<boolean>(false);
  const [compressed, setCompressed] = useState<boolean>(false);

  const [computeConfigOpen, setComputeConfigOpen] = useState(false);
  const [pendingConfigTargetNodes, setPendingConfigTargetNodes] =
    useState<number>(configGraphTargetNodes);

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

  const openCompute = useCallback(() => {
    setPendingTreeTargetNodes(computationTreeTargetNodes);
    setPendingCompressed(compressed);
    setComputeOpen(true);
  }, [computationTreeTargetNodes, compressed]);

  const handleComputeConfirm = useCallback(() => {
    setComputationTreeDepth(sanitizeTreeTargetNodes(pendingTreeTargetNodes));
    setCompressed(pendingCompressed);
    setComputeOpen(false);

    // Re-render the tree in fullscreen after settings changes so sizing stays correct.
    if (treeFullscreen.open) {
      treeFullscreen.setRender(false);
      requestAnimationFrame(() => treeFullscreen.setRender(true));
    }
  }, [
    pendingTreeTargetNodes,
    pendingCompressed,
    setComputationTreeDepth,
    treeFullscreen.open,
    treeFullscreen.setRender,
  ]);

  const openComputeConfigGraph = useCallback(() => {
    setPendingConfigTargetNodes(configGraphTargetNodes);
    setComputeConfigOpen(true);
  }, [configGraphTargetNodes]);

  const handleComputeConfigConfirm = useCallback(async () => {
    const safeTargetNodes = sanitizeTargetNodes(pendingConfigTargetNodes);

    setConfigGraphTargetNodes(safeTargetNodes);
    setComputeConfigOpen(false);

    const ok = await recomputeConfigGraphWithTargetNodes(safeTargetNodes);
    if (!ok) {
      toast.warning(
        'Could not compute configuration graph. Please make sure a machine is loaded.'
      );
    }
  }, [pendingConfigTargetNodes, setConfigGraphTargetNodes]);

  // Keep TM graph mounted to preserve viewport and selection state across tabs.
  const tmGraphEnabled = true;

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
        actions: (
          <Button size="small" variant="contained" onClick={openComputeConfigGraph}>
            Compute Graph
          </Button>
        ),
        enabled: configGraphEnabled,
        content: configGraphEnabled ? (
          <Suspense fallback={graphLoader}>
            <LazyConfigGraphWrapper />
          </Suspense>
        ) : null,
      },
      {
        id: 'computationTree',
        title: 'Configuration Tree — Fullscreen',
        open: treeFullscreen.open,
        onClose: treeFullscreen.closeFullscreen,
        render: treeFullscreen.render,
        setRender: treeFullscreen.setRender,
        fallbackRef: treePanelRef,
        fullscreenRef: treeFullscreenRef,
        actions: (
          <Button size="small" variant="contained" onClick={openCompute}>
            Compute Tree
          </Button>
        ),
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
      openCompute,
      openComputeConfigGraph,
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
        onOpenComputeConfigGraph={openComputeConfigGraph}
        onOpenCompute={openCompute}
      />

      <ComputeTreeDialog
        open={computeOpen}
        targetNodes={pendingTreeTargetNodes}
        compressed={pendingCompressed}
        onTargetNodesChange={setPendingTreeTargetNodes}
        onCompressedChange={setPendingCompressed}
        onClose={() => setComputeOpen(false)}
        onConfirm={handleComputeConfirm}
      />

      <ComputeConfigGraphDialog
        open={computeConfigOpen}
        targetNodes={pendingConfigTargetNodes}
        onTargetNodesChange={setPendingConfigTargetNodes}
        onClose={() => setComputeConfigOpen(false)}
        onConfirm={() => {
          void handleComputeConfigConfirm();
        }}
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
