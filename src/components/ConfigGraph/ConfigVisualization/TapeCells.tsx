// src/components/ConfigGraph/ConfigVisualization/TapeCells.tsx
import { useMemo } from 'react';
import { Box } from '@mui/material';

import type { TapeContentSingleTape } from '@mytypes/TMTypes';
import { valueAtAbsolutePos, hasCellAtAbsolutePos } from './tapeUtils';
import { CELL_HEIGHT, CELL_WIDTH } from './constants';
import runTapeStyles from '@components/TapeList/TapeList.module.css';

type Props = {
  tape: TapeContentSingleTape;
  head: number;
  blank: string;
  minR: number;
  maxR: number;
};

type Cell = {
  key: number;
  val: string;
  leftPx: number;
  isPresent: boolean;
};

export default function TapeCells({ tape, head, blank, minR, maxR }: Props) {
  const cells = useMemo<Cell[]>(() => {
    const out: Cell[] = [];
    const start = minR + head;
    const end = maxR + head;

    for (let pos = start; pos <= end; pos++) {
      const isPresent = hasCellAtAbsolutePos(tape, pos);
      out.push({
        key: pos,
        val: isPresent ? valueAtAbsolutePos(tape, pos, blank) : '',
        leftPx: pos * CELL_WIDTH,
        isPresent,
      });
    }

    return out;
  }, [tape, head, blank, minR, maxR]);

  return (
    <>
      {cells.map((c: Cell) => (
        <Box
          key={c.key}
          className={runTapeStyles.scrollableTapeCell}
          sx={{
            left: `${c.leftPx}px`,
            width: CELL_WIDTH,
            height: CELL_HEIGHT,
            top: 0,
            boxSizing: 'border-box',
            borderColor: c.isPresent ? '#9ca3af' : 'transparent',
            backgroundColor: c.isPresent ? '#ffffff' : 'transparent',
            fontFamily:
              "'Source Code Pro', 'Consolas', 'Menlo', 'DejaVu Sans Mono', 'Courier', monospace",
            fontSize: 20,
          }}
        >
          {c.val}
        </Box>
      ))}
    </>
  );
}
