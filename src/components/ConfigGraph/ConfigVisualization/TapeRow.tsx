import { Box } from '@mui/material';

import TapeCells from './TapeCells';
import type { TapeContentSingleTape } from '@mytypes/TMTypes';
import runTapeStyles from '@components/TapeList/TapeList.module.css';
import { CELL_HEIGHT, CELL_WIDTH } from './constants';

type Props = {
  tapeIndex: number;
  tape: TapeContentSingleTape;
  head: number;
  blank: string;
  minR: number;
  maxR: number;
  headX: number;
};

export default function TapeRow({
  tapeIndex,
  tape,
  head,
  blank,
  minR,
  maxR,
  headX,
}: Props) {
  return (
    <Box sx={{ pb: 0.5 }}>
      <Box
        className={runTapeStyles.scrollableTapeRow}
        sx={{
          width: `${(maxR - minR + 1) * CELL_WIDTH}px`,
          height: `${CELL_HEIGHT}px`,
        }}
      >
        <Box
          className={runTapeStyles.tapeTrackWrapper}
          sx={{
            height: `${CELL_HEIGHT}px`,
            transform: `translateX(${headX - head * CELL_WIDTH}px)`,
          }}
        >
          <TapeCells tape={tape} head={head} blank={blank} minR={minR} maxR={maxR} />
        </Box>
        <Box
          className={runTapeStyles.scrollableTapeHeadOverlayNative}
          sx={{
            left: `${headX}px`,
            width: `${CELL_WIDTH}px`,
            height: `${CELL_HEIGHT}px`,
            top: '0',
          }}
        />
      </Box>
    </Box>
  );
}
