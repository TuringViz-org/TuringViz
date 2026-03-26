// src/mytypes/graphTypes.ts
export type ElkAlgo = 'layered' | 'force' | 'mrtree' | 'stress' | 'radial';
export type Direction = 'RIGHT' | 'LEFT' | 'UP' | 'DOWN';

export type ElkOptions = {
  algorithm?: ElkAlgo;
  direction: Direction;
  autoDirection?: boolean;
  nodeSep: number;
  rankSep: number;
  edgeSep: number;
  edgeNodeSep: number;
  padding: number;
};
