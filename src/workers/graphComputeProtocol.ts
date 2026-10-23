import type { Configuration, Transition } from '@mytypes/TMTypes';
import {
  getComputationTreeFromInputs,
  type ComputationTree,
} from '@tmfunctions/ComputationTree';
import { computeConfigGraph, type ConfigGraph } from '@tmfunctions/configGraphModel';
import { DEFAULT_CONFIG_GRAPH_TARGET_NODES } from '@utils/constants';
import type { PackedConfigGraph } from './configGraphCodec';

export type ConfigGraphPayload = {
  startConfig: Configuration;
  transitions: Map<string, Transition[]>;
  numberOfTapes: number;
  blank: string;
  targetNodes?: number;
};

export type TreePayload = ConfigGraphPayload & {
  depth: number;
  compressing?: boolean;
};

export interface GraphComputePayloads {
  computationTree: TreePayload;
  configGraph: ConfigGraphPayload;
}

export interface GraphComputeResults {
  computationTree: ComputationTree;
  configGraph: ConfigGraph;
}

export interface GraphComputeWireResults {
  computationTree: ComputationTree;
  configGraph: ConfigGraph | PackedConfigGraph;
}

export type GraphComputeKind = keyof GraphComputePayloads;
export type GraphComputeRequest = {
  [Kind in GraphComputeKind]: {
    id: number;
    type: Kind;
    payload: GraphComputePayloads[Kind];
  };
}[GraphComputeKind];

export type GraphComputeResponse<Kind extends GraphComputeKind = GraphComputeKind> =
  {
    id: number;
    type: Kind;
  } & (
    | { result: GraphComputeWireResults[Kind] }
    | { error: { name: string; message: string } }
  );

/** Worker and fallback execute exactly the same calculation and node budget. */
export const graphComputations = {
  computationTree: (payload: TreePayload): ComputationTree =>
    getComputationTreeFromInputs(
      payload.startConfig,
      payload.transitions,
      payload.numberOfTapes,
      payload.blank,
      payload.depth,
      !!payload.compressing,
      undefined,
      payload.targetNodes
    ),
  configGraph: (payload: ConfigGraphPayload): ConfigGraph =>
    computeConfigGraph(
      payload.startConfig,
      payload.targetNodes ?? DEFAULT_CONFIG_GRAPH_TARGET_NODES,
      payload.transitions,
      payload.numberOfTapes,
      payload.blank
    ),
};
