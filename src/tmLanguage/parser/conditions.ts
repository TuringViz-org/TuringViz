import { diagnostic, mergeRanges, tokenRange } from '../ranges';
import type { ConditionAtom, ReadMatcher, Token, Transition } from '../types';
import {
  check,
  checkValue,
  checkWord,
  consumeWord,
  consumeValue,
  isAtEnd,
  matchValue,
  matchWord,
  peek,
  previous,
  skipUntilWordOrValueOrLine,
} from './cursor';
import type { ParserState } from './state';
import {
  parseSymbolSet,
  parseSymbolToken,
  parseTapeReference,
} from './tokenParsers';

/** Parses a bracketed list of compact `on` read-pattern alternatives. */
export function parseOnConditionList(
  state: ParserState,
  startToken: Token,
  openToken: Token
): Transition['condition'][] {
  const conditions: Transition['condition'][] = [];

  while (!checkValue(state, ']') && !check(state, 'newline') && !isAtEnd(state)) {
    const alternativeStart = peek(state);
    const condition = parseOnCondition(state, startToken, [',', ']', '->']);
    if (condition.read.length > 0) {
      conditions.push(condition);
    } else {
      state.diagnostics.push(
        diagnostic(
          'PARSE_EXPECTED_READ_PATTERN',
          'Expected a read-pattern alternative.',
          tokenRange(alternativeStart)
        )
      );
    }

    if (!matchValue(state, ',')) {
      break;
    }
  }

  consumeValue(state, ']', 'Expected `]` after the read-pattern alternatives.');
  if (conditions.length === 0) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_EXPECTED_READ_PATTERN',
        'Expected at least one read-pattern alternative.',
        openToken.range
      )
    );
  }

  return conditions.length > 0
    ? conditions
    : [
        {
          kind: 'on',
          read: [],
          range: mergeRanges(startToken.range, openToken.range),
        },
      ];
}

/** Parses one compact `on` read pattern until a caller-provided stop token appears. */
export function parseOnCondition(
  state: ParserState,
  startToken: Token,
  stopValues: string[]
): Extract<Transition['condition'], { kind: 'on' }> {
  const read: ReadMatcher[] = [];
  let conditionEnd = startToken.range;

  // Compact patterns are parsed as a list of matchers separated by `/`.
  // Validation later checks that the count matches the configured tape count.
  while (
    !stopValues.some((value) => checkValue(state, value)) &&
    !check(state, 'newline') &&
    !isAtEnd(state)
  ) {
    const matcher = parseReadPatternElement(state);
    if (matcher) {
      read.push(matcher);
      conditionEnd = matcher.range;
    }

    if (!matchValue(state, '/')) {
      break;
    }
  }

  return {
    kind: 'on',
    read,
    range: mergeRanges(startToken.range, conditionEnd),
  };
}

/** Parses all `if` condition alternatives separated by `or`. */
export function parseIfConditions(
  state: ParserState,
  startToken: Token
): Array<Extract<Transition['condition'], { kind: 'if' }>> {
  const conditions: Array<Extract<Transition['condition'], { kind: 'if' }>> = [];

  // Each `or` branch becomes a separate transition alternative with the same
  // action tail. This keeps later normalization simple and execution-oriented.
  while (!checkWord(state, 'then') && !check(state, 'newline') && !isAtEnd(state)) {
    const condition = parseIfConditionClause(state, startToken);
    conditions.push(condition);

    if (!matchWord(state, 'or')) {
      break;
    }
  }

  return conditions.length > 0
    ? conditions
    : [{ kind: 'if', atoms: [], range: startToken.range }];
}

/** Parses one `if` condition clause, optionally wrapped in parentheses. */
function parseIfConditionClause(
  state: ParserState,
  startToken: Token
): Extract<Transition['condition'], { kind: 'if' }> {
  const openParen = matchValue(state, '(') ? previous(state) : undefined;
  const atoms: ConditionAtom[] = [];
  let conditionEnd = openParen?.range ?? startToken.range;

  // Missing tape references are not materialized here; validation fills
  // unmentioned tapes with `any`. `or` splits the condition into independent
  // transition alternatives while `and` remains a conjunction inside one
  // alternative.
  while (
    !checkWord(state, 'then') &&
    !checkWord(state, 'or') &&
    !checkValue(state, ')') &&
    !check(state, 'newline') &&
    !isAtEnd(state)
  ) {
    const atom = parseConditionAtom(state);
    if (atom) {
      atoms.push(atom);
      conditionEnd = atom.range;
    } else {
      skipUntilWordOrValueOrLine(state, ['and', 'or', 'then'], [')']);
    }

    if (!matchWord(state, 'and')) {
      break;
    }
  }

  if (openParen) {
    const closeParen = consumeValue(
      state,
      ')',
      'Expected `)` after the condition alternative.'
    );
    conditionEnd = closeParen?.range ?? conditionEnd;
  }

  if (atoms.length === 0) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_EXPECTED_CONDITION',
        'Expected at least one condition atom.',
        openParen?.range ?? tokenRange(peek(state))
      )
    );
  }

  return {
    kind: 'if',
    atoms,
    range: mergeRanges(openParen?.range ?? startToken.range, conditionEnd),
  };
}

