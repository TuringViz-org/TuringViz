import {
  createContext,
  useContext,
  useState,
  useMemo,
  PropsWithChildren,
} from 'react';

export type GraphAnchor = { top: number; left: number };

export type GraphSelection = {
  type: 'node' | 'edge' | null;
  id: string | null;
  anchor?: GraphAnchor;
};

type GraphUIContextValue = {
  active: boolean;

  // Currently highlighted edge (on hover)
  highlightedEdgeId: string | null;
  setHighlightedEdgeId: (id: string | null) => void;

  // Currently hovered state (on node hover) for legend highlighting
  hoveredState: string | null;
  setHoveredState: (s: string | null) => void;

  // Currently selected element (node or edge)
  selected: GraphSelection;
  setSelected: (selection: GraphSelection) => void;
};

const GraphUIContext = createContext<GraphUIContextValue | null>(null);

export function GraphUIProvider({
  children,
  active = true,
}: PropsWithChildren<{ active?: boolean }>) {
  const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphSelection>({ type: null, id: null });

  const value = useMemo(
    () => ({
      active,
      highlightedEdgeId,
      setHighlightedEdgeId,
      hoveredState,
      setHoveredState,
      selected,
      setSelected,
    }),
    [active, highlightedEdgeId, hoveredState, selected]
  );

  return <GraphUIContext.Provider value={value}>{children}</GraphUIContext.Provider>;
}

export function useGraphUI() {
  const ctx = useContext(GraphUIContext);
  if (!ctx) throw new Error('useGraphUI must be used within <GraphUIProvider>');
  return ctx;
}
