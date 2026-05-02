import { diagnostic } from './ranges';
import type {
  ConditionAtom,
  Diagnostic,
  MachineProgram,
  NormalizedTransition,
  ProgramAst,
  ReadMatcher,
  SourceRange,
  Transition,
  WriteValue,
} from './types';

// Validation is the semantic half of the language pipeline. It checks rules that
// need global context, then produces the normalized machine representation used
// by the Load button.
export function validateAndNormalize(ast: ProgramAst): {
  diagnostics: Diagnostic[];
  machine?: MachineProgram;
} {
  const diagnostics: Diagnostic[] = [];
  const tapes = ast.header.tapes?.value;
  const blank = ast.header.blank?.value;
  const alphabet = ast.header.alphabet?.value;
  const input = ast.header.input?.value;
  const start = ast.header.start?.value;

  // Missing headers are reported before deeper checks so users get a stable
  // diagnostic even when later validation cannot run completely.
  requireHeader(ast, diagnostics, 'tapes', '`tapes` header is required.');
  requireHeader(ast, diagnostics, 'blank', '`blank` header is required.');
  requireHeader(ast, diagnostics, 'input', '`input` header is required.');
  requireHeader(ast, diagnostics, 'start', '`start` header is required.');

  if (tapes !== undefined && (tapes < 1 || tapes > 6)) {
    diagnostics.push(
      diagnostic(
        'VALIDATION_TAPES_RANGE',
        '`tapes` must be between 1 and 6.',
        ast.header.tapes!.range,
      ),
    );
  }

  const alphabetSet = new Set(alphabet ?? []);
  if (blank !== undefined) {
    // Even without an alphabet header, symbols still have the DSL-level
    // constraint of being exactly one user-visible character.
    validateSymbolLength(
      blank,
      ast.header.blank!.range,
      diagnostics,
      'Blank symbol',
    );
  }

  if (alphabet) {
    for (const symbol of alphabet) {
      validateSymbolLength(
        symbol,
        ast.header.alphabet!.range,
        diagnostics,
        'Alphabet symbol',
      );

      const occurrences = alphabet.filter((candidate) => candidate === symbol);
      if (occurrences.length > 1) {
        diagnostics.push(
          diagnostic(
            'VALIDATION_DUPLICATE_ALPHABET_SYMBOL',
            `Alphabet symbol \`${symbol}\` is declared more than once.`,
            ast.header.alphabet!.range,
          ),
        );
        break;
      }
    }
  }

  if (blank !== undefined && alphabet && !alphabetSet.has(blank)) {
    diagnostics.push(
      diagnostic(
        'VALIDATION_BLANK_NOT_IN_ALPHABET',
        `Blank symbol \`${blank}\` must be part of the alphabet.`,
        ast.header.blank!.range,
      ),
    );
  }

  if (input && tapes !== undefined && input.length > tapes) {
    diagnostics.push(
      diagnostic(
        'VALIDATION_INPUT_TAPE_COUNT',
        `Input declares ${input.length} segment(s), but \`tapes\` is ${tapes}. Omitted tapes are allowed; extra tapes are not.`,
        ast.header.input!.range,
      ),
    );
  }

  if (input && alphabet) {
    for (const segment of input) {
      // Input strings are treated as sequences of single-character tape symbols;
      // multi-character symbols are intentionally not part of this DSL.
      for (const symbol of segment.value) {
        if (!alphabetSet.has(symbol)) {
          diagnostics.push(
            diagnostic(
              'VALIDATION_INPUT_SYMBOL',
              `Input symbol \`${symbol}\` is not part of the alphabet.`,
              segment.range,
            ),
          );
        }
      }
    }
  }

  const stateNames = new Set<string>();
  const duplicateStates = new Set<string>();
  for (const state of ast.states) {
    // Duplicate states still contribute their transitions to syntax features,
    // but they are excluded from executable normalization below.
    if (stateNames.has(state.name)) {
      duplicateStates.add(state.name);
      diagnostics.push(
        diagnostic(
          'VALIDATION_DUPLICATE_STATE',
          `State \`${state.name}\` is declared more than once.`,
          state.nameRange,
        ),
      );
    }
    stateNames.add(state.name);
  }

  if (start !== undefined && !stateNames.has(start)) {
    diagnostics.push(
      diagnostic(
        'VALIDATION_UNKNOWN_START_STATE',
        `Start state \`${start}\` is not declared.`,
        ast.header.start!.range,
      ),
    );
  }

  const transitions: NormalizedTransition[] = [];

  // Transition validation and normalization happen in one pass so the final
  // machine is ready when no errors were reported.
  for (const state of ast.states) {
    for (const transition of state.transitions) {
      validateTransition(
        transition,
        diagnostics,
        stateNames,
        alphabetSet,
        alphabet,
        tapes,
      );

      if (
        tapes !== undefined &&
        blank !== undefined &&
        !duplicateStates.has(state.name)
      ) {
        // Normalization is intentionally optimistic during this pass; the final
        // machine is returned only if no error diagnostics exist.
        transitions.push(normalizeTransition(transition, tapes, alphabet ?? []));
      }
    }
  }

  if (
    diagnostics.some((item) => item.severity === 'error') ||
    tapes === undefined ||
    blank === undefined ||
    !input ||
    start === undefined
  ) {
    return { diagnostics };
  }

  return {
    diagnostics,
    machine: {
      tapes,
      blank,
      alphabet: alphabet ?? [],
      input: normalizeInput(input.map((segment) => segment.value), tapes, blank),
      start,
      states: ast.states.map((state) => state.name),
      transitions,
    },
  };
}

