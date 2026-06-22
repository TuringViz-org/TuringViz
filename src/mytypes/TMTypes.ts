// src/mytypes/TMTypes.ts

//TapeWrite --> The stuff that is written on the tape in a transition
//TapePattern --> The stuff that the tape is matched against
//TapeContent --> The content of the tape


export enum Move {
  L = 'L',
  R = 'R',
  S = 'S', //L = Left, R = Right, S = Stay
}

export function isMove(value: string): value is Move {
  return Object.values(Move).includes(value as Move);
}

export type Transition = {
  to: string; //The state to which the transition goes
  from: string; //The state in which the TM needs to be in for using the transition
  write: TapeWrite; //The list of symbols to write on the tapes
  tapecondition: TapePattern; //The list of symbols to be on the tape for the transition to be valid
  direction: Move[]; //The list of directions to move the tape heads
};

export type TapePattern = TapePatternField[];

export type TapePatternRealField = {
  value: string; //The value of the tape field
};

export type TapePatternAllField = {};

export type TapePatternField = TapePatternRealField | TapePatternAllField;

export function isTapePatternRealField(value: string): boolean {
  return value !== 'all' && value !== '' && value.length > 0;
}

export function isTapePatternAllField(value: string): boolean {
  return value === 'all';
}

export function isTapePatternAllFieldbyField(
  field: TapePatternField
): field is TapePatternAllField {
  return (field as TapePatternRealField).value === undefined;
}

export function isTapePatternRealFieldbyField(
  field: TapePatternField
): field is TapePatternRealField {
  return (field as TapePatternRealField).value !== undefined;
}

export type TapeWriteRealField = TapePatternRealField;

export type TapeWriteSameField = {};

export type TapeWriteField = TapeWriteRealField | TapeWriteSameField;

export type TapeWrite = TapeWriteField[];

export function isTapeWriteRealField(value: string): boolean {
  return value !== 'same' && value !== '' && value.length > 0;
}

export function isTapeWriteRealFieldbyField(
  field: TapeWriteField
): field is TapeWriteRealField {
  return (field as TapeWriteRealField).value !== undefined;
}

export function isTapeWriteSameField(value: string): boolean {
  return value === 'same';
}

export function isTapeWriteSameFieldbyField(
  field: TapeWriteField
): field is TapeWriteSameField {
  return (field as TapeWriteRealField).value === undefined;
}

export type TapeContentField = {
  value: string; //The value of the tape field
};

export type TapeContentSingleTape = [TapeContentField[], TapeContentField[]];

export type TapeContent = TapeContentSingleTape[];

export function deepCopyTapeContent(tape: TapeContent): TapeContent {
  return tape.map(([left, right]) => [
    left.map((field) => ({ value: field.value })),
    right.map((field) => ({ value: field.value })),
  ]);
}

export function createTapeContent(array: [string[], string[]][]): TapeContent {
  return array.map(([left, right]) => [
    left.map((value) => ({ value })),
    right.map((value) => ({ value })),
  ]);
}

export function createTapeContentFromStrings(strings: string[]): TapeContent {
  return strings.map((str) => [
    [],
    str.split('').map((value) => ({ value })), // Left tape is empty, right tape contains the string
  ]);
}

// Pay attention for index out of bounds errors when using this function
export function getTapeField(
  tape: TapeContent,
  tapeIndex: number,
  head: number
): TapeContentField {
  const singleTape = tape[tapeIndex];
  return head < 0 ? singleTape[0][-head - 1] : singleTape[1][head];
}

export function getTapeFieldorBlank(
  tape: TapeContentSingleTape,
  head: number,
  blank: string
): string {
  if (head < 0) {
    if (-(head) - 1 >= tape[0].length) {
      return blank; // Return blank if the head is out of bounds on the left tape
    }
    return tape[0][-head - 1].value; // Access the left tape
  }
  return tape[1].length > head ? tape[1][head].value : blank;
}

export type Configuration = {
  state: string; //The current state of the TM
  tapes: TapeContent; //The content of the tape
  heads: number[]; //The list of heads. Each head is the index of the symbol in the tape. Negative values are to the left and positive values are to the right. 0 is the first symbol on the right tape --> On the left tape the index is -i + 1
};

// Fast, collision-free identity key for a configuration. Used only for in-memory
// equality checks and Set/Map dedup (never persisted), so a plain delimited string
// is enough — and far cheaper than hashing the whole tape with sha256, which was a
// hot-path bottleneck during running and tree rendering.
// Control characters are used as delimiters so they can never collide with tape
// symbols or state names.
export function hashConfig(cfg: Configuration): string {
  let key = cfg.state + '' + cfg.heads.join(',') + '';
  for (const [left, right] of cfg.tapes) {
    for (const field of left) key += field.value + '';
    key += '';
    for (const field of right) key += field.value + '';
    key += '';
  }
  return key;
}
