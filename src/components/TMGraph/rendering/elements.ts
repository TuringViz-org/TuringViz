import type { Theme } from '@mui/material/styles';
import type { TMGraphNode, TMGraphEdge } from '../util/buildTMGraph';
import type { CytoscapeElement } from '@components/shared/cytoscapeElements';
import { normalizeColor } from '@components/shared/stateColors';
import { STATE_NODE_DIAMETER } from '../util/constants';

function getNodeRoles(
  label: string,
  isStart: boolean,
  isCurrent: boolean,
  isLast: boolean
) {
  const roles: string[] = [];
  if (isStart) roles.push('Start state');
  if (isCurrent) roles.push('Current state');
  if (isLast) roles.push('Last state');

  const l = label.toLowerCase();
  if (['done', 'accept', 'accepted'].includes(l)) roles.push('Accepting state');
  if (['error', 'reject', 'rejected'].includes(l)) roles.push('Rejecting state');

  return roles;
}

/** Translate machine state into Cytoscape data without changing graph geometry. */
export function buildTMCytoscapeElements(
  nodes: TMGraphNode[],
  edges: TMGraphEdge[],
  theme: Theme
): CytoscapeElement[] {
  const cyNodes = nodes.map((n): CytoscapeElement => {
    const data = n.data;
    const label = String(data.label ?? n.id);
    const isStart = Boolean(data.isStart);
    const isCurrent = Boolean(data.isCurrent);
    const isLast = Boolean(data.isLast);

    const roles = getNodeRoles(label, isStart, isCurrent, isLast);

    const borderColor = isCurrent
      ? normalizeColor(theme.palette.primary.main)
      : isLast
        ? normalizeColor(theme.palette.accent.light)
        : normalizeColor(theme.palette.border.main);

    const isAccepting = ['done', 'accept', 'accepted'].includes(label.toLowerCase());
    const isRejecting = ['error', 'reject', 'rejected'].includes(
      label.toLowerCase()
    );

    const stateStatusColor = isAccepting
      ? normalizeColor(theme.palette.success.light)
      : isRejecting
        ? normalizeColor(theme.palette.error.light)
        : undefined;

    const bgColor =
      isCurrent && stateStatusColor
        ? stateStatusColor
        : isCurrent || isLast
          ? normalizeColor(theme.palette.background.paper)
          : (stateStatusColor ?? normalizeColor(theme.palette.background.paper));

    const classes = ['node'];
    if (isStart) classes.push('start');
    if (isCurrent) classes.push('current');
    if (isLast) classes.push('last');

    const cyData = {
      id: n.id,
      label,
      rolesText: roles.join(' · '),
      bgColor,
      borderColor,
      borderWidth: 3,
      width: n.width ?? STATE_NODE_DIAMETER,
      height: n.height ?? STATE_NODE_DIAMETER,
    };

    const position = n.position ?? { x: 0, y: 0 };

    return { group: 'nodes', data: cyData, position, classes: classes.join(' ') };
  });
  const cyEdges = edges.map((e): CytoscapeElement => {
    const data = e.data;
    const isLoop = e.source === e.target;
    const bended = data?.bended === true;

    const classes = ['edge'];
    if (isLoop) classes.push('loop');
    if (bended) classes.push('bended');

    const cyData = {
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : '',
      transitions: data?.transitions ?? [],
      // Use one positive distance for both directions: Cytoscape flips side for reverse direction.
      curveDistance: bended ? 34 : 0,
    };

    return { group: 'edges', data: cyData, classes: classes.join(' ') };
  });
  return [...cyNodes, ...cyEdges];
}
