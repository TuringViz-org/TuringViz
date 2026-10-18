import type { NodeLayoutSizeResolver } from './graphLayout';
import {
  CONFIG_CARD_HEIGHT_ESTIMATE,
  CONFIG_CARD_WIDTH,
  CONFIG_NODE_DIAMETER,
  NodeType,
} from '../configGraphConstants';

export const getConfigNodeLayoutSize: NodeLayoutSizeResolver = (node) => {
  const isCard = node.type === NodeType.CONFIG_CARD;
  return {
    width:
      node.measured?.width ??
      node.width ??
      (isCard ? CONFIG_CARD_WIDTH : CONFIG_NODE_DIAMETER),
    height:
      node.measured?.height ??
      node.height ??
      (isCard ? CONFIG_CARD_HEIGHT_ESTIMATE : CONFIG_NODE_DIAMETER),
  };
};
