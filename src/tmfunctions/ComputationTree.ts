// src/tmfunctions/ComputationTree.ts
import Denque from 'denque';
import { Configuration, Transition } from '@mytypes/TMTypes';
import {
  nextConfigurations,
  getStartConfiguration,
} from '@tmfunctions/Configurations';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { toast } from 'sonner';

export enum End {
  Halt, // No outgoing transitions; terminal node.
  NotYetComputed, // Children exist conceptually but are not expanded/rendered yet.
  None, // Children are computed and displayed.
}

const TOTAL_MAX_NODES = 8000; // Absolute cap on total nodes to prevent performance issues.

function normalizeTargetNodes(targetNodes?: number): number {
  if (typeof targetNodes !== 'number' || !Number.isFinite(targetNodes)) {
    return TOTAL_MAX_NODES;
  }
  return Math.min(TOTAL_MAX_NODES, Math.max(1, Math.floor(targetNodes)));
}

type ConfigTreeNode = {
  config: Configuration;
  children: [ConfigTreeNode, number][]; // Child config and transition index (within the from-state's transition array).
  computed: boolean; // true if this node has been expanded at least once.
  id: number | null; // Unique per-node ID for React keys.
  end: End; // End-status as defined above.
};

function computeConfigTreeNodes(
  depth: number,
  startconfig: Configuration,
  alltransitions: Map<string, Transition[]>,
  numberOfTapes: number,
  blank: string,
  notifyTruncate?: (msg: string) => void,
  targetNodes?: number
): ConfigTreeNode {
  const maxNodes = normalizeTargetNodes(targetNodes);
  let alreadyAddedNodes = 0;
  let truncated = false;

  // Depth 0 -> only root, no children; set end based on existence of next configs. This is an edge case.
  if (depth === 0) {
    const end =
      nextConfigurations(
        startconfig,
        alltransitions.get(startconfig.state),
        numberOfTapes,
        blank
      ).length === 0
        ? End.Halt
        : End.NotYetComputed;
    return {
      config: startconfig,
      children: [],
      computed: false,
      id: null,
      end: end,
    };
  }

  // BFS construction
  const root: ConfigTreeNode = {
    config: startconfig,
    children: [],
    computed: false,
    id: null,
    end: End.NotYetComputed, // Initially unknown children.
  };

  type QItem = { node: ConfigTreeNode; depthLeft: number };
  const queue = new Denque<QItem>([{ node: root, depthLeft: depth }]);

  alreadyAddedNodes += 1;

  while (queue.length > 0) {
    const { node, depthLeft } = queue.shift()!;

    // Reached max depth -> leave as created; potential children not expanded.
    if (depthLeft <= 0) continue;

    const tlist: Transition[] | undefined = alltransitions.get(node.config.state);

    if (alreadyAddedNodes >= maxNodes) {
      truncated = true;
      break;
    }

    const nexts = nextConfigurations(node.config, tlist, numberOfTapes, blank);
    node.computed = true; // Mark node as expanded at this level.

    // Update end-status for the expanded node.
    if (nexts.length === 0) {
      node.end = End.Halt;
      continue; // Terminal node, no children to create.
    }

    node.end = End.None; // Will have visible children.
    for (const [nextConfig, transitionIndex] of nexts) {
      if (alreadyAddedNodes >= maxNodes) {
        truncated = true;
        node.end = End.NotYetComputed;
        break;
      }

      const childNode: ConfigTreeNode = {
        config: nextConfig,
        children: [],
        computed: false, // Child starts unexpanded.
        id: null,
        end: End.NotYetComputed, // Not expanded yet.
      };
      node.children.push([childNode, transitionIndex]);

      // Enqueue child for further expansion if depth allows.
      queue.push({ node: childNode, depthLeft: depthLeft - 1 });
      alreadyAddedNodes += 1;
    }

    if (truncated) break;
  }

  if (truncated) {
    notifyTruncate?.('Computation tree truncated to prevent performance issues.');
  }

  return root;
}

