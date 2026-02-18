import type { Configuration, Transition } from '@mytypes/TMTypes';
import type { ComputationTree } from '@tmfunctions/ComputationTree';
import { getComputationTreeFromInputs } from '@tmfunctions/ComputationTree';
import { computeConfigGraph, type ConfigGraph } from '@tmfunctions/ConfigGraph';

type ComputeTreePayload = {
  depth: number;
  compressing?: boolean;
  transitions: Map<string, Transition[]>;
  numberOfTapes: number;
  blank: string;
  startConfig: Configuration;
};

type ComputeConfigGraphPayload = {
  startConfig: Configuration;
  transitions: Map<string, Transition[]>;
  numberOfTapes: number;
  blank: string;
  targetNodes?: number;
};

type IncomingMessage =
  | { id: number; type: 'computationTree'; payload: ComputeTreePayload }
  | { id: number; type: 'configGraph'; payload: ComputeConfigGraphPayload };

type OutgoingMessage =
  | { id: number; type: 'computationTree'; tree: ComputationTree }
  | { id: number; type: 'configGraph'; graph: ConfigGraph };

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const { id, type, payload } = event.data;

  if (type === 'computationTree') {
    const { startConfig, transitions, numberOfTapes, blank, depth, compressing } =
      payload;
    const tree = getComputationTreeFromInputs(
      startConfig,
      transitions,
      numberOfTapes,
      blank,
      depth,
      !!compressing
    );
    postMessage({ id, type, tree } satisfies OutgoingMessage);
    return;
  }

  if (type === 'configGraph') {
    const { startConfig, transitions, numberOfTapes, blank, targetNodes } = payload;
    const graph = computeConfigGraph(
      startConfig,
      targetNodes ?? 2000,
      transitions,
      numberOfTapes,
      blank
    );
    postMessage({ id, type, graph } satisfies OutgoingMessage);
  }
};

export {};
