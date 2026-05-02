import { diagnostic, emptyRangeAt } from './ranges';
import type { Diagnostic, SourcePosition, Token } from './types';

// The lexer is deliberately small: it removes comments and whitespace, keeps
// line breaks as tokens for the line-oriented parser, and reports lexical errors
// without trying to understand higher-level grammar.
interface LexerState {
  index: number;
  line: number;
  column: number;
  tokens: Token[];
  diagnostics: Diagnostic[];
}

const TWO_CHAR_OPERATORS = new Set(['->', '!=']);
const PUNCTUATION = new Set([
  '{',
  '}',
  '[',
  ']',
  '(',
  ')',
  ',',
  '/',
  '|',
  ':',
  ';',
  '=',
  '!',
  '*',
  '#',
]);

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export function lex(source: string): LexResult {
  const state: LexerState = {
    index: 0,
    line: 1,
    column: 1,
    tokens: [],
    diagnostics: [],
  };

  while (!isAtEnd(source, state)) {
    const char = current(source, state);

    // Whitespace inside a line is not semantically meaningful for this DSL.
    if (char === ' ' || char === '\t' || char === '\r') {
      advance(source, state);
      continue;
    }

    if (char === '\n') {
      addToken(state, 'newline', '\n', snapshot(state), advance(source, state));
      continue;
    }

    if (char === '-' && peek(source, state) === '-') {
      // Comments are not emitted as trivia tokens because no downstream feature
      // currently needs to preserve or format them.
      skipLineComment(source, state);
      continue;
    }

    if (
      char === '/' &&
      peek(source, state) === '*' &&
      startsBlockComment(source, state)
    ) {
      skipBlockComment(source, state);
      continue;
    }

    if (char === '"') {
      readString(source, state);
      continue;
    }

    if (isWordStart(char)) {
      readWord(source, state);
      continue;
    }

    if (isDigit(char)) {
      readNumber(source, state);
      continue;
    }

    const twoChar = char + peek(source, state);
    if (TWO_CHAR_OPERATORS.has(twoChar)) {
      const start = snapshot(state);
      advance(source, state);
      const end = advance(source, state);
      addToken(state, 'operator', twoChar, start, end);
      continue;
    }

    if (PUNCTUATION.has(char)) {
      const start = snapshot(state);
      addToken(state, 'punctuation', char, start, advance(source, state));
      continue;
    }

    const start = snapshot(state);
    state.diagnostics.push(
      diagnostic(
        'LEX_UNKNOWN_CHARACTER',
        `Unexpected character '${char}'.`,
        emptyRangeAt(start),
      ),
    );
    advance(source, state);
  }

  const eof = snapshot(state);
  state.tokens.push({
    kind: 'eof',
    value: '',
    range: { start: eof, end: eof },
  });

  return { tokens: state.tokens, diagnostics: state.diagnostics };
}

function readWord(source: string, state: LexerState) {
  const start = snapshot(state);
  let value = '';

  while (!isAtEnd(source, state) && isWordPart(current(source, state))) {
    value += current(source, state);
    advance(source, state);
  }

  addToken(state, 'word', value, start, snapshot(state));
}

function readNumber(source: string, state: LexerState) {
  const start = snapshot(state);
  let value = '';

  while (!isAtEnd(source, state) && isDigit(current(source, state))) {
    value += current(source, state);
    advance(source, state);
  }

  addToken(state, 'number', value, start, snapshot(state));
}

function readString(source: string, state: LexerState) {
  const start = snapshot(state);
  advance(source, state);

  let value = '';
  while (!isAtEnd(source, state) && current(source, state) !== '"') {
    if (current(source, state) === '\n') {
      state.diagnostics.push(
        diagnostic(
          'LEX_UNTERMINATED_STRING',
          'String literals must end before the line break.',
          { start, end: snapshot(state) },
        ),
      );
      addToken(state, 'string', value, start, snapshot(state), true);
      return;
    }

    // Strings support escaped characters only enough to keep the scanner from
    // treating an escaped quote as the end of the literal.
    if (current(source, state) === '\\') {
      advance(source, state);
      if (isAtEnd(source, state)) {
        break;
      }
    }

    value += current(source, state);
    advance(source, state);
  }

  if (isAtEnd(source, state)) {
    state.diagnostics.push(
      diagnostic(
        'LEX_UNTERMINATED_STRING',
        'String literals must be closed with a double quote.',
        { start, end: snapshot(state) },
      ),
    );
    addToken(state, 'string', value, start, snapshot(state), true);
    return;
  }

  advance(source, state);
  addToken(state, 'string', value, start, snapshot(state), true);
}

function skipLineComment(source: string, state: LexerState) {
  while (!isAtEnd(source, state) && current(source, state) !== '\n') {
    advance(source, state);
  }
}

function skipBlockComment(source: string, state: LexerState) {
  const start = snapshot(state);
  // Consume the opening delimiter before scanning for the closing one.
  advance(source, state);
  advance(source, state);

  while (!isAtEnd(source, state)) {
    if (current(source, state) === '*' && peek(source, state) === '/') {
      advance(source, state);
      advance(source, state);
      return;
    }

    advance(source, state);
  }

  state.diagnostics.push(
    diagnostic(
      'LEX_UNTERMINATED_BLOCK_COMMENT',
      'Block comments must be closed with */.',
      { start, end: snapshot(state) },
    ),
  );
}

function startsBlockComment(source: string, state: LexerState): boolean {
  if (state.index === 0) {
    return true;
  }

  // Read patterns use slash separators, so `1/*` must mean "1 then wildcard",
  // not the start of a block comment. Require whitespace or start-of-file.
  const previous = source[state.index - 1];
  return previous === '\n' || previous === '\r' || previous === ' ' || previous === '\t';
}

function addToken(
  state: LexerState,
  kind: Token['kind'],
  value: string,
  start: SourcePosition,
  end: SourcePosition,
  quoted = false,
) {
  state.tokens.push({
    kind,
    value,
    range: { start, end },
    quoted,
  });
}

function advance(source: string, state: LexerState): SourcePosition {
  const char = source[state.index];
  state.index += 1;

  if (char === '\n') {
    state.line += 1;
    state.column = 1;
  } else {
    state.column += 1;
  }

  return snapshot(state);
}

function snapshot(state: LexerState): SourcePosition {
  return {
    offset: state.index,
    line: state.line,
    column: state.column,
  };
}

function current(source: string, state: LexerState): string {
  return source[state.index] ?? '';
}

function peek(source: string, state: LexerState): string {
  return source[state.index + 1] ?? '';
}

function isAtEnd(source: string, state: LexerState): boolean {
  return state.index >= source.length;
}

function isWordStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isWordPart(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function isDigit(char: string): boolean {
  return /[0-9]/.test(char);
}
