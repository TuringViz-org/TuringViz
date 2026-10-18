import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Core, EventObject, EventObjectNode, EventObjectEdge } from 'cytoscape';
import type { Node, Edge } from '@xyflow/react';
import type { ConfigNodeData, ConfigEdgeData } from '@components/ConfigGraph/types';
import { EdgeTooltip } from '@components/ConfigGraph/edges/EdgeTooltip';
import { setConfiguration } from '@tmfunctions/Running';
import { HOVER_POPPER_DELAY_MS } from '@utils/constants';
import { useGraphUI, type GraphAnchor } from './GraphUIContext';
import { useCytoscapeClassSync } from './useCytoscapeClass';
import { getPointerSnapshot, subscribePointerTracker } from './pointerTracker';
import { ConfigurationDetailPopper } from './ConfigurationDetailPopper';
import {
  getCytoscapeElementAnchor,
  getCytoscapeEventAnchor,
  makeVirtualAnchor,
} from './graphAnchor';

type DetailState = {
  id: string | null;
  anchor: GraphAnchor | null;
  reason: 'hover' | 'select' | null;
};
const EMPTY_DETAIL: DetailState = { id: null, anchor: null, reason: null };

/** Events in one pointer gesture must see preceding updates before React renders. */
function useDetailState() {
  const [state, setState] = useState(EMPTY_DETAIL);
  const ref = useRef(state);
  const update = useCallback((next: DetailState) => {
    ref.current = next;
    setState(next);
  }, []);
  return { state, ref, update };
}