function normalizeInput(input: string[], tapes: number, blank: string): string[] {
  // The DSL allows fewer input segments than tapes; omitted tapes start on blank.
  return [
    ...input,
    ...Array.from({ length: tapes - input.length }, () => blank),
  ];
}

function requireHeader(
  ast: ProgramAst,
  diagnostics: Diagnostic[],
  key: keyof ProgramAst['header'],
  message: string,
) {
  if (ast.header[key]) {
    return;
  }

  // When a required header is missing there is no exact token to mark. Point to
  // the first useful program range so Monaco can still surface the error.
  const fallbackRange =
    ast.states[0]?.range ??
    ast.header.start?.range ??
    ast.header.input?.range ??
    ast.header.alphabet?.range ??
    ast.header.blank?.range ??
    ast.header.tapes?.range;

  if (fallbackRange) {
    diagnostics.push(diagnostic('VALIDATION_MISSING_HEADER', message, fallbackRange));
  }
}

function validateTransition(
  transition: Transition,
  diagnostics: Diagnostic[],
  stateNames: Set<string>,
  alphabetSet: Set<string>,
  alphabet: string[] | undefined,
  tapes: number | undefined,
) {
  // `if` rules mention only constrained tapes. Convert them to the same matcher
  // shape as compact `on` rules before applying common validation.
  const readMatchers =
    transition.condition.kind === 'on'
      ? transition.condition.read
      : matchersFromConditionAtoms(
          transition.condition.atoms,
          tapes,
          transition.condition.range,
        );

  if (tapes !== undefined) {
    if (transition.condition.kind === 'on' && readMatchers.length !== tapes) {
      diagnostics.push(
        diagnostic(
          'VALIDATION_READ_PATTERN_ARITY',
          `Read pattern has ${readMatchers.length} item(s), but \`tapes\` is ${tapes}.`,
          transition.condition.range,
        ),
      );
    }

    if (transition.actions.write && transition.actions.write.length !== tapes) {
      diagnostics.push(
        diagnostic(
          'VALIDATION_WRITE_PATTERN_ARITY',
          `Write pattern has ${transition.actions.write.length} item(s), but \`tapes\` is ${tapes}.`,
          transition.actions.range,
        ),
      );
    }

    if (transition.actions.move && transition.actions.move.length !== tapes) {
      diagnostics.push(
        diagnostic(
          'VALIDATION_MOVE_PATTERN_ARITY',
          `Move pattern has ${transition.actions.move.length} item(s), but \`tapes\` is ${tapes}.`,
          transition.actions.moveRange ?? transition.actions.range,
        ),
      );
    }
  }

  if (!transition.actions.move) {
    // Writes and gotos have defaults, but moves do not: every transition must
    // describe how each head advances or stays.
    diagnostics.push(
      diagnostic(
        'VALIDATION_MISSING_MOVE',
        'Every transition must contain a move action.',
        transition.actions.range,
      ),
    );
  }

  if (transition.actions.goto && !stateNames.has(transition.actions.goto)) {
    diagnostics.push(
      diagnostic(
        'VALIDATION_UNKNOWN_GOTO',
        `Target state \`${transition.actions.goto}\` is not declared.`,
        transition.actions.gotoRange ?? transition.actions.range,
      ),
    );
  }

  if (transition.condition.kind === 'if') {
    for (const atom of transition.condition.atoms) {
      validateTapeReference(atom, diagnostics, tapes);
    }
  }

  for (const matcher of readMatchers) {
    validateMatcher(matcher, diagnostics, alphabetSet, alphabet);
  }

  for (const value of transition.actions.write ?? []) {
    if (value.kind === 'symbol') {
      validateSymbol(value.symbol, value.range, diagnostics, alphabetSet, alphabet);
    }
  }
}