/** Parses one readable condition atom such as `t1 = x`, `t1 in {...}`, or `any t1`. */
function parseConditionAtom(state: ParserState): ConditionAtom | undefined {
  const start = peek(state);

  // The readable form allows `any t1` as a first-class atom so users do not
  // need to switch back to compact `*` syntax inside `if` conditions.
  if (matchWord(state, 'any')) {
    const tape = parseTapeReference(state);
    if (!tape) {
      return undefined;
    }

    return {
      tape: tape.index,
      matcher: { kind: 'any', range: mergeRanges(start.range, tape.range) },
      range: mergeRanges(start.range, tape.range),
    };
  }

  const tape = parseTapeReference(state);
  if (!tape) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_EXPECTED_TAPE_REFERENCE',
        'Expected a tape reference such as `t1`.',
        tokenRange(peek(state))
      )
    );
    return undefined;
  }

  if (matchValue(state, '=')) {
    const symbol = parseSymbolToken(state, 'Expected a symbol after `=`.');
    if (!symbol) {
      return undefined;
    }

    return {
      tape: tape.index,
      matcher: { kind: 'equals', symbol: symbol.value, range: symbol.range },
      range: mergeRanges(tape.range, symbol.range),
    };
  }

  if (matchValue(state, '!=')) {
    const symbol = parseSymbolToken(state, 'Expected a symbol after `!=`.');
    if (!symbol) {
      return undefined;
    }

    return {
      tape: tape.index,
      matcher: { kind: 'notEquals', symbol: symbol.value, range: symbol.range },
      range: mergeRanges(tape.range, symbol.range),
    };
  }

  if (matchWord(state, 'in')) {
    const set = parseSymbolSet(state);
    if (!set) {
      return undefined;
    }

    return {
      tape: tape.index,
      matcher: { kind: 'in', symbols: set.symbols, range: set.range },
      range: mergeRanges(tape.range, set.range),
    };
  }

  if (matchWord(state, 'not')) {
    const notToken = previous(state);
    consumeWord(state, 'in', 'Expected `in` after `not`.');
    const set = parseSymbolSet(state);
    if (!set) {
      return undefined;
    }

    return {
      tape: tape.index,
      matcher: {
        kind: 'notIn',
        symbols: set.symbols,
        range: mergeRanges(notToken.range, set.range),
      },
      range: mergeRanges(tape.range, set.range),
    };
  }

  state.diagnostics.push(
    diagnostic(
      'PARSE_EXPECTED_CONDITION_OPERATOR',
      'Expected `=`, `!=`, `in`, or `not in` after the tape reference.',
      tokenRange(peek(state))
    )
  );
  return undefined;
}

// Read pattern elements intentionally keep complement/set forms symbolic.
// Expanding them requires the alphabet, which belongs in validation.
/** Parses one element of a compact read pattern. */
function parseReadPatternElement(state: ParserState): ReadMatcher | undefined {
  if (matchValue(state, '*')) {
    return { kind: 'any', range: previous(state).range };
  }

  if (matchValue(state, '!')) {
    const start = previous(state);
    const symbol = parseSymbolToken(state, 'Expected a symbol after `!`.');
    if (!symbol) {
      return undefined;
    }

    return {
      kind: 'notEquals',
      symbol: symbol.value,
      range: mergeRanges(start.range, symbol.range),
    };
  }

  if (checkValue(state, '{')) {
    const set = parseSymbolSet(state);
    if (!set) {
      return undefined;
    }

    return { kind: 'in', symbols: set.symbols, range: set.range };
  }

  const symbol = parseSymbolToken(state, 'Expected a read-pattern element.');
  if (!symbol) {
    return undefined;
  }

  return { kind: 'equals', symbol: symbol.value, range: symbol.range };
}
