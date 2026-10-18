import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
import {
  FullscreenPortals,
  type FullscreenPortalConfig,
} from '@components/MainPage/FullscreenPortals';
import { type AppTab } from '@components/MainPage/appTabs';
import { AppToaster } from '@components/MainPage/AppToaster';
import SiteFooter from '@components/Footer/SiteFooter';
import { useComputationTreeDepth, useGraphZustand } from '@zustands/GraphZustand';
import { useEditorZustand } from '@zustands/EditorZustand';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { DEFAULT_TREE_DEPTH } from '@utils/constants';
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

function useRetainedGraphPanel(visible: boolean, machineVersion: number) {
  const [mountedVersion, setMountedVersion] = useState<number | null>(null);
  useEffect(() => {
    if (visible) setMountedVersion(machineVersion);
  }, [visible, machineVersion]);
  // Keep the view for this machine; discard it when another machine is loaded.
  return visible || mountedVersion === machineVersion;
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

  const applyTreeSettings = useCallback(
    (nextTargetNodes: number, nextCompressed: boolean) => {
      setComputationTreeDepth(nextTargetNodes);
      setCompressed(nextCompressed);
    },
    [setComputationTreeDepth]
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

  const machineVersion = useGlobalZustand((s) => s.machineLoadVersion);
  const configGraphActive =
    activeTab === 'configurationGraph' ||
    configFullscreen.open ||
    configFullscreen.render;
  const treeActive =
    activeTab === 'configurationTree' ||
    treeFullscreen.open ||
    treeFullscreen.render;
  const configGraphEnabled = useRetainedGraphPanel(
    configGraphActive,
    machineVersion
  );
  const treeEnabled = useRetainedGraphPanel(treeActive, machineVersion);

  const fullscreenConfigs: FullscreenPortalConfig[] = [
    {
      id: 'tmGraph',
      title: 'Turing Machine — Fullscreen',
      open: tmFullscreen.open,
      onClose: tmFullscreen.closeFullscreen,
      render: tmFullscreen.render,
      setRender: tmFullscreen.setRender,
      fallbackRef: tmPanelRef,
      fullscreenRef: tmFullscreenRef,
      enabled: true,
      content: (
        <Suspense fallback={graphLoader}>
          <LazyTMGraphWrapper />
        </Suspense>
      ),
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
          <LazyConfigGraphWrapper active={configGraphActive} />
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
            active={treeActive}
          />
        </Suspense>
      ) : null,
    },
  ];

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
