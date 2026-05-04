import { RESERVED_WORDS } from '../constants';
import { diagnostic, mergeRanges } from '../ranges';
import type { SourceRange } from '../types';
import {
  advance,
  check,
  checkValue,
  consumeValue,
  isAtEnd,
  matchValue,
  peek,
  skipUntilValueOrLine,
} from './cursor';
import type { ParserState } from './state';

/** Parses a tape reference token such as `t1` into its numeric index. */
export function parseTapeReference(
  state: ParserState
): { index: number; range: SourceRange } | undefined {
  const token = peek(state);
  const match = /^t([1-9][0-9]*)$/.exec(token.value);

  if (token.kind !== 'word' || !match) {
    return undefined;
  }

  advance(state);
  return { index: Number.parseInt(match[1], 10), range: token.range };
}

/** Parses one DSL symbol token, including quoted symbols and reserved-symbol diagnostics. */
export function parseSymbolToken(
  state: ParserState,
  message: string
): { value: string; range: SourceRange } | undefined {
  const token = peek(state);

  // Quoted symbols are the escape hatch for whitespace and single-character
  // reserved words such as "L".
  if (token.kind === 'string') {
    advance(state);
    return { value: token.value, range: token.range };
  }

  if (
    token.kind === 'word' ||
    token.kind === 'number' ||
    token.value === '#' ||
    token.value === '_' ||
    token.value === '*'
  ) {
    if (token.kind === 'word' && RESERVED_WORDS.has(token.value)) {
      state.diagnostics.push(
        diagnostic(
          'PARSE_RESERVED_SYMBOL',
          `\`${token.value}\` is reserved. Quote it to use it as a symbol.`,
          token.range
        )
      );
    }
    advance(state);
    return { value: token.value, range: token.range };
  }

  state.diagnostics.push(diagnostic('PARSE_EXPECTED_SYMBOL', message, token.range));
  return undefined;
}

/** Parses and validates the token shape for a state name. */
export function parseStateNameToken(
  state: ParserState,
  message: string
): { value: string; range: SourceRange } | undefined {
  const token = peek(state);

  if (token.kind !== 'word' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(token.value)) {
    state.diagnostics.push(
      diagnostic('PARSE_EXPECTED_STATE_NAME', message, token.range)
    );
    return undefined;
  }

  if (RESERVED_WORDS.has(token.value)) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_RESERVED_STATE_NAME',
        `\`${token.value}\` is reserved and cannot be used as a state name.`,
        token.range
      )
    );
  }

  advance(state);
  return { value: token.value, range: token.range };
}

/** Parses a `{ ... }` symbol set and preserves its source range. */
export function parseSymbolSet(
  state: ParserState
): { symbols: string[]; range: SourceRange } | undefined {
  const open = consumeValue(state, '{', 'Expected `{` to start a symbol set.');
  if (!open) {
    return undefined;
  }

  const symbols: string[] = [];
  let endRange = open.range;

  // Sets keep duplicates for now; validation owns semantic checks and can report
  // errors against the complete set range instead of a parser-only fragment.
  while (!checkValue(state, '}') && !check(state, 'newline') && !isAtEnd(state)) {
    const symbol = parseSymbolToken(state, 'Expected a symbol in the set.');
    if (symbol) {
      symbols.push(symbol.value);
      endRange = symbol.range;
    } else {
      skipUntilValueOrLine(state, [',', '}']);
    }

    if (!matchValue(state, ',')) {
      break;
    }
  }

  const close = consumeValue(state, '}', 'Expected `}` to close the symbol set.');
  if (close) {
    endRange = close.range;
  }

  return { symbols, range: mergeRanges(open.range, endRange) };
}
