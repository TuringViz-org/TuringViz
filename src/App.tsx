import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Button,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
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
  MAX_COMPUTATION_TREE_TARGET_NODES,
  MIN_CONFIG_GRAPH_TARGET_NODES,
  MAX_CONFIG_GRAPH_TARGET_NODES,
  CARDS_CONFIRM_THRESHOLD,
  ConfigNodeMode,
} from '@utils/constants';
import { recomputeConfigGraphWithTargetNodes } from '@tmfunctions/ConfigGraph';
import { useFullscreenState } from '@components/MainPage/hooks/useFullscreenState';
import { useGistBootstrap } from '@components/MainPage/hooks/useGistBootstrap';
import { useSharedMachineBootstrap } from '@components/MainPage/hooks/useSharedMachineBootstrap';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { getStartConfiguration } from '@tmfunctions/Configurations';
import { computeComputationTreeInWorker } from '@utils/graphWorkerClient';
import { CARDS_LIMIT } from '@components/ComputationTree/util/constants';
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
  return Math.min(
    MAX_CONFIG_GRAPH_TARGET_NODES,
    Math.max(MIN_CONFIG_GRAPH_TARGET_NODES, Math.floor(value))
  );
}

function sanitizeTreeTargetNodes(value: number): number {
  return Math.min(
    MAX_COMPUTATION_TREE_TARGET_NODES,
    Math.max(MIN_COMPUTATION_TREE_TARGET_NODES, Math.floor(value))
  );
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
  const computationTreeNodeMode = useGraphZustand((s) => s.computationTreeNodeMode);
  const { setCode } = useEditorZustand();
  const transitions = useGlobalZustand((s) => s.transitions);
  const blank = useGlobalZustand((s) => s.blank);
  const numberOfTapes = useGlobalZustand((s) => s.numberOfTapes);

  useSharedMachineBootstrap(setCode);
  useGistBootstrap(setCode);

  // Dialog state
  const [computeOpen, setComputeOpen] = useState(false);
  const [pendingTreeTargetNodes, setPendingTreeTargetNodes] =
    useState<number>(DEFAULT_TREE_DEPTH);
  const [pendingCompressed, setPendingCompressed] = useState<boolean>(false);
  const [compressed, setCompressed] = useState<boolean>(false);
  const [computeTreeChecking, setComputeTreeChecking] = useState(false);
  const [confirmTreeCardsOpen, setConfirmTreeCardsOpen] = useState(false);
  const [pendingTreeCardsCount, setPendingTreeCardsCount] = useState(0);
  const [cardsLimitDialogOpen, setCardsLimitDialogOpen] = useState(false);
  const [cardsLimitDialogCount, setCardsLimitDialogCount] = useState(0);
  const [queuedTreeSettings, setQueuedTreeSettings] = useState<{
    targetNodes: number;
    compressed: boolean;
  } | null>(null);

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

  const applyTreeSettings = useCallback(
    (nextTargetNodes: number, nextCompressed: boolean) => {
      setComputationTreeDepth(nextTargetNodes);
      setCompressed(nextCompressed);
      setComputeOpen(false);

      // Re-render the tree in fullscreen after settings changes so sizing stays correct.
      if (treeFullscreen.open) {
        treeFullscreen.setRender(false);
        requestAnimationFrame(() => treeFullscreen.setRender(true));
      }
    },
    [setComputationTreeDepth, treeFullscreen.open, treeFullscreen.setRender]
  );

  const handleComputeConfirm = useCallback(async () => {
    const safeTargetNodes = sanitizeTreeTargetNodes(pendingTreeTargetNodes);
    const nextCompressed = pendingCompressed;
    const changed =
      safeTargetNodes !== computationTreeTargetNodes || nextCompressed !== compressed;

    if (!changed) {
      setComputeOpen(false);
      return;
    }

    if (computationTreeNodeMode !== ConfigNodeMode.CARDS) {
      applyTreeSettings(safeTargetNodes, nextCompressed);
      return;
    }

    setComputeTreeChecking(true);
    try {
      const startConfig = getStartConfiguration();
      const effectiveDepth = nextCompressed
        ? MAX_COMPUTATION_TREE_TARGET_NODES
        : safeTargetNodes;

      const nextTree = await computeComputationTreeInWorker({
        depth: effectiveDepth,
        targetNodes: safeTargetNodes,
        compressing: nextCompressed,
        transitions,
        numberOfTapes,
        blank,
        startConfig,
      });

      const nextNodeCount = nextTree.nodes.length;
      if (nextNodeCount > CARDS_LIMIT) {
        setCardsLimitDialogCount(nextNodeCount);
        setCardsLimitDialogOpen(true);
        return;
      }

      if (nextNodeCount > CARDS_CONFIRM_THRESHOLD) {
        setQueuedTreeSettings({
          targetNodes: safeTargetNodes,
          compressed: nextCompressed,
        });
        setPendingTreeCardsCount(nextNodeCount);
        setComputeOpen(false);
        setConfirmTreeCardsOpen(true);
        return;
      }

      applyTreeSettings(safeTargetNodes, nextCompressed);
    } catch {
      applyTreeSettings(safeTargetNodes, nextCompressed);
    } finally {
      setComputeTreeChecking(false);
    }
  }, [
    pendingTreeTargetNodes,
    pendingCompressed,
    computationTreeTargetNodes,
    compressed,
    computationTreeNodeMode,
    transitions,
    numberOfTapes,
    blank,
    applyTreeSettings,
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
        title: 'Computation Tree — Fullscreen',
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
        confirming={computeTreeChecking}
        onTargetNodesChange={setPendingTreeTargetNodes}
        onCompressedChange={setPendingCompressed}
        onClose={() => {
          if (computeTreeChecking) return;
          setComputeOpen(false);
        }}
        onConfirm={handleComputeConfirm}
      />

      <Dialog
        open={confirmTreeCardsOpen}
        onClose={() => {
          setConfirmTreeCardsOpen(false);
          setQueuedTreeSettings(null);
        }}
      >
        <DialogTitle>Switch to card view?</DialogTitle>
        <DialogContent>
          Card view can be slow for trees above {CARDS_CONFIRM_THRESHOLD} nodes
          (current: {pendingTreeCardsCount}). Continue?
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirmTreeCardsOpen(false);
              setQueuedTreeSettings(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (queuedTreeSettings) {
                applyTreeSettings(
                  queuedTreeSettings.targetNodes,
                  queuedTreeSettings.compressed
                );
              }
              setConfirmTreeCardsOpen(false);
              setQueuedTreeSettings(null);
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={cardsLimitDialogOpen}
        onClose={() => setCardsLimitDialogOpen(false)}
        sx={{ zIndex: 3200 }}
      >
        <DialogTitle>Card view not available</DialogTitle>
        <DialogContent>
          Cards are disabled when there are more than {CARDS_LIMIT} nodes
          (current: {cardsLimitDialogCount}).
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCardsLimitDialogOpen(false)} variant="contained">
            OK
          </Button>
        </DialogActions>
      </Dialog>

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