function computeConfigTreeNodesFromState(depth: number, targetNodes?: number): ConfigTreeNode {
  const globalZustand = useGlobalZustand.getState();
  return computeConfigTreeNodes(
    depth,
    getStartConfiguration(),
    globalZustand.transitions,
    globalZustand.numberOfTapes,
    globalZustand.blank,
    (msg) => toast.warning(msg),
    targetNodes
  );
}

export type ComputationTreeNode = {
  config: Configuration;
  id: number; // Unique ID for React keys.
  end: End; // End-status for rendering/logic.
};

export type ComputationTreeEdge = {
  from: number; // Source node ID.
  to: number; // Target node ID.
  transitionIndex: number; // Index in the from-node's transition array.
  compressed: boolean; //Whether this edge represents multiple transitions compressed into one.
  compressedLength?: number; // If compressed, how many transitions were collapsed into this edge.
};

export type ComputationTree = {
  root: ComputationTreeNode;
  edges: ComputationTreeEdge[];
  nodes: ComputationTreeNode[];
};

export function getComputationTree(
  depth: number,
  compressing: boolean = false,
  targetNodes?: number
): ComputationTree {
  if (compressing) {
    const globalZustand = useGlobalZustand.getState();
    return computeCompressedTreeFromInputs(
      getStartConfiguration(),
      globalZustand.transitions,
      globalZustand.numberOfTapes,
      globalZustand.blank,
      depth,
      (msg) => toast.warning(msg),
      targetNodes
    );
  }

  const tree = computeConfigTreeNodesFromState(depth, targetNodes);
  return getComputationTreeFromNodes(tree, depth, compressing);
}

export function getComputationTreeFromInputs(
  startConfig: Configuration,
  transitions: Map<string, Transition[]>,
  numberOfTapes: number,
  blank: string,
  depth: number,
  compressing: boolean = false,
  notifyTruncate?: (msg: string) => void,
  targetNodes?: number
): ComputationTree {
  if (compressing) {
    return computeCompressedTreeFromInputs(
      startConfig,
      transitions,
      numberOfTapes,
      blank,
      depth,
      notifyTruncate,
      targetNodes
    );
  }

  const tree = computeConfigTreeNodes(
    depth,
    startConfig,
    transitions,
    numberOfTapes,
    blank,
    notifyTruncate,
    targetNodes
  );
  return getComputationTreeFromNodes(tree, depth, compressing);
}

type CompressedQueueItem = {
  config: Configuration;
  depthLeft: number;
  nodeId: number | null;
  parentId: number;
  chainLength: number;
  firstTransitionIndex: number;
};

