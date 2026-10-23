import type { Configuration } from '@mytypes/TMTypes';
import type { ConfigGraph } from '@tmfunctions/configGraphModel';

const FORMAT = 'config-graph-v1';
const UINT32_MAX = 0xffffffff;
type PackedNode = [string, number[], number, boolean, number];

/** Avoid cloning one object per tape cell across the worker boundary. */
export type PackedConfigGraph = {
  format: typeof FORMAT;
  hashes: string[];
  symbols: string[];
  nodes: PackedNode[];
  cells: Uint32Array;
  lengths: Uint32Array;
  targets: Uint32Array;
  transitions: Uint32Array;
  start: number;
};

function onlyKeys(value: unknown, keys: readonly string[]): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function denseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === value.length &&
    (keys.length === 0 || keys[keys.length - 1] === String(value.length - 1))
  );
}

function uint32(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0) &&
    value <= UINT32_MAX
  );
}

/**
 * Called immediately after computeConfigGraph. nextConfigurations deep-copies
 * every successor's tape cells; only the supplied start configuration can have
 * pre-existing cell aliases. Richer data keeps the full structured-clone path.
 * The input graph and its arrays remain untouched.
 */
export function packConfigGraph(graph: ConfigGraph): PackedConfigGraph | null {
  if (
    !onlyKeys(graph, ['startconfig', 'startconfighash', 'Graph']) ||
    !(graph.Graph instanceof Map) ||
    graph.Graph.size === 0 ||
    graph.Graph.size > UINT32_MAX ||
    typeof graph.startconfighash !== 'string' ||
    graph.Graph.get(graph.startconfighash)?.config !== graph.startconfig
  ) {
    return null;
  }

  // Keep structural alias checks proportional to the node count. Successor
  // cells are independent by the producer contract above; tracking each one
  // would recreate the cost this transport removes. Check start cells as well.
  const seen = new Set<object>();
  const independent = (value: object) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  };
  const entries = [...graph.Graph];
  const hashes: string[] = [];
  const nodeIds = new Map<string, number>();
  let cellCount = 0;
  let tapeCount = 0;
  let edgeCount = 0;
  for (const [hash, entry] of entries) {
    if (
      typeof hash !== 'string' ||
      !onlyKeys(entry, ['config', 'computed', 'next']) ||
      !independent(entry) ||
      typeof entry.computed !== 'boolean' ||
      !denseArray(entry.next) ||
      !independent(entry.next) ||
      !onlyKeys(entry.config, ['state', 'tapes', 'heads']) ||
      !independent(entry.config)
    ) {
      return null;
    }
    const config = entry.config;
    if (
      typeof config.state !== 'string' ||
      !denseArray(config.heads) ||
      !independent(config.heads) ||
      !config.heads.every((head) => typeof head === 'number') ||
      !denseArray(config.tapes) ||
      !independent(config.tapes)
    ) {
      return null;
    }
    for (const tape of config.tapes) {
      if (!denseArray(tape) || tape.length !== 2 || !independent(tape)) return null;
      for (const side of tape) {
        if (!denseArray(side) || !independent(side)) return null;
        cellCount += side.length;
      }
      tapeCount++;
    }
    hashes.push(hash);
    nodeIds.set(hash, nodeIds.size);
    edgeCount += entry.next.length;
  }
  if (![cellCount, tapeCount * 2, edgeCount].every(uint32)) return null;

  const cells = new Uint32Array(cellCount);
  const lengths = new Uint32Array(tapeCount * 2);
  const targets = new Uint32Array(edgeCount);
  const transitions = new Uint32Array(edgeCount);
  const symbols: string[] = [];
  const symbolIds = new Map<string, number>();
  const nodes: PackedNode[] = [];
  let cellOffset = 0;
  let lengthOffset = 0;
  let edgeOffset = 0;
  for (const [, entry] of entries) {
    const { config } = entry;
    for (const tape of config.tapes) {
      for (const side of tape) {
        lengths[lengthOffset++] = side.length;
        for (const field of side) {
          if (
            !onlyKeys(field, ['value']) ||
            typeof field.value !== 'string' ||
            (config === graph.startconfig && !independent(field))
          ) {
            return null;
          }
          let symbol = symbolIds.get(field.value);
          if (symbol === undefined) {
            symbol = symbols.length;
            symbols.push(field.value);
            symbolIds.set(field.value, symbol);
          }
          cells[cellOffset++] = symbol;
        }
      }
    }
    for (const edge of entry.next) {
      if (
        !denseArray(edge) ||
        edge.length !== 2 ||
        !uint32(edge[1]) ||
        !independent(edge)
      )
        return null;
      const target = nodeIds.get(edge[0]);
      if (target === undefined) return null;
      targets[edgeOffset] = target;
      transitions[edgeOffset++] = edge[1];
    }
    nodes.push([
      config.state,
      config.heads,
      config.tapes.length,
      entry.computed,
      entry.next.length,
    ]);
  }
  return {
    format: FORMAT,
    hashes,
    symbols,
    nodes,
    cells,
    lengths,
    targets,
    transitions,
    start: nodeIds.get(graph.startconfighash)!,
  };
}

