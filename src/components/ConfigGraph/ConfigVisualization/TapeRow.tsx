import { Box } from '@mui/material';

import TapeCells from './TapeCells';
import type { TapeContentSingleTape } from '@mytypes/TMTypes';
import runTapeStyles from '@components/TapeList/TapeList.module.css';

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
      <Box className={runTapeStyles.scrollableTapeRow} sx={{ width: `${(maxR - minR + 1) * 50}px`, height: '50px' }}>
        <Box 
          className={runTapeStyles.tapeTrackWrapper}
          sx={{ 
            height: '50px',
            transform: `translateX(${headX - head * 50}px)` 
          }}
        >
          <TapeCells tape={tape} head={head} blank={blank} minR={minR} maxR={maxR} />
        </Box>
        <Box 
          className={runTapeStyles.scrollableTapeHeadOverlayNative}
          sx={{ left: `${headX}px`, width: '50px', height: '50px', top: '0' }}
        />
      </Box>
    </Box>
  );
}
