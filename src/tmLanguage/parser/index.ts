import { HEADER_KEYWORDS } from '../constants';
import { lex } from '../lexer';
import { diagnostic, tokenRange } from '../ranges';
import type { Diagnostic, ProgramAst } from '../types';
import { parseHeaderLine } from './header';
import {
  check,
  checkWord,
  isAtEnd,
  matchWord,
  peek,
  previous,
  skipBlankLines,
  skipLine,
} from './cursor';
import { parseState } from './states';
import type { ParserState } from './state';

/** Parses source text into a syntax AST, token list, and recoverable parser diagnostics. */
export function parseSyntax(source: string): {
  ast: ProgramAst;
  tokens: ReturnType<typeof lex>['tokens'];
  diagnostics: Diagnostic[];
} {
  const lexed = lex(source);
  const state: ParserState = {
    tokens: lexed.tokens,
    current: 0,
    diagnostics: [...lexed.diagnostics],
    ast: { header: {}, states: [] },
    transitionId: 0,
  };

  // Top-level syntax is line-oriented: header declarations first by convention,
  // then any number of state blocks. Semantic ordering checks happen later.
  while (!isAtEnd(state)) {
    skipBlankLines(state);

    if (isAtEnd(state)) {
      break;
    }

    if (matchWord(state, 'state')) {
      parseState(state, previous(state));
      continue;
    }

    if (peek(state).kind === 'word' && HEADER_KEYWORDS.has(peek(state).value)) {
      parseHeaderLine(state);
      continue;
    }

    state.diagnostics.push(
      diagnostic(
        'PARSE_EXPECTED_TOP_LEVEL',
        'Expected a header declaration or a state block.',
        tokenRange(peek(state))
      )
    );
    skipLine(state);
  }

  return {
    ast: state.ast,
    tokens: lexed.tokens.filter((token) => token.kind !== 'eof'),
    diagnostics: state.diagnostics,
  };
}
