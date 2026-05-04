import { diagnostic, mergeRanges, tokenRange } from '../ranges';
import type { StateBlock, Token } from '../types';
import { parseActionTail } from './actions';
import {
  checkWord,
  consumeNewline,
  consumeValue,
  consumeWord,
  isAtEnd,
  matchValue,
  matchWord,
  peek,
  previous,
  skipBlankLines,
  skipLine,
} from './cursor';
import {
  parseIfConditions,
  parseOnCondition,
  parseOnConditionList,
} from './conditions';
import type { ParserState } from './state';
import { parseStateNameToken } from './tokenParsers';

/** Parses a full state block, including its transition rules. */
export function parseState(state: ParserState, stateKeyword: Token) {
  const name = parseStateNameToken(state, 'Expected a state name.');
  if (!name) {
    skipLine(state);
    return;
  }

  const colon = consumeValue(state, ':', 'Expected `:` after the state name.');
  const stateBlock: StateBlock = {
    name: name.value,
    range: mergeRanges(stateKeyword.range, colon?.range ?? name.range),
    nameRange: name.range,
    transitions: [],
  };
  state.ast.states.push(stateBlock);
  consumeNewline(state);

  // State bodies run until the next `state` keyword. Indentation is intentionally
  // ignored so formatting remains cosmetic.
  while (!isAtEnd(state) && !checkWord(state, 'state')) {
    skipBlankLines(state);

    if (isAtEnd(state) || checkWord(state, 'state')) {
      break;
    }

    if (matchWord(state, 'on')) {
      parseOnTransition(state, stateBlock, previous(state));
      continue;
    }

    if (matchWord(state, 'if')) {
      parseIfTransition(state, stateBlock, previous(state));
      continue;
    }

    state.diagnostics.push(
      diagnostic(
        'PARSE_EXPECTED_RULE',
        'Expected `on` or `if` inside this state.',
        tokenRange(peek(state))
      )
    );
    skipLine(state);
  }
}

/** Parses a compact `on` transition and forwards its condition alternatives to the action parser. */
function parseOnTransition(
  state: ParserState,
  stateBlock: StateBlock,
  startToken: Token
) {
  // Bracketed `on` patterns are alternatives that share one action tail, while
  // the unbracketed form produces a single condition.
  const conditions = matchValue(state, '[')
    ? parseOnConditionList(state, startToken, previous(state))
    : [parseOnCondition(state, startToken, ['->'])];

  consumeValue(state, '->', 'Expected `->` after the read pattern.');
  parseActionTail(state, stateBlock, conditions);
}

/** Parses a readable `if` transition and forwards its condition alternatives to the action parser. */
function parseIfTransition(
  state: ParserState,
  stateBlock: StateBlock,
  startToken: Token
) {
  const conditions = parseIfConditions(state, startToken);

  consumeWord(state, 'then', 'Expected `then` after the condition.');
  parseActionTail(state, stateBlock, conditions);
}