function computeCompressedTreeFromInputs(
  startConfig: Configuration,
  transitions: Map<string, Transition[]>,
  numberOfTapes: number,
  blank: string,
  depth: number,
  notifyTruncate?: (msg: string) => void,
  targetNodes?: number
): ComputationTree {
  const maxNodes = normalizeTargetNodes(targetNodes);
  if (depth <= 0) {
    const nexts = nextConfigurations(
      startConfig,
      transitions.get(startConfig.state),
      numberOfTapes,
      blank
    );
    const end = nexts.length === 0 ? End.Halt : End.NotYetComputed;
    return {
      root: { config: startConfig, id: 0, end },
      nodes: [{ config: startConfig, id: 0, end }],
      edges: [],
    };
  }

  const nodes: ComputationTreeNode[] = [];
  const edges: ComputationTreeEdge[] = [];
  let currentId = 0;
  let totalNodes = 1;
  let truncated = false;

  const addNode = (config: Configuration, end: End) => {
    const id = currentId++;
    nodes.push({ config, id, end });
    return id;
  };

  const updateEnd = (id: number, end: End) => {
    const node = nodes[id];
    if (node) node.end = end;
  };

  const addChainEdge = (
    from: number,
    to: number,
    chainLength: number,
    transitionIndex: number
  ) => {
    const length = Math.max(1, chainLength);
    edges.push({
      from,
      to,
      transitionIndex: length > 1 ? -1 : transitionIndex,
      compressed: length > 1,
      compressedLength: length,
    });
  };

  const finalizeItem = (item: CompressedQueueItem, end: End) => {
    if (item.nodeId != null) {
      updateEnd(item.nodeId, end);
    } else {
      const id = addNode(item.config, end);
      addChainEdge(item.parentId, id, item.chainLength, item.firstTransitionIndex);
    }
  };

  const rootId = addNode(startConfig, End.NotYetComputed);
  const queue: CompressedQueueItem[] = [
    {
      config: startConfig,
      depthLeft: depth,
      nodeId: rootId,
      parentId: rootId,
      chainLength: 0,
      firstTransitionIndex: -1,
    },
  ];

  let head = 0;
  const finalizeRemainingQueuedItems = () => {
    for (; head < queue.length; head++) {
      finalizeItem(queue[head]!, End.NotYetComputed);
    }
  };

  while (head < queue.length) {
    const item = queue[head++]!;

    if (totalNodes >= maxNodes) {
      truncated = true;
      finalizeItem(item, End.NotYetComputed);
      finalizeRemainingQueuedItems();
      break;
    }

    if (item.depthLeft <= 0) {
      finalizeItem(item, End.NotYetComputed);
      continue;
    }

    const tlist = transitions.get(item.config.state);
    const nexts = nextConfigurations(item.config, tlist, numberOfTapes, blank);

    if (item.nodeId != null) {
      updateEnd(item.nodeId, nexts.length === 0 ? End.Halt : End.None);
    }

    if (nexts.length === 0) {
      if (item.nodeId == null) finalizeItem(item, End.Halt);
      continue;
    }

    const nextDepth = item.depthLeft - 1;

    if (nexts.length === 1) {
      if (totalNodes >= maxNodes) {
        truncated = true;
        finalizeItem(item, End.NotYetComputed);
        finalizeRemainingQueuedItems();
        break;
      }
      const [childConfig, transitionIndex] = nexts[0];
      totalNodes += 1;
      if (item.nodeId != null) {
        queue.push({
          config: childConfig,
          depthLeft: nextDepth,
          nodeId: null,
          parentId: item.nodeId,
          chainLength: 1,
          firstTransitionIndex: transitionIndex,
        });
      } else {
        queue.push({
          config: childConfig,
          depthLeft: nextDepth,
          nodeId: null,
          parentId: item.parentId,
          chainLength: item.chainLength + 1,
          firstTransitionIndex: item.firstTransitionIndex,
        });
      }
      continue;
    }

    let currentNodeId = item.nodeId;
    if (currentNodeId == null) {
      currentNodeId = addNode(item.config, End.None);
      addChainEdge(item.parentId, currentNodeId, item.chainLength, item.firstTransitionIndex);
    } else {
      updateEnd(currentNodeId, End.None);
    }

    for (const [childConfig, transitionIndex] of nexts) {
      if (totalNodes >= maxNodes) {
        truncated = true;
        updateEnd(currentNodeId, End.NotYetComputed);
        finalizeRemainingQueuedItems();
        break;
      }
      totalNodes += 1;
      const childId = addNode(childConfig, End.NotYetComputed);
      edges.push({
        from: currentNodeId,
        to: childId,
        transitionIndex,
        compressed: false,
        compressedLength: 1,
      });
      queue.push({
        config: childConfig,
        depthLeft: nextDepth,
        nodeId: childId,
        parentId: childId,
        chainLength: 0,
        firstTransitionIndex: -1,
      });
    }

    if (truncated) break;
  }

  if (truncated) {
    notifyTruncate?.('Computation tree truncated to prevent performance issues.');
  }

  return {
    root: nodes[rootId],
    edges,
    nodes,
  };
}

