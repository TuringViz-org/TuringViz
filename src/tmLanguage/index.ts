import { KEYWORD_HOVERS, RESERVED_WORDS } from './constants';
import { lex } from './lexer';
import { containsPosition } from './ranges';
import { parseSyntax } from './parser';
import { validateAndNormalize } from './validation';
import type { ParseResult, Token } from './types';

// Public domain API for the DSL. Monaco calls into this module, but this module
// has no editor dependency and can be tested or reused independently.
export type {
  Diagnostic,
  MachineProgram,
  NormalizedTransition,
  ParseResult,
  ProgramAst,
  ReadMatcher,
  Token,
} from './types';

export function parseTuringMachine(source: string): ParseResult {
  const syntax = parseSyntax(source);
  const validation = validateAndNormalize(syntax.ast);
  const diagnostics = [...syntax.diagnostics, ...validation.diagnostics];

  // A partial AST is still useful for editor features, but executable machine
  // data is only exposed when the whole parse/validation pipeline is clean.
  return {
    ast: syntax.ast,
    tokens: syntax.tokens,
    diagnostics,
    machine: diagnostics.some((item) => item.severity === 'error')
      ? undefined
      : validation.machine,
  };
}

export function getSemanticHover(
  source: string,
  line: number,
  column: number,
): string | undefined {
  // Hover is deliberately derived from a fresh parse instead of cached editor
  // state, so tests and non-Monaco callers observe the same behavior.
  const parsed = parseTuringMachine(source);
  const token = findTokenAt(parsed.tokens, line, column);

  if (!token) {
    return undefined;
  }

  const previousToken = previousSignificantToken(parsed.tokens, token);
  // State and goto hovers need local token context instead of keyword lookup.
  if (previousToken?.value === 'state') {
    const transitionCount =
      parsed.ast.states.find((state) => state.name === token.value)?.transitions.length ?? 0;
    return `State \`${token.value}\` declares ${transitionCount} transition(s).`;
  }

  if (previousToken?.value === 'goto') {
    const exists = parsed.ast.states.some((state) => state.name === token.value);
    return exists
      ? `Goto target state \`${token.value}\`.`
      : `Goto target \`${token.value}\` is not declared.`;
  }

  if (/^t[1-9][0-9]*$/.test(token.value)) {
    return `Tape reference \`${token.value}\`. Tape indexes start at 1.`;
  }

  if (token.kind === 'string') {
    return 'Quoted text is used for input segments and one-character symbols such as spaces.';
  }

  if (KEYWORD_HOVERS[token.value]) {
    return KEYWORD_HOVERS[token.value];
  }

  if (!RESERVED_WORDS.has(token.value) && parsed.ast.header.alphabet?.value.includes(token.value)) {
    return `Tape symbol \`${token.value}\` from the alphabet.`;
  }

  return undefined;
}

export function lexTuringMachine(source: string) {
  return lex(source);
}

function findTokenAt(tokens: Token[], line: number, column: number): Token | undefined {
  return tokens.find((token) => containsPosition(token.range, line, column));
}

function previousSignificantToken(tokens: Token[], token: Token): Token | undefined {
  const index = tokens.indexOf(token);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (tokens[cursor].kind !== 'newline') {
      return tokens[cursor];
    }
  }

  return undefined;
}
