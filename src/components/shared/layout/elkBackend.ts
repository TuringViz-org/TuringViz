import type { ElkNode } from '@openedges/elk-layout';
import { isLegacyElkGraph } from './elkAlgorithms';
import { compactElkGraph } from './elkCompactGraph';
import type { ElkLayoutOutputOptions } from '../../../workers/elkLayoutProtocol';

type LayoutBackend = {
  layout(graph: ElkNode): Promise<ElkNode>;
};

/** Preserve developer layouts whose Rust implementation differs from ELK.js. */
export function createElkBackend({
  positionsOnly = false,
}: ElkLayoutOutputOptions = {}): LayoutBackend {
  let wasm: Promise<LayoutBackend> | undefined;
  let legacy: Promise<LayoutBackend> | undefined;

  return {
    async layout(graph) {
      if (isLegacyElkGraph(graph)) {
        legacy ??= import('elkjs/lib/elk.bundled.js').then(
          ({ default: Elk }) => new Elk()
        );
        return (await legacy).layout(graph);
      }
      const compact = compactElkGraph(graph);
      wasm ??= import('./elkWasmBackend').then(({ createElkWasmBackend }) =>
        createElkWasmBackend({ positionsOnly })
      );
      return compact.restore(await (await wasm).layout(compact.graph));
    },
  };
}