export function configGraphTransferables(graph: PackedConfigGraph): ArrayBuffer[] {
  return [
    graph.cells.buffer as ArrayBuffer,
    graph.lengths.buffer as ArrayBuffer,
    graph.targets.buffer as ArrayBuffer,
    graph.transitions.buffer as ArrayBuffer,
  ];
}

export function isPackedConfigGraph(value: unknown): value is PackedConfigGraph {
  return (
    value !== null &&
    typeof value === 'object' &&
    'format' in value &&
    value.format === FORMAT
  );
}

/** Validate before allocating the full model; malformed transport can retry. */
export function unpackConfigGraph(packed: PackedConfigGraph): ConfigGraph {
  const invalid = () => new Error('Invalid packed configuration graph');
  const { hashes, symbols, nodes, cells, lengths, targets, transitions, start } =
    packed;
  if (
    !denseArray(hashes) ||
    !hashes.every((hash) => typeof hash === 'string') ||
    new Set(hashes).size !== hashes.length ||
    !denseArray(symbols) ||
    !symbols.every((symbol) => typeof symbol === 'string') ||
    !denseArray(nodes) ||
    hashes.length !== nodes.length ||
    !uint32(start) ||
    start >= nodes.length ||
    !(cells instanceof Uint32Array) ||
    !(lengths instanceof Uint32Array) ||
    !(targets instanceof Uint32Array) ||
    !(transitions instanceof Uint32Array) ||
    targets.length !== transitions.length
  ) {
    throw invalid();
  }
  let tapeCount = 0;
  let edgeCount = 0;
  for (const node of nodes) {
    if (
      !denseArray(node) ||
      node.length !== 5 ||
      typeof node[0] !== 'string' ||
      !denseArray(node[1]) ||
      !node[1].every((head) => typeof head === 'number') ||
      !uint32(node[2]) ||
      typeof node[3] !== 'boolean' ||
      !uint32(node[4])
    ) {
      throw invalid();
    }
    tapeCount += node[2];
    edgeCount += node[4];
  }
  if (
    tapeCount * 2 !== lengths.length ||
    edgeCount !== targets.length ||
    lengths.reduce((sum, length) => sum + length, 0) !== cells.length ||
    !cells.every((symbol) => symbol < symbols.length) ||
    !targets.every((target) => target < nodes.length)
  ) {
    throw invalid();
  }

  const Graph: ConfigGraph['Graph'] = new Map();
  let cellOffset = 0;
  let lengthOffset = 0;
  let edgeOffset = 0;
  nodes.forEach(([state, heads, tapeCount, computed, nextCount], index) => {
    const tapes: Configuration['tapes'] = [];
    for (let tapeIndex = 0; tapeIndex < tapeCount; tapeIndex++) {
      const sides: Configuration['tapes'][number] = [[], []];
      for (const side of sides) {
        const length = lengths[lengthOffset++];
        for (let i = 0; i < length; i++) {
          side.push({ value: symbols[cells[cellOffset++]] });
        }
      }
      tapes.push(sides);
    }
    const next: [string, number][] = [];
    for (let i = 0; i < nextCount; i++) {
      next.push([hashes[targets[edgeOffset]], transitions[edgeOffset++]]);
    }
    Graph.set(hashes[index], {
      config: { state, tapes, heads: heads.slice() },
      computed,
      next,
    });
  });
  const startconfighash = hashes[start];
  return {
    startconfighash,
    startconfig: Graph.get(startconfighash)!.config,
    Graph,
  };
}
