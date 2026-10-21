/* tslint:disable */
/* eslint-disable */

/**
 * Return all registered layout algorithms as a JSON array string.
 */
export function known_layout_algorithms(): string;

/**
 * Return all registered layout categories as a JSON array string.
 */
export function known_layout_categories(): string;

/**
 * Return all registered layout options as a JSON array string.
 */
export function known_layout_options(): string;

/**
 * Run ELK layout on a JSON graph string.
 *
 * - `graph_json`: ELK graph in JSON format
 * - `options_json`: global layout options as JSON object (merged as defaults)
 *
 * Returns the laid-out graph as a JSON string.
 */
export function layout_json(graph_json: string, options_json: string): string;

/**
 * Run the complete layout and return root/child geometry for supported flat
 * layered graphs; richer graphs retain the ordinary full JSON result.
 */
export function layout_positions_json(graph_json: string, options_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly known_layout_algorithms: () => [number, number, number, number];
    readonly known_layout_categories: () => [number, number, number, number];
    readonly known_layout_options: () => [number, number, number, number];
    readonly layout_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly layout_positions_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