/** Shared selection, hover priority and detail lifetime for Cytoscape graphs. */
export function useCytoscapeGraphInteractions({
  cyRef,
  containerRef,
  containerVisible,
  nodes,
  edges,
  pendingInteractive,
}: {
  cyRef: RefObject<Core | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  containerVisible: boolean;
  nodes: Node<ConfigNodeData>[];
  edges: Edge<ConfigEdgeData>[];
  pendingInteractive: boolean;
}) {
  const { selected, setSelected, setHoveredState } = useGraphUI();
  const nodeMapRef = useRef(new Map<string, Node<ConfigNodeData>>());
  const edgeMapRef = useRef(new Map<string, Edge<ConfigEdgeData>>());
  useEffect(() => {
    nodeMapRef.current = new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);
  useEffect(() => {
    edgeMapRef.current = new Map(edges.map((edge) => [edge.id, edge]));
  }, [edges]);

  const {
    state: nodeDetail,
    ref: nodeDetailRef,
    update: updateNodeDetail,
  } = useDetailState();
  const {
    state: edgeDetail,
    ref: edgeDetailRef,
    update: updateEdgeDetail,
  } = useDetailState();
  const hoverTimerRef = useRef<number | null>(null);
  const pointerStateRef = useRef(getPointerSnapshot());
  const selectedRef = useRef(selected);
  const visibleRef = useRef(containerVisible);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(settingsOpen);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current === null) return;
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const closeHoverDetails = useCallback(() => {
    clearHoverTimer();
    if (nodeDetailRef.current.reason === 'hover') updateNodeDetail(EMPTY_DETAIL);
    if (edgeDetailRef.current.reason === 'hover') updateEdgeDetail(EMPTY_DETAIL);
  }, [
    clearHoverTimer,
    nodeDetailRef,
    edgeDetailRef,
    updateNodeDetail,
    updateEdgeDetail,
  ]);

  useEffect(() => {
    pointerStateRef.current = getPointerSnapshot();
    return subscribePointerTracker(() => {
      const next = getPointerSnapshot();
      const previous = pointerStateRef.current;
      pointerStateRef.current = next;
      if (!previous.isDragging && next.isDragging) closeHoverDetails();
    });
  }, [closeHoverDetails]);

  const getEventAnchor = useCallback(
    (event: EventObject) => getCytoscapeEventAnchor(containerRef.current, event),
    [containerRef]
  );
  const getElementAnchor = useCallback(
    (id: string) =>
      getCytoscapeElementAnchor(cyRef.current, containerRef.current, id),
    [cyRef, containerRef]
  );
  const refreshSelectedAnchors = useCallback(() => {
    const refresh = (current: DetailState, update: (next: DetailState) => void) => {
      if (current.reason !== 'select' || !current.id) return;
      const anchor = getElementAnchor(current.id);
      if (
        !anchor ||
        (current.anchor &&
          Math.abs(current.anchor.top - anchor.top) < 0.5 &&
          Math.abs(current.anchor.left - anchor.left) < 0.5)
      )
        return;
      update({ ...current, anchor });
    };
    refresh(nodeDetailRef.current, updateNodeDetail);
    refresh(edgeDetailRef.current, updateEdgeDetail);
  }, [
    getElementAnchor,
    nodeDetailRef,
    edgeDetailRef,
    updateNodeDetail,
    updateEdgeDetail,
  ]);

  useEffect(() => {
    const becameVisible = !visibleRef.current && containerVisible;
    visibleRef.current = containerVisible;
    if (!containerVisible) closeHoverDetails();
    if (becameVisible) refreshSelectedAnchors();
  }, [containerVisible, closeHoverDetails, refreshSelectedAnchors]);

  useEffect(() => {
    clearHoverTimer();
    const detail: DetailState =
      selected.type && selected.id
        ? {
            id: selected.id,
            anchor: selected.anchor ?? getElementAnchor(selected.id),
            reason: 'select',
          }
        : EMPTY_DETAIL;
    updateNodeDetail(selected.type === 'node' ? detail : EMPTY_DETAIL);
    updateEdgeDetail(selected.type === 'edge' ? detail : EMPTY_DETAIL);
  }, [
    selected,
    clearHoverTimer,
    getElementAnchor,
    updateNodeDetail,
    updateEdgeDetail,
  ]);

  const bindEvents = useCallback(
    (cy: Core) => {
      const mayShowHover = () => !selectedRef.current.type && visibleRef.current;
      const onPaneTap = (event: EventObject) => {
        if (
          event.target !== cy ||
          !(
            selectedRef.current.type ||
            nodeDetailRef.current.id ||
            edgeDetailRef.current.id ||
            settingsOpenRef.current
          )
        )
          return;
        selectedRef.current = { type: null, id: null };
        setSelected(selectedRef.current);
        clearHoverTimer();
        setSettingsOpen(false);
        updateNodeDetail(EMPTY_DETAIL);
        updateEdgeDetail(EMPTY_DETAIL);
      };
      const select = (
        event: EventObjectNode | EventObjectEdge,
        type: 'node' | 'edge'
      ) => {
        event.stopPropagation();
        clearHoverTimer();
        const id = event.target.id();
        const anchor = getEventAnchor(event);
        selectedRef.current = { type, id, anchor };
        setSelected(selectedRef.current);
        const detail: DetailState = { id, anchor, reason: 'select' };
        updateNodeDetail(type === 'node' ? detail : EMPTY_DETAIL);
        updateEdgeDetail(type === 'edge' ? detail : EMPTY_DETAIL);
      };
      const onNodeTap = (event: EventObjectNode) => select(event, 'node');
      const onEdgeTap = (event: EventObjectEdge) => select(event, 'edge');
      const onNodeDoubleTap = (event: EventObjectNode) => {
        const config = nodeMapRef.current.get(event.target.id())?.data.config;
        if (config) setConfiguration(config);
      };
      const onNodeHoverStart = (event: EventObjectNode) => {
        if (pointerStateRef.current.isDragging) return;
        const id = event.target.id();
        event.target.addClass('hovered');
        const anchor = getEventAnchor(event);
        clearHoverTimer();
        hoverTimerRef.current = window.setTimeout(() => {
          if (mayShowHover()) updateNodeDetail({ id, anchor, reason: 'hover' });
        }, HOVER_POPPER_DELAY_MS);
        const label = nodeMapRef.current.get(id)?.data.label;
        if (label) setHoveredState(label);
      };
      const onNodeHoverEnd = (event: EventObjectNode) => {
        event.target.removeClass('hovered');
        setHoveredState(null);
        clearHoverTimer();
        const current = nodeDetailRef.current;
        if (current.reason === 'hover' && current.id === event.target.id())
          updateNodeDetail(EMPTY_DETAIL);
      };
      const onEdgeHoverStart = (event: EventObjectEdge) => {
        if (pointerStateRef.current.isDragging) return;
        event.target.addClass('hovered');
        if (mayShowHover())
          updateEdgeDetail({
            id: event.target.id(),
            anchor: getEventAnchor(event),
            reason: 'hover',
          });
      };
      const onEdgeHoverEnd = (event: EventObjectEdge) => {
        event.target.removeClass('hovered');
        const current = edgeDetailRef.current;
        if (current.reason === 'hover' && current.id === event.target.id())
          updateEdgeDetail(EMPTY_DETAIL);
      };
      cy.on('tap', onPaneTap);
      cy.on('tap', 'node', onNodeTap);
      cy.on('tap', 'edge', onEdgeTap);
      cy.on('dbltap', 'node', onNodeDoubleTap);
      cy.on('mouseover', 'node', onNodeHoverStart);
      cy.on('mouseout', 'node', onNodeHoverEnd);
      cy.on('mouseover', 'edge', onEdgeHoverStart);
      cy.on('mouseout', 'edge', onEdgeHoverEnd);
      return () => {
        cy.off('tap', onPaneTap);
        cy.off('tap', 'node', onNodeTap);
        cy.off('tap', 'edge', onEdgeTap);
        cy.off('dbltap', 'node', onNodeDoubleTap);
        cy.off('mouseover', 'node', onNodeHoverStart);
        cy.off('mouseout', 'node', onNodeHoverEnd);
        cy.off('mouseover', 'edge', onEdgeHoverStart);
        cy.off('mouseout', 'edge', onEdgeHoverEnd);
        clearHoverTimer();
      };
    },
    [
      clearHoverTimer,
      getEventAnchor,
      nodeDetailRef,
      edgeDetailRef,
      setSelected,
      setHoveredState,
      updateNodeDetail,
      updateEdgeDetail,
    ]
  );

  const syncSelectionClass = useCytoscapeClassSync(
    cyRef,
    selected.type ? selected.id : null,
    'ct-selected'
  );

  useEffect(() => {
    let frame: number | null = null;
    const scheduleRefresh = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        refreshSelectedAnchors();
      });
    };
    window.addEventListener('scroll', scheduleRefresh, true);
    window.addEventListener('resize', scheduleRefresh);
    return () => {
      window.removeEventListener('scroll', scheduleRefresh, true);
      window.removeEventListener('resize', scheduleRefresh);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [refreshSelectedAnchors]);

  const node = nodeDetail.id ? nodeMapRef.current.get(nodeDetail.id) : undefined;
  const edge = edgeDetail.id ? edgeMapRef.current.get(edgeDetail.id) : undefined;
  return {
    bindEvents,
    syncSelectionClass,
    refreshSelectedAnchors,
    settingsOpen,
    setSettingsOpen,
    popovers: (
      <>
        <ConfigurationDetailPopper
          config={node?.data.config}
          computed={node?.data.isComputed}
          anchor={nodeDetail.anchor}
          open={containerVisible && !!nodeDetail.id && !!nodeDetail.anchor}
          pendingInteractive={pendingInteractive}
          onClose={() => {
            setSelected({ type: null, id: null });
            updateNodeDetail(EMPTY_DETAIL);
          }}
        />
        <EdgeTooltip
          open={containerVisible && !!edgeDetail.id && !!edgeDetail.anchor}
          anchorEl={makeVirtualAnchor(edgeDetail.anchor)}
          transition={edge?.data?.transition}
          isCompressed={edge?.data?.compressed === true}
          compressedLength={edge?.data?.compressedLength}
          sourceLabel={nodeMapRef.current.get(edge?.source ?? '')?.data.label}
          targetLabel={nodeMapRef.current.get(edge?.target ?? '')?.data.label}
          onClose={() => {
            setSelected({ type: null, id: null });
            updateEdgeDetail(EMPTY_DETAIL);
          }}
        />
      </>
    ),
  };
}
