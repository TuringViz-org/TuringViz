import { createElkWasmBackend } from '../components/shared/layout/elkWasmBackend';
import type { ElkLayoutRequest, ElkLayoutResponse } from './elkLayoutProtocol';

let elk: ReturnType<typeof createElkWasmBackend> | undefined;
let positionsElk: ReturnType<typeof createElkWasmBackend> | undefined;

self.onmessage = async (event: MessageEvent<ElkLayoutRequest>) => {
  const { id, graph, positionsOnly } = event.data;
  try {
    // Both output modes share the local Rust module's single initialization.
    const backend = positionsOnly
      ? (positionsElk ??= createElkWasmBackend({ positionsOnly: true }))
      : (elk ??= createElkWasmBackend());
    const result = await backend.layout(graph);
    postMessage({ id, result } satisfies ElkLayoutResponse);
  } catch (error) {
    postMessage({
      id,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies ElkLayoutResponse);
  }
};
