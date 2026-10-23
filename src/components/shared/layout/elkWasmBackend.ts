import type { ElkNode } from '@openedges/elk-layout';
import initialize, {
  layout_json,
  layout_positions_json,
} from '../../../vendor/elk-wasm/org_eclipse_elk_wasm.js';
import type { ElkLayoutOutputOptions } from '../../../workers/elkLayoutProtocol';

let ready: Promise<unknown> | undefined;

/** Shared initialization also covers concurrent layouts from separate callers. */
export function createElkWasmBackend({
  positionsOnly = false,
}: ElkLayoutOutputOptions = {}) {
  return {
    async layout(graph: ElkNode): Promise<ElkNode> {
      const serialized = JSON.stringify(graph);
      ready ??= initialize();
      await ready;
      const layout = positionsOnly ? layout_positions_json : layout_json;
      return JSON.parse(layout(serialized, '{}')) as ElkNode;
    },
  };
}
