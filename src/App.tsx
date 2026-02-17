import { useEffect, useRef, useState } from 'react';
import { ThemeProvider, CssBaseline, Button } from '@mui/material';
import { toast } from 'sonner';
import { theme } from '@theme';
import { MainHeader } from '@components/MainPage/MainHeader';
import { DashboardLayout } from '@components/MainPage/DashboardLayout';
import { RunControls } from '@components/MainPage/RunControls';
import { ComputeTreeDialog } from '@components/MainPage/ComputeTreeDialog';
import { RunChoiceDialog } from '@components/MainPage/RunChoiceDialog';
import {
  FullscreenPortals,
  type FullscreenPortalConfig,
} from '@components/MainPage/FullscreenPortals';
import { type AppTab } from '@components/MainPage/appTabs';
import { AppToaster } from '@components/MainPage/AppToaster';
import { TMGraphWrapper } from '@components/TMGraph/TMGraph';
import { ConfigGraphWrapper } from '@components/ConfigGraph/ConfigGraph';
import { ComputationTreeWrapper } from '@components/ComputationTree/ComputationTree';
import SiteFooter from '@components/Footer/SiteFooter';
import { useComputationTreeDepth, useGraphZustand } from '@zustands/GraphZustand';
import { useEditorZustand } from '@zustands/EditorZustand';
import { DEFAULT_TREE_DEPTH } from '@utils/constants';
import { extractGistId, fetchGistContent } from '@utils/gist';

export default function App() {
  // Graph Zustand state and setters
  const computationTreeDepth = useComputationTreeDepth();
  const setComputationTreeDepth = useGraphZustand((s) => s.setComputationTreeDepth);
  const { setCode } = useEditorZustand();
  const gistInitRef = useRef(false);

  // Local state for dialogs and fullscreen
  const [computeOpen, setComputeOpen] = useState(false);
  const [pendingDepth, setPendingDepth] = useState<number>(DEFAULT_TREE_DEPTH);
  const [pendingCompressed, setPendingCompressed] = useState<boolean>(false);
  const [compressed, setCompressed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<AppTab>('input');

  // Fullscreen states
  const [tmFsOpen, setTmFsOpen] = useState(false);
  const [tmFsRender, setTmFsRender] = useState(false);

  const [configFsOpen, setConfigFsOpen] = useState(false);
  const [configFsRender, setConfigFsRender] = useState(false);

  const [treeFsOpen, setTreeFsOpen] = useState(false);
  const [treeFsRender, setTreeFsRender] = useState(false);

  // Refs for panels and fullscreen containers
  const tmPanelRef = useRef<HTMLDivElement | null>(null);
  const tmFullscreenRef = useRef<HTMLDivElement | null>(null);
  const configPanelRef = useRef<HTMLDivElement | null>(null);
  const configFullscreenRef = useRef<HTMLDivElement | null>(null);
  const treePanelRef = useRef<HTMLDivElement | null>(null);
  const treeFullscreenRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (gistInitRef.current) return;
    gistInitRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const gistParam = params.get('gist');
    if (!gistParam) return;

    const gistId = extractGistId(gistParam);
    if (!gistId) {
      toast.warning('Invalid gist parameter.');
      return;
    }

    const fileName = params.get('file') ?? undefined;
    const controller = new AbortController();
    const isAbortError = (error: unknown): boolean =>
      error instanceof DOMException && error.name === 'AbortError';

    const load = async () => {
      try {
        const content = await fetchGistContent(gistId, {
          fileName,
          signal: controller.signal,
        });
        setCode(content, true);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        console.error('Failed to load gist:', error);
        toast.warning('Failed to load gist. Check the ID and try again.');
      }
    };

    void load();

    return () => controller.abort();
  }, [setCode]);

  // Handlers for opening/closing "Compute Tree" dialog
  const openCompute = () => {
    setPendingDepth(computationTreeDepth);
    setPendingCompressed(compressed);
    setComputeOpen(true);
  };
  const closeCompute = () => setComputeOpen(false);

  // Handler for computing the tree with selected options
  const handleComputeConfirm = () => {
    setComputationTreeDepth(pendingDepth);
    setCompressed(pendingCompressed);
    setComputeOpen(false);

    if (treeFsOpen) {
      setTreeFsRender(false);
      requestAnimationFrame(() => setTreeFsRender(true));
    }
  };

  const runControls = <RunControls />;
  const treeFullscreenActions = (
    <Button size="small" variant="contained" onClick={openCompute}>
      Compute Tree
    </Button>
  );

  // Configuration for all fullscreen portals
  const fullscreenConfigs: FullscreenPortalConfig[] = [
    {
      id: 'tmGraph',
      title: 'Turing Machine — Fullscreen',
      open: tmFsOpen,
      onClose: () => setTmFsOpen(false),
      render: tmFsRender,
      setRender: setTmFsRender,
      fallbackRef: tmPanelRef,
      fullscreenRef: tmFullscreenRef,
      actions: runControls,
      content: <TMGraphWrapper />,
    },
    {
      id: 'configGraph',
      title: 'Configuration Graph — Fullscreen',
      open: configFsOpen,
      onClose: () => setConfigFsOpen(false),
      render: configFsRender,
      setRender: setConfigFsRender,
      fallbackRef: configPanelRef,
      fullscreenRef: configFullscreenRef,
      content: <ConfigGraphWrapper />,
    },
    {
      id: 'computationTree',
      title: 'Configuration Tree — Fullscreen',
      open: treeFsOpen,
      onClose: () => setTreeFsOpen(false),
      render: treeFsRender,
      setRender: setTreeFsRender,
      fallbackRef: treePanelRef,
      fullscreenRef: treeFullscreenRef,
      actions: treeFullscreenActions,
      content: (
        <ComputationTreeWrapper
          depth={computationTreeDepth}
          compressing={compressed}
        />
      ),
    },
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MainHeader activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Display graph panels */}
      <DashboardLayout
        activeTab={activeTab}
        tmPanelRef={tmPanelRef}
        configPanelRef={configPanelRef}
        treePanelRef={treePanelRef}
        tmFsOpen={tmFsOpen}
        configFsOpen={configFsOpen}
        treeFsOpen={treeFsOpen}
        onOpenTmFullscreen={() => setTmFsOpen(true)}
        onOpenConfigFullscreen={() => setConfigFsOpen(true)}
        onOpenTreeFullscreen={() => setTreeFsOpen(true)}
        onOpenCompute={openCompute}
      />

      <ComputeTreeDialog
        open={computeOpen}
        depth={pendingDepth}
        compressed={pendingCompressed}
        onDepthChange={setPendingDepth}
        onCompressedChange={setPendingCompressed}
        onClose={closeCompute}
        onConfirm={handleComputeConfirm}
      />
      <RunChoiceDialog />

      {/* Fullscreen portals for graphs */}
      <FullscreenPortals items={fullscreenConfigs} />

      <SiteFooter activeTab={activeTab} />
      <AppToaster />
    </ThemeProvider>
  );
}
