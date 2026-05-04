import type { Diagnostic, ProgramAst, Token } from '../types';

// The parser is intentionally a simple token cursor, not a grammar generator.
// It builds a shallow AST, records recoverable syntax errors, and leaves
// cross-reference checks and alphabet expansion to validation.ts.
export interface ParserState {
  tokens: Token[];
  current: number;
  diagnostics: Diagnostic[];
  ast: ProgramAst;
  transitionId: number;
}

export type HeaderKey = keyof ProgramAst['header'];
export type AnyHeaderField = NonNullable<ProgramAst['header'][HeaderKey]>;
