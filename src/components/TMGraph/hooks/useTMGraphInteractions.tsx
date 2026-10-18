import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type {
  Core as CyCore,
  EventObject,
  EventObjectNode,
  EventObjectEdge,
} from 'cytoscape';
import { Paper, Popper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  useGraphUI,
  type GraphAnchor as Anchor,
} from '@components/shared/GraphUIContext';
import {
  makeVirtualAnchor,
  getCytoscapeEventAnchor,
  getCytoscapeElementAnchor,
} from '@components/shared/graphAnchor';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';
import { EdgeTooltip } from '../edges/EdgeTooltip';
import { useCytoscapeClassSync } from '@components/shared/useCytoscapeClass';
import type { TMGraphNode, TMGraphEdge } from '../util/buildTMGraph';

type EdgeTooltipState = {
  id: string | null;
  anchor: Anchor | null;
  reason: 'hover' | 'select' | null;
};
type NodeHintState = {
  id: string | null;
  text: string | null;
  anchor: Anchor | null;
};

function NodeHintPopper({ hint, open }: { hint: NodeHintState; open: boolean }) {
  if (!hint.text || !hint.anchor) return null;

  return (
    <Popper
      open={open}
      anchorEl={makeVirtualAnchor(hint.anchor)}
      placement="top"
      modifiers={[
        { name: 'offset', options: { offset: [0, 8] } },
        { name: 'preventOverflow', options: { padding: 8 } },
      ]}
      sx={{ zIndex: (t) => t.zIndex.tooltip }}
      keepMounted
    >
      <Paper
        elevation={6}
        sx={{
          px: 1,
          py: 0.5,
          borderRadius: 1.25,
          bgcolor: (t) => alpha(t.palette.grey[900], 0.9),
          color: '#fff',
          fontSize: '0.75rem',
          pointerEvents: 'none',
        }}
      >
        <Typography variant="caption" sx={{ color: 'inherit' }}>
          {hint.text}
        </Typography>
      </Paper>
    </Popper>
  );
}

