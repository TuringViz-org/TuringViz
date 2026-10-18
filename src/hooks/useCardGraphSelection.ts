import { useCallback, useState, type MouseEvent } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useGraphUI } from '@components/shared/GraphUIContext';

/** Keep clicked details and settings behavior consistent across card renderers. */
export function useCardGraphSelection() {
  const { setSelected } = useGraphUI();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const onPaneClick = useCallback(() => {
    setSelected({ type: null, id: null });
    setSettingsOpen(false);
  }, [setSelected]);
  const onNodeClick = useCallback(
    (event: MouseEvent, node: Node) => {
      event.stopPropagation();
      setSelected({
        type: 'node',
        id: node.id,
        anchor: { top: event.clientY, left: event.clientX },
      });
    },
    [setSelected]
  );
  const onEdgeClick = useCallback(
    (event: MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setSelected({
        type: 'edge',
        id: edge.id,
        anchor: { top: event.clientY, left: event.clientX },
      });
    },
    [setSelected]
  );
  return { settingsOpen, setSettingsOpen, onPaneClick, onNodeClick, onEdgeClick };
}
