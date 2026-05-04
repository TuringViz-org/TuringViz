import { diagnostic, tokenRange } from '../ranges';
import type { Token } from '../types';
import type { ParserState } from './state';

// The consume/match helpers are the parser's error-recovery boundary. `consume`
// reports a diagnostic when the expected token is missing; `match` stays silent.
/** Consumes the next token when it has the expected token kind, otherwise reports an error. */
export function consumeKind(
  state: ParserState,
  kind: Token['kind'],
  message: string
): Token | undefined {
  if (check(state, kind)) {
    return advance(state);
  }

  state.diagnostics.push(
    diagnostic('PARSE_UNEXPECTED_TOKEN', message, tokenRange(peek(state)))
  );
  return undefined;
}

/** Consumes the next token when its raw value matches, otherwise reports an error. */
export function consumeValue(
  state: ParserState,
  value: string,
  message: string
): Token | undefined {
  if (checkValue(state, value)) {
    return advance(state);
  }

  state.diagnostics.push(
    diagnostic('PARSE_UNEXPECTED_TOKEN', message, tokenRange(peek(state)))
  );
  return undefined;
}

/** Consumes the next token when it is the expected word, otherwise reports an error. */
export function consumeWord(
  state: ParserState,
  value: string,
  message: string
): Token | undefined {
  if (checkWord(state, value)) {
    return advance(state);
  }

  state.diagnostics.push(
    diagnostic('PARSE_UNEXPECTED_TOKEN', message, tokenRange(peek(state)))
  );
  return undefined;
}

/** Advances until one of the given values, a newline, or EOF is reached. */
export function skipUntilValueOrLine(state: ParserState, values: string[]) {
  // Recovery stops at punctuation that can still belong to the surrounding
  // construct, allowing the parser to resume without discarding the full line.
  while (
    !isAtEnd(state) &&
    !check(state, 'newline') &&
    !values.some((value) => checkValue(state, value))
  ) {
    advance(state);
  }
}

/** Advances until one of the given words/values, a newline, or EOF is reached. */
export function skipUntilWordOrValueOrLine(
  state: ParserState,
  words: string[],
  values: string[]
) {
  while (
    !isAtEnd(state) &&
    !check(state, 'newline') &&
    !words.some((word) => checkWord(state, word)) &&
    !values.some((value) => checkValue(state, value))
  ) {
    advance(state);
  }
}

/** Skips the rest of the current source line. */
export function skipLine(state: ParserState) {
  // Line-oriented recovery keeps malformed rules isolated from the next rule or
  // state block.
  while (!isAtEnd(state) && !check(state, 'newline')) {
    advance(state);
  }
}

/** Skips consecutive blank lines at the current cursor position. */
export function skipBlankLines(state: ParserState) {
  while (check(state, 'newline')) {
    advance(state);
  }
}

/** Consumes one newline when the cursor is currently positioned on it. */
export function consumeNewline(state: ParserState) {
  if (check(state, 'newline')) {
    advance(state);
  }
}

/** Reports and skips unexpected trailing tokens after a transition rule. */
export function rejectTrailingRuleTokens(state: ParserState) {
  if (!check(state, 'newline') && !check(state, 'eof')) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_TRAILING_RULE_TOKENS',
        'Unexpected tokens after this rule.',
        tokenRange(peek(state))
      )
    );
    skipLine(state);
  }
}

/** Consumes a matching word token and returns whether it matched. */
export function matchWord(state: ParserState, value: string): boolean {
  if (!checkWord(state, value)) {
    return false;
  }
  advance(state);
  return true;
}

/** Consumes a token with the requested raw value and returns whether it matched. */
export function matchValue(state: ParserState, value: string): boolean {
  if (!checkValue(state, value)) {
    return false;
  }
  advance(state);
  return true;
}

export function checkWord(state: ParserState, value: string): boolean {
  return peek(state).kind === 'word' && peek(state).value === value;
}

export function checkValue(state: ParserState, value: string): boolean {
  return peek(state).value === value;
}

export function check(state: ParserState, kind: Token['kind']): boolean {
  return peek(state).kind === kind;
}

export function advance(state: ParserState): Token {
  if (!isAtEnd(state)) {
    state.current += 1;
  }
  return previous(state);
}

export function previous(state: ParserState): Token {
  return state.tokens[state.current - 1];
}

export function peek(state: ParserState): Token {
  return state.tokens[state.current];
}

export function isAtEnd(state: ParserState): boolean {
  return peek(state).kind === 'eof';
}
