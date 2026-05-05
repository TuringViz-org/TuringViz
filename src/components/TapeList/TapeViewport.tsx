import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Stack } from '@mui/material';

import type { Configuration } from '@mytypes/TMTypes';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { Tape } from './Tape';
import styles from './TapeList.module.css';

const CELL_SIZE = 50;
const EXTRA_SCROLL_CELLS = 100;

export type TapeViewportProps = {
  configuration?: Configuration;
  resetKey?: unknown;
};

export function TapeViewport({ configuration, resetKey }: TapeViewportProps) {
  const storeNumTapes = useGlobalZustand((state) => state.numberOfTapes);
  const storeHeads = useGlobalZustand((state) => state.heads);
  const storeTapes = useGlobalZustand((state) => state.tapes);
  const storeRunning = useGlobalZustand((state) => state.running);
  const machineLoadVersion = useGlobalZustand((state) => state.machineLoadVersion);
  const tapeContainerRef = useRef<HTMLDivElement | null>(null);

  const numTapes = configuration?.tapes.length ?? storeNumTapes;
  const heads = configuration?.heads ?? storeHeads;
  const tapes = configuration?.tapes ?? storeTapes;
  const running = configuration ? false : storeRunning;

  const sharedBoundsR = useMemo(() => {
    let minR = Number.POSITIVE_INFINITY;
    let maxR = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < numTapes; i++) {
      const tape = tapes[i];
      const head = heads[i] ?? 0;

      if (!tape) continue;

      const leftLen = tape[0]?.length ?? 0;
      const rightLen = tape[1]?.length ?? 0;
      const minPos = Math.min(
        head - Math.floor(EXTRA_SCROLL_CELLS / 2),
        -leftLen - 10
      );
      const maxPos = Math.max(
        head + Math.floor(EXTRA_SCROLL_CELLS / 2),
        rightLen + 10
      );

      minR = Math.min(minR, minPos - head);
      maxR = Math.max(maxR, maxPos - head);
    }

    if (!Number.isFinite(minR) || !Number.isFinite(maxR)) {
      return { sharedMinR: -EXTRA_SCROLL_CELLS, sharedMaxR: EXTRA_SCROLL_CELLS };
    }

    return { sharedMinR: minR, sharedMaxR: maxR };
  }, [heads, tapes, numTapes]);

  const { sharedMinR, sharedMaxR } = sharedBoundsR;
  const headX = -(sharedMinR - 1) * CELL_SIZE;
  const prevHeadXRef = useRef(headX);

  useLayoutEffect(() => {
    const diff = headX - prevHeadXRef.current;

    if (diff !== 0 && tapeContainerRef.current) {
      tapeContainerRef.current.scrollLeft += diff;
    }

    prevHeadXRef.current = headX;
  }, [headX]);

  const centerHeads = useCallback(
    (smooth = false) => {
      if (!tapeContainerRef.current) return;

      const viewWidth = tapeContainerRef.current.clientWidth;
      const targetScrollLeft = headX - viewWidth / 2 + CELL_SIZE / 2;

      tapeContainerRef.current.scrollTo({
        left: targetScrollLeft,
        behavior: smooth ? 'smooth' : 'auto',
      });
    },
    [headX]
  );

  useEffect(() => {
    const timeout = setTimeout(() => centerHeads(false), 10);
    return () => clearTimeout(timeout);
  }, [centerHeads, configuration, machineLoadVersion, numTapes, resetKey]);

  useEffect(() => {
    if (!tapeContainerRef.current) return;

    const viewWidth = tapeContainerRef.current.clientWidth;
    const currentScroll = tapeContainerRef.current.scrollLeft;
    const margin = 100;

    if (
      !running ||
      headX < currentScroll + margin ||
      headX > currentScroll + viewWidth - margin
    ) {
      centerHeads(running);
    }
  }, [heads, numTapes, running, headX, centerHeads]);

  return (
    <div
      ref={tapeContainerRef}
      className={`${styles.scrollableTapeViewport} ${styles.scrollableTapeViewportNoScrollbar}`}
    >
      <Stack spacing={1} className={styles.scrollableTapeStack}>
        {Array.from({ length: numTapes }, (_, i) => (
          <Tape
            key={i}
            index={i}
            configuration={configuration}
            scrollable
            sharedMinR={sharedMinR}
            sharedMaxR={sharedMaxR}
          />
        ))}
      </Stack>
    </div>
  );
}
