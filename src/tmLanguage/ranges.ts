import type { Diagnostic, SourcePosition, SourceRange, Token } from './types';

// The lexer, parser, validation layer, and Monaco markers all speak in the same
// 1-based source ranges. These helpers keep range construction consistent.
export function createPosition(
  offset: number,
  line: number,
  column: number,
): SourcePosition {
  return { offset, line, column };
}

export function createRange(
  start: SourcePosition,
  end: SourcePosition,
): SourceRange {
  return { start, end };
}

export function mergeRanges(first: SourceRange, second: SourceRange): SourceRange {
  return { start: first.start, end: second.end };
}

// Parser recovery often reports the current token directly, so this helper keeps
// those diagnostics readable at call sites.
export function tokenRange(token: Token): SourceRange {
  return token.range;
}

export function emptyRangeAt(position: SourcePosition): SourceRange {
  return {
    start: position,
    end: { ...position, column: position.column + 1 },
  };
}

export function diagnostic(
  code: string,
  message: string,
  range: SourceRange,
): Diagnostic {
  return { code, message, range, severity: 'error' };
}

export function containsPosition(
  range: SourceRange,
  line: number,
  column: number,
): boolean {
  if (line < range.start.line || line > range.end.line) {
    return false;
  }

  if (line === range.start.line && column < range.start.column) {
    return false;
  }

  if (line === range.end.line && column > range.end.column) {
    return false;
  }

  return true;
}
