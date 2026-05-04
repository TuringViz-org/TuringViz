import { diagnostic, mergeRanges, tokenRange } from '../ranges';
import type { InputSegment, ProgramAst, SourceRange } from '../types';
import {
  check,
  checkValue,
  consumeKind,
  consumeNewline,
  consumeValue,
  isAtEnd,
  matchValue,
  peek,
  skipLine,
  skipUntilValueOrLine,
} from './cursor';
import type { AnyHeaderField, HeaderKey, ParserState } from './state';
import { parseStateNameToken, parseSymbolToken } from './tokenParsers';

/** Parses one complete top-level header declaration and stores it in the AST. */
export function parseHeaderLine(state: ParserState) {
  const keyword = consumeKind(state, 'word', 'Expected a header declaration.');
  if (!keyword) {
    return;
  }

  consumeValue(state, ':', `Expected \`:\` after \`${keyword.value}\`.`);

  switch (keyword.value) {
    case 'tapes':
      parseTapesHeader(state, keyword.range);
      break;
    case 'blank':
      parseBlankHeader(state, keyword.range);
      break;
    case 'alphabet':
      parseAlphabetHeader(state, keyword.range);
      break;
    case 'input':
      parseInputHeader(state, keyword.range);
      break;
    case 'start':
      parseStartHeader(state, keyword.range);
      break;
    default:
      break;
  }

  if (!check(state, 'newline') && !check(state, 'eof')) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_TRAILING_HEADER_TOKENS',
        'Unexpected tokens after this header declaration.',
        tokenRange(peek(state))
      )
    );
    skipLine(state);
  }

  consumeNewline(state);
}

// Header parsers collect raw values and ranges only. They do not check whether
// values make sense together, because that requires global context.
/** Parses the numeric tape-count header value. */
function parseTapesHeader(state: ParserState, startRange: SourceRange) {
  const count = consumeKind(state, 'number', 'Expected a tape count.');
  if (!count) {
    return;
  }

  setHeaderField(state, 'tapes', {
    value: Number.parseInt(count.value, 10),
    range: mergeRanges(startRange, count.range),
  });
}

/** Parses the single blank-symbol header value. */
function parseBlankHeader(state: ParserState, startRange: SourceRange) {
  const symbol = parseSymbolToken(state, 'Expected a blank symbol.');
  if (!symbol) {
    return;
  }

  setHeaderField(state, 'blank', {
    value: symbol.value,
    range: mergeRanges(startRange, symbol.range),
  });
}

/** Parses the alphabet header's comma-separated symbol set. */
function parseAlphabetHeader(state: ParserState, startRange: SourceRange) {
  const open = consumeValue(state, '{', 'Expected `{` after `alphabet`.');
  if (!open) {
    return;
  }

  const symbols: string[] = [];
  let endRange = open.range;

  while (!checkValue(state, '}') && !check(state, 'newline') && !isAtEnd(state)) {
    const symbol = parseSymbolToken(state, 'Expected an alphabet symbol.');
    if (!symbol) {
      skipUntilValueOrLine(state, [',', '}']);
    } else {
      symbols.push(symbol.value);
      endRange = symbol.range;
    }

    if (!matchValue(state, ',')) {
      break;
    }
  }

  const close = consumeValue(state, '}', 'Expected `}` after alphabet symbols.');
  if (close) {
    endRange = close.range;
  }

  setHeaderField(state, 'alphabet', {
    value: symbols,
    range: mergeRanges(startRange, endRange),
  });
}

/** Parses one or more quoted input segments separated by tape delimiters. */
function parseInputHeader(state: ParserState, startRange: SourceRange) {
  const segments: InputSegment[] = [];
  let endRange = startRange;

  if (check(state, 'newline') || check(state, 'eof')) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_UNEXPECTED_TOKEN',
        'Expected an input string.',
        tokenRange(peek(state))
      )
    );
  }

  while (!check(state, 'newline') && !isAtEnd(state)) {
    const segment = consumeKind(state, 'string', 'Expected an input string.');
    if (!segment) {
      break;
    }

    segments.push({ value: segment.value, range: segment.range });
    endRange = segment.range;

    if (!matchValue(state, '|')) {
      break;
    }
  }

  setHeaderField(state, 'input', {
    value: segments,
    range: mergeRanges(startRange, endRange),
  });
}

/** Parses the start-state header value. */
function parseStartHeader(state: ParserState, startRange: SourceRange) {
  const name = parseStateNameToken(state, 'Expected a start state name.');
  if (!name) {
    return;
  }

  setHeaderField(state, 'start', {
    value: name.value,
    range: mergeRanges(startRange, name.range),
  });
}

/** Stores a header field and reports duplicates without discarding the later value. */
function setHeaderField<TKey extends HeaderKey>(
  state: ParserState,
  key: TKey,
  field: AnyHeaderField
) {
  if (state.ast.header[key]) {
    state.diagnostics.push(
      diagnostic(
        'PARSE_DUPLICATE_HEADER',
        `Duplicate \`${key}\` header. Only one declaration is allowed.`,
        field.range
      )
    );
  }

  // TypeScript cannot narrow an indexed optional union here, so assignment is
  // explicit per key while the caller still gets a generic helper.
  switch (key) {
    case 'tapes':
      state.ast.header.tapes = field as ProgramAst['header']['tapes'];
      break;
    case 'blank':
      state.ast.header.blank = field as ProgramAst['header']['blank'];
      break;
    case 'alphabet':
      state.ast.header.alphabet = field as ProgramAst['header']['alphabet'];
      break;
    case 'input':
      state.ast.header.input = field as ProgramAst['header']['input'];
      break;
    case 'start':
      state.ast.header.start = field as ProgramAst['header']['start'];
      break;
  }
}