export function useTMGraphInteractions({
  cyRef,
  containerRef,
  edges,
  setNodes,
  containerVisible,
}: {
  cyRef: RefObject<CyCore | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  edges: TMGraphEdge[];
  setNodes: Dispatch<SetStateAction<TMGraphNode[]>>;
  containerVisible: boolean;
}) {
  const { selected, setSelected } = useGraphUI();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const edgeTooltipRef = useRef<EdgeTooltipState>({
    id: null,
    anchor: null,
    reason: null,
  });
  const nodeHintRef = useRef<NodeHintState>({ id: null, text: null, anchor: null });

  const edgeMapRef = useRef<Map<string, TMGraphEdge>>(new Map());

  const hoverTimerRef = useRef<number | null>(null);
  const suppressEdgeTooltipCloseUntilRef = useRef(0);
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipState>({
    id: null,
    anchor: null,
    reason: null,
  });
  const [nodeHint, setNodeHint] = useState<NodeHintState>({
    id: null,
    text: null,
    anchor: null,
  });

  useEffect(() => {
    edgeTooltipRef.current = edgeTooltip;
  }, [edgeTooltip]);
  useEffect(() => {
    nodeHintRef.current = nodeHint;
  }, [nodeHint]);

  useEffect(() => {
    edgeMapRef.current = new Map(edges.map((e) => [e.id, e]));
  }, [edges]);

  const setEdgeTooltipState = useCallback((next: EdgeTooltipState) => {
    edgeTooltipRef.current = next;
    setEdgeTooltip(next);
  }, []);

  const getAnchorFromEvent = useCallback(
    (event: { renderedPosition?: { x: number; y: number } }) =>
      getCytoscapeEventAnchor(containerRef.current, event),
    [containerRef]
  );
  const getAnchorFromElement = useCallback(
    (id: string) =>
      getCytoscapeElementAnchor(cyRef.current, containerRef.current, id),
    [cyRef, containerRef]
  );

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const refreshSelectedEdgeTooltipAnchor = useCallback(() => {
    const current = edgeTooltipRef.current;
    if (current.reason !== 'select' || !current.id) return;
    const anchor = getAnchorFromElement(current.id);
    if (!anchor) return;
    if (
      current.anchor &&
      Math.abs(current.anchor.top - anchor.top) < 0.5 &&
      Math.abs(current.anchor.left - anchor.left) < 0.5
    ) {
      return;
    }
    setEdgeTooltipState({ ...current, anchor });
  }, [getAnchorFromElement, setEdgeTooltipState]);

  const bindEvents = useCallback(
    (cy: CyCore) => {
      const onPaneTap = (evt: EventObject) => {
        if (evt.target !== cy) return;
        setSelected({ type: null, id: null });
        setSettingsOpen(false);
        setEdgeTooltipState({ id: null, anchor: null, reason: null });
        setNodeHint({ id: null, text: null, anchor: null });
      };

      const onNodeTap = (evt: EventObjectNode) => {
        evt.stopPropagation();
        const anchor = getAnchorFromEvent(evt);
        setSelected({ type: 'node', id: evt.target.id(), anchor });
        setEdgeTooltipState({ id: null, anchor: null, reason: null });
      };

      const onEdgeTap = (evt: EventObjectEdge) => {
        evt.stopPropagation();
        clearHoverTimer();

        const id = evt.target.id();

        const anchor = getAnchorFromEvent(evt);
        setSelected({ type: 'edge', id, anchor });
        suppressEdgeTooltipCloseUntilRef.current = Date.now() + 180;
        const next: EdgeTooltipState = { id, anchor, reason: 'select' };
        setEdgeTooltipState(next);
      };

      const onEdgeMouseOver = (evt: EventObjectEdge) => {
        const id = evt.target.id();
        evt.target.addClass('hovered');
        clearHoverTimer();

        if (edgeTooltipRef.current.reason === 'select') return;

        const anchor = getAnchorFromEvent(evt);
        hoverTimerRef.current = window.setTimeout(() => {
          setEdgeTooltipState({ id, anchor, reason: 'hover' });
        }, HOVER_POPPER_DELAY_MS);
      };

      const onEdgeMouseMove = (evt: EventObjectEdge) => {
        const current = edgeTooltipRef.current;
        if (current.reason !== 'hover' || current.id !== evt.target.id()) return;

        const base = getAnchorFromEvent(evt);
        setEdgeTooltipState({
          id: current.id,
          anchor: { top: base.top + 8, left: base.left + 8 },
          reason: 'hover',
        });
      };

      const onEdgeMouseOut = (evt: EventObjectEdge) => {
        evt.target.removeClass('hovered');
        clearHoverTimer();
        const current = edgeTooltipRef.current;
        if (current.reason === 'hover' && current.id === evt.target.id()) {
          setEdgeTooltipState({ id: null, anchor: null, reason: null });
        }
      };

      const onNodeMouseOver = (evt: EventObjectNode) => {
        const text = String(evt.target.data('rolesText') ?? '');
        if (!text) return;
        const anchor = getAnchorFromEvent(evt);
        setNodeHint({ id: evt.target.id(), text, anchor });
      };

      const onNodeMouseMove = (evt: EventObjectNode) => {
        const current = evt.target.id();
        if (nodeHintRef.current.id !== current) return;
        const anchor = getAnchorFromEvent(evt);
        setNodeHint((prev) => ({ ...prev, anchor }));
      };

      const onNodeMouseOut = (evt: EventObjectNode) => {
        if (nodeHintRef.current.id !== evt.target.id()) return;
        setNodeHint({ id: null, text: null, anchor: null });
      };

      const onViewportChanged = () => {
        refreshSelectedEdgeTooltipAnchor();
      };

      const onNodeDragFree = (evt: EventObjectNode) => {
        const id = evt.target.id();
        const pos = evt.target.position();

        setNodes((prev) =>
          prev.map((node) => {
            if (node.id !== id) return node;
            const same = node.position.x === pos.x && node.position.y === pos.y;
            return same ? node : { ...node, position: { x: pos.x, y: pos.y } };
          })
        );
      };

      cy.on('tap', onPaneTap);
      cy.on('tap', 'node', onNodeTap);
      cy.on('tap', 'edge', onEdgeTap);
      cy.on('mouseover', 'edge', onEdgeMouseOver);
      cy.on('mousemove', 'edge', onEdgeMouseMove);
      cy.on('mouseout', 'edge', onEdgeMouseOut);
      cy.on('mouseover', 'node', onNodeMouseOver);
      cy.on('mousemove', 'node', onNodeMouseMove);
      cy.on('mouseout', 'node', onNodeMouseOut);
      cy.on('dragfree', 'node', onNodeDragFree);
      cy.on('pan zoom', onViewportChanged);

      return () => {
        clearHoverTimer();
        cy.off('tap', onPaneTap);
        cy.off('tap', 'node', onNodeTap);
        cy.off('tap', 'edge', onEdgeTap);
        cy.off('mouseover', 'edge', onEdgeMouseOver);
        cy.off('mousemove', 'edge', onEdgeMouseMove);
        cy.off('mouseout', 'edge', onEdgeMouseOut);
        cy.off('mouseover', 'node', onNodeMouseOver);
        cy.off('mousemove', 'node', onNodeMouseMove);
        cy.off('mouseout', 'node', onNodeMouseOut);
        cy.off('dragfree', 'node', onNodeDragFree);
        cy.off('pan zoom', onViewportChanged);
      };
    },
    [
      clearHoverTimer,
      getAnchorFromEvent,
      refreshSelectedEdgeTooltipAnchor,
      setEdgeTooltipState,
      setSelected,
      setNodes,
    ]
  );

  const syncSelectionClass = useCytoscapeClassSync(
    cyRef,
    selected.type === 'edge' ? selected.id : null,
    'ct-selected'
  );

  useEffect(() => {
    let rafId: number | null = null;
    const scheduleRefresh = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        refreshSelectedEdgeTooltipAnchor();
      });
    };

    window.addEventListener('scroll', scheduleRefresh, true);
    window.addEventListener('resize', scheduleRefresh);
    return () => {
      window.removeEventListener('scroll', scheduleRefresh, true);
      window.removeEventListener('resize', scheduleRefresh);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [refreshSelectedEdgeTooltipAnchor]);

  const edgeTransitions = edgeTooltip.id
    ? (edgeMapRef.current.get(edgeTooltip.id)?.data?.transitions ?? [])
    : [];

  const fallbackLines = useMemo(() => {
    if (!edgeTooltip.id) return [] as string[];
    if (edgeTransitions.length > 0) return [];
    const label = edgeMapRef.current.get(edgeTooltip.id)?.label;
    if (typeof label !== 'string' || !label.trim()) return [];
    return label.split('\n').map((s) => s.trim());
  }, [edgeTooltip.id, edgeTransitions]);

  const sourceLabel = edgeTooltip.id
    ? String(edgeMapRef.current.get(edgeTooltip.id)?.source ?? '')
    : '';
  const targetLabel = edgeTooltip.id
    ? String(edgeMapRef.current.get(edgeTooltip.id)?.target ?? '')
    : '';

  const handleEdgeTooltipClose = useCallback(() => {
    if (edgeTooltipRef.current.reason === 'select') return;
    if (Date.now() < suppressEdgeTooltipCloseUntilRef.current) return;
    setSelected({ type: null, id: null });
    setEdgeTooltipState({ id: null, anchor: null, reason: null });
  }, [setSelected, setEdgeTooltipState]);

  return {
    syncSelectionClass,
    bindEvents,
    refreshSelectedEdgeTooltipAnchor,
    settingsOpen,
    setSettingsOpen,
    popovers: (
      <>
        <NodeHintPopper hint={nodeHint} open={containerVisible && !!nodeHint.text} />

        <EdgeTooltip
          open={containerVisible && !!edgeTooltip.id && !!edgeTooltip.anchor}
          anchorEl={makeVirtualAnchor(edgeTooltip.anchor)}
          edgeId={edgeTooltip.id ?? ''}
          source={sourceLabel}
          target={targetLabel}
          transitions={edgeTransitions}
          fallbackLines={fallbackLines}
          onClose={handleEdgeTooltipClose}
        />
      </>
    ),
  };
}
