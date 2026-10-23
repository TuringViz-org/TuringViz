import { packConfigGraph, configGraphTransferables } from './configGraphCodec';
import {
  graphComputations,
  type GraphComputeRequest,
  type GraphComputeResponse,
} from './graphComputeProtocol';

self.onmessage = (event: MessageEvent<GraphComputeRequest>) => {
  const request = event.data;
  const { id, type } = request;
  try {
    if (request.type === 'configGraph') {
      const result = graphComputations.configGraph(request.payload);
      const packed = packConfigGraph(result);
      postMessage(
        { id, type, result: packed ?? result } satisfies GraphComputeResponse,
        { transfer: packed ? configGraphTransferables(packed) : [] }
      );
    } else {
      const result = graphComputations.computationTree(request.payload);
      postMessage({ id, type, result } satisfies GraphComputeResponse);
    }
  } catch (error) {
    postMessage({
      id,
      type,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies GraphComputeResponse);
  }
};
