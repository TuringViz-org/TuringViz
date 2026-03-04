// src/components/ConfigGraph/ConfigVisualization/TapeCells.tsx
import { useMemo } from 'react';
import { Box } from '@mui/material';

import type { TapeContentSingleTape } from '@mytypes/TMTypes';
import {
  valueAtAbsolutePos,
  hasCellAtAbsolutePos,
} from './tapeUtils';
import { CELL_HEIGHT, CELL_WIDTH } from './constants';
import runTapeStyles from '@components/TapeList/TapeList.module.css';

type Props = {
  tape: TapeContentSingleTape;
  blank: string;
  minPos: number;
  maxPos: number;
};

type Cell = {
  key: number;
  val: string;
  leftPx: number;
  isPresent: boolean;
};

/**
 * Renders a shared tape range. Positions missing in this local tape stay plain white.
 */
export default function TapeCells({ tape, blank, minPos, maxPos }: Props) {
  const cells = useMemo<Cell[]>(() => {
    const out: Cell[] = [];
    const start = Math.min(minPos, maxPos);
    const end = Math.max(minPos, maxPos);

    for (let pos = start; pos <= end; pos++) {
      const isPresent = hasCellAtAbsolutePos(tape, pos);
      out.push({
        key: pos,
        val: isPresent ? valueAtAbsolutePos(tape, pos, blank) : '',
        leftPx: (pos - start) * CELL_WIDTH,
        isPresent,
      });
    }

    return out;
  }, [tape, blank, minPos, maxPos]);

  const start = Math.min(minPos, maxPos);
  const end = Math.max(minPos, maxPos);
  const trackWidth = Math.max(0, end - start + 1) * CELL_WIDTH;

  return (
    <Box
      className={runTapeStyles.scrollableTapeTrack}
      sx={{
        width: `${trackWidth}px`,
        minWidth: trackWidth > 0 ? `${trackWidth}px` : 0,
        height: CELL_HEIGHT + 10,
      }}
    >
      {cells.map((c: Cell) => (
        <Box
          key={c.key}
          className={runTapeStyles.scrollableTapeCell}
          sx={{
            left: `${c.leftPx}px`,
            width: CELL_WIDTH,
            height: CELL_HEIGHT,
            boxSizing: 'border-box',
            borderColor: c.isPresent ? '#9ca3af' : 'transparent',
            fontFamily:
              "'Source Code Pro', 'Consolas', 'Menlo', 'DejaVu Sans Mono', 'Courier', monospace",
            fontSize: 25,
          }}
        >
          {c.val}
        </Box>
      ))}
    </Box>
  );
}
