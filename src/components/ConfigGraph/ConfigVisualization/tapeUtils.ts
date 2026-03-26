// src/components/ConfigGraph/ConfigVisualization/tapeUtils.ts
import type { TapeContentSingleTape } from '@mytypes/TMTypes';

// Render-friendly symbol for blanks/empty
export function fmtSym(s: string, blank: string) {
  if (s === blank) return '□';
  if (s === '') return '·';
  return s;
}

/**
 * Read the symbol at an absolute position on a single tape
 * pos < 0  => left side (tape[0]) with index mapping
 * pos >= 0 => right side (tape[1])
 */
export function valueAtAbsolutePos(
  tape: TapeContentSingleTape,
  pos: number,
  blank: string
): string {
  if (pos < 0) {
    const idxLeft = -pos - 1;
    return idxLeft < tape[0].length ? tape[0][idxLeft].value : blank;
  }
  return pos < tape[1].length ? tape[1][pos].value : blank;
}

/** Returns the local visited bounds of a tape: [-lenLeft .. lenRight-1] */
export function getLocalBounds(tape: TapeContentSingleTape) {
  const minPosLocal = -tape[0].length;
  const maxPosLocal = tape[1].length - 1;
  return { minPosLocal, maxPosLocal };
}

/** True when this absolute position exists in the concrete local tape content. */
export function hasCellAtAbsolutePos(tape: TapeContentSingleTape, pos: number): boolean {
  const { minPosLocal, maxPosLocal } = getLocalBounds(tape);
  return pos >= minPosLocal && pos <= maxPosLocal;
}