function validateTapeReference(
  atom: ConditionAtom,
  diagnostics: Diagnostic[],
  tapes: number | undefined,
) {
  if (tapes === undefined) {
    return;
  }

  if (atom.tape < 1 || atom.tape > tapes) {
    diagnostics.push(
      diagnostic(
        'VALIDATION_TAPE_REFERENCE_RANGE',
        `Tape reference \`t${atom.tape}\` is outside the configured tape range.`,
        atom.range,
      ),
    );
  }
}

function validateMatcher(
  matcher: ReadMatcher,
  diagnostics: Diagnostic[],
  alphabetSet: Set<string>,
  alphabet: string[] | undefined,
) {
  if (matcher.kind === 'any') {
    return;
  }

  // Complement forms need a known alphabet to know which symbols remain.
  if ((matcher.kind === 'notEquals' || matcher.kind === 'notIn') && !alphabet) {
    diagnostics.push(
      diagnostic(
        'VALIDATION_COMPLEMENT_REQUIRES_ALPHABET',
        'Complement patterns require an `alphabet` header.',
        matcher.range,
      ),
    );
  }

  const symbols =
    matcher.kind === 'in' || matcher.kind === 'notIn'
      ? matcher.symbols
      : [matcher.symbol];

  for (const symbol of symbols) {
    validateSymbol(symbol, matcher.range, diagnostics, alphabetSet, alphabet);
  }
}

function validateSymbol(
  symbol: string,
  range: SourceRange,
  diagnostics: Diagnostic[],
  alphabetSet: Set<string>,
  alphabet: string[] | undefined,
) {
  validateSymbolLength(symbol, range, diagnostics, 'Symbol');

  // Without an alphabet header the language accepts any one-character symbol,
  // except complement patterns which are rejected before this point.
  if (!alphabet) {
    return;
  }

  if (!alphabetSet.has(symbol)) {
    diagnostics.push(
      diagnostic(
        'VALIDATION_SYMBOL_NOT_IN_ALPHABET',
        `Symbol \`${symbol}\` is not part of the alphabet.`,
        range,
      ),
    );
  }
}

function validateSymbolLength(
  symbol: string,
  range: SourceRange,
  diagnostics: Diagnostic[],
  label: string,
) {
  if (Array.from(symbol).length === 1) {
    return;
  }

  diagnostics.push(
    diagnostic(
      'VALIDATION_SYMBOL_LENGTH',
      `${label} \`${symbol}\` must be exactly one character.`,
      range,
    ),
  );
}

function normalizeTransition(
  transition: Transition,
  tapes: number,
  alphabet: string[],
): NormalizedTransition {
  // At this boundary the AST stops being source-oriented and becomes the shape
  // a simulator can execute directly.
  const read =
    transition.condition.kind === 'on'
      ? transition.condition.read
      : matchersFromConditionAtoms(
          transition.condition.atoms,
          tapes,
          transition.condition.range,
        );

  // Missing write means same on all tapes; missing goto means stay in state.
  const write = transition.actions.write
    ? transition.actions.write.map((value) => normalizeWriteValue(value))
    : Array.from({ length: tapes }, () => 'same');

  return {
    from: transition.from,
    to: transition.actions.goto ?? transition.from,
    read: read.map((matcher) => normalizeMatcher(matcher, alphabet)),
    write,
    move: transition.actions.move ?? Array.from({ length: tapes }, () => 'S'),
  };
}

function matchersFromConditionAtoms(
  atoms: ConditionAtom[],
  tapes: number | undefined,
  fallbackRange: SourceRange,
): ReadMatcher[] {
  // Any tape not constrained by an `if` atom is semantically `any`.
  const knownTapes = tapes ?? Math.max(0, ...atoms.map((atom) => atom.tape));
  const matchers: ReadMatcher[] = Array.from({ length: knownTapes }, (_, index) => ({
    kind: 'any',
    range: atoms[index]?.range ?? atoms[0]?.range ?? fallbackRange,
  }));

  for (const atom of atoms) {
    if (atom.tape >= 1 && atom.tape <= knownTapes) {
      matchers[atom.tape - 1] = atom.matcher;
    }
  }

  return matchers;
}

function normalizeMatcher(
  matcher: ReadMatcher,
  alphabet: string[],
): Array<string> | 'any' {
  // Expand complement and set matchers so consumers do not need to know DSL
  // syntax details.
  switch (matcher.kind) {
    case 'any':
      return 'any';
    case 'equals':
      return [matcher.symbol];
    case 'notEquals':
      return alphabet.filter((symbol) => symbol !== matcher.symbol);
    case 'in':
      return matcher.symbols;
    case 'notIn':
      return alphabet.filter((symbol) => !matcher.symbols.includes(symbol));
  }
}

function normalizeWriteValue(value: WriteValue): string {
  return value.kind === 'same' ? 'same' : value.symbol;
}
