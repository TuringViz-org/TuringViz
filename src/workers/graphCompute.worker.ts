import {
  graphComputations,
  type GraphComputeRequest,
  type GraphComputeResponse,
} from './graphComputeProtocol';

self.onmessage = (event: MessageEvent<GraphComputeRequest>) => {
  const request = event.data;
  const { id, type } = request;
  try {
    const result =
      request.type === 'computationTree'
        ? graphComputations.computationTree(request.payload)
        : graphComputations.configGraph(request.payload);
    postMessage({ id, type, result } satisfies GraphComputeResponse);
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
