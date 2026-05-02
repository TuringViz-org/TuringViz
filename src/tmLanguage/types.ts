// Domain types for the TuringViz DSL. The editor layer consumes these types but
// does not own them, which keeps Monaco integration separate from parsing.
export interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  code: string;
  message: string;
  range: SourceRange;
  severity: DiagnosticSeverity;
}

export type TokenKind =
  | 'word'
  | 'number'
  | 'string'
  | 'operator'
  | 'punctuation'
  | 'newline'
  | 'eof';

export interface Token {
  kind: TokenKind;
  value: string;
  range: SourceRange;
  quoted?: boolean;
}

export type Direction = 'L' | 'R' | 'S';

// Read matchers preserve the user's compact syntax until validation can expand
// alphabet-dependent forms such as !x and not in {...}.
export type ReadMatcher =
  | { kind: 'any'; range: SourceRange }
  | { kind: 'equals'; symbol: string; range: SourceRange }
  | { kind: 'notEquals'; symbol: string; range: SourceRange }
  | { kind: 'in'; symbols: string[]; range: SourceRange }
  | { kind: 'notIn'; symbols: string[]; range: SourceRange };

export type WriteValue =
  | { kind: 'same'; range: SourceRange }
  | { kind: 'symbol'; symbol: string; range: SourceRange };

export interface ConditionAtom {
  tape: number;
  matcher: ReadMatcher;
  range: SourceRange;
}

export interface TransitionActions {
  write?: WriteValue[];
  move?: Direction[];
  moveRange?: SourceRange;
  goto?: string;
  gotoRange?: SourceRange;
  // The complete action span is kept even when individual actions are omitted,
  // because validation reports missing required actions against this range.
  range: SourceRange;
}

export interface Transition {
  id: string;
  from: string;
  // Both compact `on` rules and readable `if` rules describe the same logical
  // read condition; validation normalizes them into one matcher list per tape.
  condition:
    | { kind: 'on'; read: ReadMatcher[]; range: SourceRange }
    | { kind: 'if'; atoms: ConditionAtom[]; range: SourceRange };
  actions: TransitionActions;
  range: SourceRange;
}

export interface StateBlock {
  name: string;
  range: SourceRange;
  nameRange: SourceRange;
  transitions: Transition[];
}

export interface HeaderField<TValue> {
  value: TValue;
  range: SourceRange;
}

export interface InputSegment {
  value: string;
  range: SourceRange;
}

export interface ProgramAst {
  header: {
    // Header values intentionally preserve source ranges so duplicate, missing,
    // and cross-reference diagnostics can point back to user-authored text.
    tapes?: HeaderField<number>;
    blank?: HeaderField<string>;
    alphabet?: HeaderField<string[]>;
    input?: HeaderField<InputSegment[]>;
    start?: HeaderField<string>;
  };
  states: StateBlock[];
}

// Normalized transitions are the small execution-oriented representation that
// Load prints to the console. At this point defaults such as same writes and
// missing gotos have already been applied.
export interface NormalizedTransition {
  from: string;
  to: string;
  read: Array<string[] | 'any'>;
  write: string[];
  move: Direction[];
}

export interface MachineProgram {
  tapes: number;
  blank: string;
  // Empty when the optional alphabet header is omitted.
  alphabet: string[];
  input: string[];
  start: string;
  states: string[];
  transitions: NormalizedTransition[];
}

export interface ParseResult {
  ast: ProgramAst;
  tokens: Token[];
  diagnostics: Diagnostic[];
  machine?: MachineProgram;
}
