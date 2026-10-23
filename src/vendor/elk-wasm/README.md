# OpenEdges ELK WebAssembly

This is a browser build of [OpenEdges ELK 0.12.0](https://github.com/openedges/elk-rs),
with three graph traversals made iterative for Safari workers and an optional
positions-only export.

- Upstream tag: `v0.12.0`
- Source commit: `22fbee456ccffe88d524e8fefe7d6ffd8d9f5063`
- Rust: `1.94.1`, target `wasm32-unknown-unknown`, release profile
- `wasm-bindgen-cli`: `0.2.113`
- Local modifications, including Rust regression tests: [safari-stack.patch](safari-stack.patch)
  and [positions-output.patch](positions-output.patch)
- Upstream license and attribution: [LICENSE](LICENSE) and [NOTICE](NOTICE)

`ComponentsProcessor::dfs_flat`, `NetworkSimplexLayerer::dfs_flat`, and
`NetworkSimplex::tight_tree_dfs` originally used recursive graph traversal.
Safari's smaller worker stack overflows on
the default NonDetSAT configuration graph (14,199 nodes), even when the same
binary works in Chromium or on the main thread. The third traversal also fails
on deep graphs with merging paths. All three now use explicit stacks. Component
traversals push neighbors in reverse order and mark nodes on entry; tight-tree
traversal retains an edge cursor per frame. This preserves recursive traversal
order, including shared neighbors, cycles, component order, external-port
accumulation, and tree-edge insertion order.

`layout_positions_json` runs the same import and complete layout pipeline as
`layout_json`. For flat, unlabelled layered graphs it then exports root and node
geometry, preserving input order and the full exporter's numeric conversion.
This skips construction and serialization of edge sections that TuringViz does
not use. A conservative structure and options check keeps the full exporter for
other inputs, including hierarchy, ports, labels, and coordinate-mode overrides.
The ordinary `layout_json` export still returns the complete graph.

The checked-in files are generated, not hand-edited. Normal `npm run build`
needs no Rust installation. To rebuild from the pinned upstream source:

```sh
bash scripts/build-elk-wasm.sh
```

The [rebuild script](../../../scripts/build-elk-wasm.sh) fetches the source, applies
both patches, and builds the browser binary and bindings using the pinned Rust
and wasm-bindgen versions. Debug symbols are
available during compilation and stripped from the shipped binary. It requires Git,
Rustup, Cargo, and network access. `ELK_RUST_TOOLCHAIN` can override the Rust
toolchain for development; a different toolchain may change the binary hash.

The runtime imports these local generated files through `elkWasmBackend.ts`.
The `@openedges/elk-layout` npm dependency supplies graph types; updating it alone
does not update this binary. For an upstream upgrade, update the pinned source and
tool versions in the script and this document, rebase both patches, and regenerate
the JavaScript, declarations, WASM, license, and attribution together. The script
does not run validation: rerun the application checks, layout/stack regressions,
and Safari worker checks before accepting an upgrade. The separately pinned
ELK.js backend preserves the optional non-layered developer layouts.

Validation lives in `test/ElkWasmLayout.test.ts` and
`test/ElkCompactGraph.test.ts`: legacy layout fixtures, full-output parity after
ID compaction, the actual NonDetSAT configuration graph, a 10,000-node chain,
and a 5,000-node graph with merging paths inside workers with 1 MiB stacks. The
original binary fails the stack regressions; the patched binary must preserve
the expected coordinates. Positions-only output is also compared exactly against
the full export, without rounding, on the 28 layered fixtures and full NonDetSAT.
Rust tests cover directions, input order, global defaults, empty graphs,
unsupported structures, and errors.

The Safari traversal patch passed the complete Rust workspace suite: 1,038 tests
(2 ignored). The subsequent export change passed all 94 graph-JSON crate tests,
including five new regressions, and workspace Clippy for all targets with
warnings denied. At the positions-export checkpoint, the application suite passed
480 tests, TypeScript checking, and a production build. The upstream full Java
model/phase-trace comparison was not rerun; the geometry checks above cover
TuringViz inputs.

Performance check on 2026-10-20, Apple M1 Max: the default NonDetSAT graph
(14,199 nodes) took a median 589 ms with the prior full export and 523 ms with
the positions export in a JavaScriptCore secondary thread, including JSON
parsing. Each API had two warmups and seven alternating measured runs. All 18
results had exactly equal geometry. Serialized result size fell from 3.87 MB to
0.80 MB. The JSC shell uses UTF-8 polyfills, so these are comparative engine
measurements, not browser UI timings. An actual Safari 27.0.1 production-worker
comparison also preserved every coordinate and showed an 11.4% median reduction;
its absolute times were affected by background throttling.
Compiler/LTO experiments were not adopted because Safari gains were negligible.