function getComputationTreeFromNodes(
  tree: ConfigTreeNode,
  depth: number,
  compressing: boolean
): ComputationTree {
  // If compression is not enabled, use the original BFS approach (no changes in logic, just include compressed:false).
  if (!compressing) {
    const edges: ComputationTreeEdge[] = [];
    const nodes: ComputationTreeNode[] = [];
    let currentId = 0;
    const queue = new Denque<ConfigTreeNode>([tree]);

    // BFS: assign IDs and build nodes/edges in one pass.
    tree.id = currentId++;
    nodes.push({ config: tree.config, id: tree.id, end: tree.end });
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const [child, transitionIndex] of node.children) {
        if (child.id == null) {
          child.id = currentId++;
          nodes.push({ config: child.config, id: child.id, end: child.end });
        }
        edges.push({
          from: node.id!,
          to: child.id!,
          transitionIndex: transitionIndex,
          compressed: false, // no compression in this mode
          compressedLength: 1,
        });
        queue.push(child);
      }
    }

    /*
    console.log('Computation tree complete.');
    console.log('Nodes:', nodes);
    console.log('Edges:', edges);
    */

    return {
      root: { config: tree.config, id: tree.id!, end: tree.end },
      edges,
      nodes,
    };
  }

  // If compression is enabled, perform traversal with path compression.
  const edges: ComputationTreeEdge[] = [];
  const nodes: ComputationTreeNode[] = [];
  let currentId = 0;
  const nodeToId = new Map<ConfigTreeNode, number>(); // maps original nodes to new IDs in the compressed graph

  // Helper function to add a node to the output nodes list (assign ID if not already assigned)
  function addNode(node: ConfigTreeNode) {
    if (!nodeToId.has(node)) {
      nodeToId.set(node, currentId);
      nodes.push({ config: node.config, id: currentId, end: node.end });
      currentId += 1;
    }
  }

  // Start with the root node
  addNode(tree);

  // Recursive (depth-first) traversal to build compressed edges and nodes
  function traverse(node: ConfigTreeNode) {
    if (node.children.length === 0) {
      // Leaf node: no children to process
      return;
    }
    if (node.children.length === 1) {
      // This node has exactly one child: potential linear chain
      const [childNode, firstTransIndex] = node.children[0];
      let chainEndNode = childNode;
      let chainLength = 1;

      // Follow the chain downward while each node has exactly one child
      while (chainEndNode.children.length === 1) {
        chainEndNode = chainEndNode.children[0][0];
        chainLength += 1;
      }

      if (chainLength > 1) {
        // We found a chain of length > 1 (intermediate nodes exist).
        // Compress the entire chain into a single edge from `node` to `chainEndNode`.
        addNode(chainEndNode);
        edges.push({
          from: nodeToId.get(node)!,
          to: nodeToId.get(chainEndNode)!,
          transitionIndex: -1, // Irrelevant for compressed edges
          compressed: true,
          compressedLength: chainLength,
        });
        // Continue traversal from the end of the chain
        traverse(chainEndNode);
      } else {
        // Chain length is 1, meaning no intermediate nodes (the childNode itself either branches or is a leaf).
        // In this case, output a normal edge (no compression) from node to its child.
        addNode(childNode);
        edges.push({
          from: nodeToId.get(node)!,
          to: nodeToId.get(childNode)!,
          transitionIndex: firstTransIndex,
          compressed: false,
          compressedLength: 1,
        });
        // Continue traversal from the child node
        traverse(childNode);
      }
    } else {
      // This node has multiple children (branching point).
      // Output each child as a separate edge (no compression at this node).
      for (const [childNode, transitionIndex] of node.children) {
        addNode(childNode);
        edges.push({
          from: nodeToId.get(node)!,
          to: nodeToId.get(childNode)!,
          transitionIndex: transitionIndex,
          compressed: false,
          compressedLength: 1,
        });
        // Traverse each child subtree (which may have their own chains to compress)
        traverse(childNode);
      }
    }
  }

  // Perform traversal starting from the root to build the compressed tree
  traverse(tree);

  /*
  console.log('Computation tree complete.');
  console.log('Nodes:', nodes);
  console.log('Edges:', edges);
  */

  return {
    root: { config: tree.config, id: nodeToId.get(tree)!, end: tree.end },
    edges,
    nodes,
  };
}
