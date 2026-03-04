// src/components/ConfigGraph/ConfigVisualization/TapeRow.tsx
import { Box } from '@mui/material';

import TapeCells from './TapeCells';
import type { TapeContentSingleTape } from '@mytypes/TMTypes';
import runTapeStyles from '@components/TapeList/TapeList.module.css';

type Props = {
  tapeIndex: number;
  tape: TapeContentSingleTape;
  blank: string;
  minPos: number;
  maxPos: number;
  setViewportRef: (i: number) => (el: HTMLDivElement | null) => void;
  onViewportScroll: (srcEl: HTMLDivElement | null) => void;
};

export default function TapeRow({
  tapeIndex,
  tape,
  blank,
  minPos,
  maxPos,
  setViewportRef,
  onViewportScroll,
}: Props) {
  return (
    <Box sx={{ pb: 1 }}>
      {/* Individual horizontally scrollable viewport per tape (kept in sync) */}
      <Box className={runTapeStyles.scrollableTapeContainer}>
        <Box
          className={runTapeStyles.scrollableTapeFrame}
          sx={{
            overflow: 'hidden',
            borderRadius: '8px',
          }}
        >
          <Box
            ref={setViewportRef(tapeIndex)}
            onScroll={(e) => onViewportScroll(e.currentTarget)}
            className={`${runTapeStyles.scrollableTapeViewport} ${runTapeStyles.scrollableTapeViewportNoScrollbar}`}
            sx={{
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <TapeCells tape={tape} blank={blank} minPos={minPos} maxPos={maxPos} />
          </Box>
          <Box className={runTapeStyles.scrollableTapeHeadOverlay} />
        </Box>
      </Box>
    </Box>
  );
}
