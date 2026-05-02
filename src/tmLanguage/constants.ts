// Shared language metadata used by both the parser domain and the Monaco adapter.
// Keeping these lists central prevents syntax coloring, hover text, and parsing
// rules from drifting apart.
export const LANGUAGE_ID = 'turingviz-machine';

export const RESERVED_WORDS = new Set([
  'tapes',
  'blank',
  'alphabet',
  'input',
  'start',
  'state',
  'on',
  'if',
  'then',
  'and',
  'or',
  'not',
  'in',
  'any',
  'write',
  'move',
  'goto',
  'same',
  'choose',
  'L',
  'R',
  'S',
]);

export const HEADER_KEYWORDS = new Set([
  'tapes',
  'blank',
  'alphabet',
  'input',
  'start',
]);

export const ACTION_KEYWORDS = new Set(['write', 'move', 'goto']);

export const DIRECTIONS = new Set(['L', 'R', 'S']);

export const COMPLEMENT_OPERATORS = new Set(['!=', '!', 'not in']);

// Short explanations shown by Monaco hover. These are intentionally tied to
// keywords only; state names and symbols get context-sensitive hovers elsewhere.
export const KEYWORD_HOVERS: Record<string, string> = {
  tapes: 'Declares how many tapes the machine has. Valid values are 1 through 6.',
  blank: 'Declares the one-character blank symbol. If an alphabet is declared, the blank must be part of it.',
  alphabet: 'Optionally declares every one-character symbol that may appear on a tape or in a transition. Required for complement patterns.',
  input: 'Declares the initial tape contents. Missing tape segments are filled with the blank symbol.',
  start: 'Declares the state where execution begins.',
  state: 'Starts a state block. State names may contain letters, digits, and underscores.',
  on: 'Starts a compact transition with one read pattern per tape.',
  if: 'Starts a readable transition condition. Unmentioned tapes are treated as `any`.',
  then: 'Separates an `if` condition from its actions.',
  and: 'Combines condition atoms inside one condition alternative.',
  or: 'Creates another readable condition alternative with the same actions.',
  any: 'Matches any symbol on a specific tape, for example `any t1`.',
  write: 'Optionally writes one value per tape. Omit it to keep all symbols unchanged.',
  move: 'Moves every tape head. This action is required for every transition.',
  goto: 'Optionally changes state. Omit it to stay in the current state.',
  same: 'Keeps the current tape symbol unchanged in a write pattern.',
  choose: 'Groups nondeterministic alternatives that share the same condition.',
  in: 'Matches any symbol from the following set.',
  not: 'Used with `in` as `not in` to match every alphabet symbol outside the set.',
  L: 'Move this tape head one cell to the left.',
  R: 'Move this tape head one cell to the right.',
  S: 'Keep this tape head on the current cell.',
};
