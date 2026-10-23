import type { ElkNode } from '@openedges/elk-layout';

export interface ElkLayoutOutputOptions {
  /** Request node geometry only where supported; the default returns the full graph. */
  positionsOnly?: boolean;
}

export interface ElkLayoutRequest extends ElkLayoutOutputOptions {
  id: number;
  graph: ElkNode;
}

export type ElkLayoutResponse = { id: number } & (
  | { result: ElkNode }
  | { error: { name: string; message: string } }
);
