import { diagnostic, mergeRanges, tokenRange } from '../ranges';
import type {
  Direction,
  SourceRange,
  StateBlock,
  Transition,
  TransitionActions,
  WriteValue,
} from '../types';
import {
  check,
  checkValue,
  consumeNewline,
  consumeValue,
  isAtEnd,
  matchValue,
  matchWord,
  peek,
  previous,
  rejectTrailingRuleTokens,
  skipBlankLines,
  skipLine,
  skipUntilValueOrLine,
  advance,
} from './cursor';
import type { ParserState } from './state';
import { parseStateNameToken, parseSymbolToken } from './tokenParsers';

/** Parses the action tail after an `on` or `if` condition and emits transitions. */
export function parseActionTail(
  state: ParserState,
  stateBlock: StateBlock,
  conditions: Transition['condition'][]
) {
  // `choose` and condition alternatives are syntactic sugar: every resulting
  // condition/action pair becomes an independent transition.
  if (matchWord(state, 'choose')) {
    parseChooseBlock(state, stateBlock, conditions);
    return;
  }

  const actions = parseActionLine(state);
  if (actions) {
    addTransitions(state, stateBlock, conditions, actions);
  }
  consumeNewline(state);
}

/** Parses a `choose { ... }` block of nondeterministic action alternatives. */
function parseChooseBlock(
  state: ParserState,
  stateBlock: StateBlock,
  conditions: Transition['condition'][]
) {
  // `choose` groups nondeterministic action alternatives. Every line inside the
  // block is paired with every parsed condition alternative.
  consumeValue(state, '{', 'Expected `{` after `choose`.');
  consumeNewline(state);

  while (!checkValue(state, '}') && !isAtEnd(state)) {
    skipBlankLines(state);
    if (checkValue(state, '}') || isAtEnd(state)) {
      break;
    }

    const actions = parseActionLine(state);
    if (actions) {
      addTransitions(state, stateBlock, conditions, actions);
    }
    consumeNewline(state);
  }

  consumeValue(state, '}', 'Expected `}` to close the choose block.');
  rejectTrailingRuleTokens(state);
  consumeNewline(state);
}

/** Adds one transition for each parsed condition alternative. */
function addTransitions(
  state: ParserState,
  stateBlock: StateBlock,
  conditions: Transition['condition'][],
  actions: TransitionActions
) {
  // Action objects are immutable after parsing, so sharing one parsed action
  // tail across multiple condition alternatives is safe.
  for (const condition of conditions) {
    addTransition(state, stateBlock, condition, actions);
  }
}

/** Appends a single AST transition to the current state block. */
function addTransition(
  state: ParserState,
  stateBlock: StateBlock,
  condition: Transition['condition'],
  actions: TransitionActions
) {
  stateBlock.transitions.push({
    id: `${stateBlock.name}:${state.transitionId++}`,
    from: stateBlock.name,
    condition,
    actions,
    range: mergeRanges(condition.range, actions.range),
  });
}

/** Parses a semicolon-terminated line of transition actions. */
function parseActionLine(state: ParserState): TransitionActions | undefined {
  const start = peek(state);
  const actions: TransitionActions = {
    range: start.range,
  };
  let sawAction = false;
  let reportedExpectedAction = false;
  let endRange = start.range;

  // Action order is flexible. Duplicates are reported, but the parser still
  // consumes the full line so the editor can keep showing later diagnostics.
  while (!check(state, 'newline') && !checkValue(state, '}') && !isAtEnd(state)) {
    if (matchWord(state, 'write')) {
      const keyword = previous(state);
      if (actions.write) {
        state.diagnostics.push(
          diagnostic(
            'PARSE_DUPLICATE_WRITE',
            'A transition may contain only one write action.',
            keyword.range
          )
        );
      }
      const values = parseWritePattern(state);
      consumeValue(state, ';', 'Expected `;` after the write action.');
      actions.write = values;
      sawAction = true;
      endRange = previous(state).range;
      continue;
    }

    if (matchWord(state, 'move')) {
      const keyword = previous(state);
      if (actions.move) {
        state.diagnostics.push(
          diagnostic(
            'PARSE_DUPLICATE_MOVE',
            'A transition may contain only one move action.',
            keyword.range
          )
        );
      }
      const directions = parseMovePattern(state);
      const semicolon = consumeValue(
        state,
        ';',
        'Expected `;` after the move action.'
      );
      actions.move = directions.map((direction) => direction.value);
      actions.moveRange = mergeRanges(
        keyword.range,
        semicolon?.range ?? previous(state).range
      );
      sawAction = true;
      endRange = previous(state).range;
      continue;
    }

    if (matchWord(state, 'goto')) {
      const keyword = previous(state);
      if (actions.goto) {
        state.diagnostics.push(
          diagnostic(
            'PARSE_DUPLICATE_GOTO',
            'A transition may contain only one goto action.',
            keyword.range
          )
        );
      }
      const target = parseStateNameToken(state, 'Expected a target state name.');
      const semicolon = consumeValue(
        state,
        ';',
        'Expected `;` after the goto action.'
      );
      if (target) {
        actions.goto = target.value;
        actions.gotoRange = mergeRanges(
          keyword.range,
          semicolon?.range ?? target.range
        );
      }
      sawAction = true;
      endRange = previous(state).range;
      continue;
    }

    state.diagnostics.push(
      diagnostic(
        'PARSE_EXPECTED_ACTION',
        'Expected `write`, `move`, or `goto`.',
        tokenRange(peek(state))
      )
    );
    reportedExpectedAction = true;
    skipLine(state);
    break;
  }

  actions.range = mergeRanges(start.range, endRange);
  if (!sawAction && !reportedExpectedAction) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_EXPECTED_ACTION',
        'Expected `write`, `move`, or `goto`.',
        tokenRange(start)
      )
    );
  }

  return sawAction ? actions : undefined;
}

/** Parses a `/`-separated write pattern into explicit write values. */
function parseWritePattern(state: ParserState): WriteValue[] {
  const values: WriteValue[] = [];

  // `same` is represented explicitly instead of being lowered to a symbol, so
  // validation can distinguish "write the current value" from writing text.
  while (!checkValue(state, ';') && !check(state, 'newline') && !isAtEnd(state)) {
    if (matchWord(state, 'same')) {
      values.push({ kind: 'same', range: previous(state).range });
    } else {
      const symbol = parseSymbolToken(state, 'Expected `same` or a symbol.');
      if (symbol) {
        values.push({ kind: 'symbol', symbol: symbol.value, range: symbol.range });
      } else {
        skipUntilValueOrLine(state, ['/', ';']);
      }
    }

    if (!matchValue(state, '/')) {
      break;
    }
  }

  return values;
}

/** Parses a `/`-separated move pattern and records invalid directions as diagnostics. */
function parseMovePattern(
  state: ParserState
): Array<{ value: Direction; range: SourceRange }> {
  const directions: Array<{ value: Direction; range: SourceRange }> = [];

  // Invalid directions are consumed as part of the pattern so one bad item does
  // not prevent diagnostics for the rest of the line.
  while (!checkValue(state, ';') && !check(state, 'newline') && !isAtEnd(state)) {
    const token = advance(state);
    if (token.value === 'L' || token.value === 'R' || token.value === 'S') {
      directions.push({ value: token.value, range: token.range });
    } else {
      state.diagnostics.push(
        diagnostic(
          'PARSE_INVALID_DIRECTION',
          'Expected a move direction: `L`, `R`, or `S`.',
          token.range
        )
      );
    }

    if (!matchValue(state, '/')) {
      break;
    }
  }

  return directions;
}
