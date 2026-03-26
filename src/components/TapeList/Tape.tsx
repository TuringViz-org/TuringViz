// src/components/TapeList/Tape.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { flushSync } from 'react-dom';

import { TapeCell, TapeCellProps } from '@components/TapeList/TapeCell';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  Configuration,
  getTapeFieldorBlank,
  type TapeContentSingleTape,
} from '@mytypes/TMTypes';

import styles from './TapeList.module.css';

export type TapeProps = {
  index: number; //This is the index of the tape, used to identify the tape
  configuration?: Configuration;
  scrollable?: boolean;
  sharedMinR?: number;
  sharedMaxR?: number;
};

const CELL_SIZE = 50;

type CommonTapeViewProps = {
  head: number;
  tape: TapeContentSingleTape;
  blank: string;
};

type StaticTapeViewProps = CommonTapeViewProps & {
  running: boolean;
};

function StaticTapeView({ head, tape, blank, running }: StaticTapeViewProps) {
  const [propList, setPropList] = React.useState<TapeCellProps[]>([]);
  const prevHeadRef = useRef<number | null>(null);
  const wrapperRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const oldHead = prevHeadRef.current;
    const newHead = head;

    //Update the prevHeadRef to the new head
    prevHeadRef.current = newHead;

    function newTapeCellProps(): TapeCellProps[] {
      const newPropList: TapeCellProps[] = [];
      for (let i = newHead - 9; i <= newHead + 9; i++) {
        newPropList.push({
          value: getTapeFieldorBlank(tape, i, blank),
          position: i,
        });
      }
      return newPropList;
    }

    const newPropList = newTapeCellProps();

    //Before running the machine, it has to be set up one time. Never run directly after the machine is set up, because then the oldHead is not set yet
    if (!running || oldHead == newHead) {
      //Set the new tapefields
      setPropList(newPropList); //we can't set it yet if the machine is running, because then the animation would not work correctly
      return; //No need to do anything else
    }

    //Now we need to animate some things because the machine is running. One thing: When running, only one step at a time is allowed!!!

    if (oldHead === null) {
      console.error(
        'Old head is null. This should not happen. Please make sure to set the head before running!'
      );
      return;
    }

    if (wrapperRef.current === null) {
      console.error('Wrapper ref is null. This should not happen!');
      return;
    }

    if (oldHead - newHead !== 1 && oldHead - newHead !== -1) {
      console.error(
        'Invalid head movement detected. Only one step at a time is allowed (when running)'
      );
      return;
    }

    //We slide the tape cells to the left or right. And then we do it back --> That then is the correct animation

    //Now slide to the left or right, depending on the head movement
    requestAnimationFrame(() => {
      if (wrapperRef.current === null) return;
      wrapperRef.current.style.transition = 'none';
      flushSync(() => {
        setPropList(newPropList);
        if (wrapperRef.current === null) return;
        if (oldHead < newHead) {
          wrapperRef.current.style.transform = 'translate(50px,10px)';
        } else {
          wrapperRef.current.style.transform = 'translate(-50px,10px)';
        }
      });
      requestAnimationFrame(() => {
        if (wrapperRef.current === null) return;
        wrapperRef.current.style.transition = 'transform 0.2s ease-in-out';
        wrapperRef.current.style.transform = 'translate(0px,10px)';
      });
    });
  }, [head, tape, running, blank]);

  return (
    <svg className={styles.tapeSvg} width="95%" viewBox="0 0 870 70">
      <g
        className="wrapper"
        ref={wrapperRef}
        style={{ transform: 'translate(0px, 10px)' }}
      >
        {propList.map((cell, index) => (
          <TapeCell key={cell.position} value={cell.value} position={index} />
        ))}
      </g>
      <rect className={styles.tapehead} width={60} height={60} x={405} y={5}></rect>
    </svg>
  );
}

type ScrollableTapeViewProps = CommonTapeViewProps & {
  running: boolean;
  sharedMinR: number;
  sharedMaxR: number;
};

function ScrollableTapeView({
  head,
  tape,
  blank,
  running,
  sharedMinR,
  sharedMaxR,
}: ScrollableTapeViewProps) {
  const { cells } = useMemo(() => {
    const min = sharedMinR + head;
    const max = sharedMaxR + head;
    const list = [];

    for (let pos = min; pos <= max; pos++) {
      list.push({
        pos,
        value: getTapeFieldorBlank(tape, pos, blank),
      });
    }

    return { cells: list };
  }, [tape, head, blank, sharedMinR, sharedMaxR]);

  // Shift by exactly 1 cell to the left. The dots natively sit at cell -1. This brings them securely to X=0. No further buffer needed.
  const headX = -(sharedMinR - 1) * CELL_SIZE;

  return (
    <div className={styles.scrollableTapeRow} style={{ width: `${(sharedMaxR - sharedMinR + 2) * CELL_SIZE}px` }}>
      <div 
        className={styles.tapeTrackWrapper} 
        style={{ 
          transform: `translateX(${(headX - head * CELL_SIZE)}px)`,
          transition: running ? 'transform 0.2s ease-in-out' : 'none',
        }}
      >
        {cells.map((cell) => (
          <div
            key={cell.pos}
            className={styles.scrollableTapeCell}
            style={{ left: `${cell.pos * CELL_SIZE}px` }}
          >
            {cell.value}
          </div>
        ))}

        {/* Left infinite dots */}
        <div
          className={styles.scrollableTapeDots}
          style={{ left: `${(sharedMinR + head - 1) * CELL_SIZE}px`, justifyContent: 'center' }}
        >
          ...
        </div>

        {/* Right infinite dots */}
        <div
          className={styles.scrollableTapeDots}
          style={{ left: `${(sharedMaxR + head + 1) * CELL_SIZE}px`, justifyContent: 'center' }}
        >
          ...
        </div>
      </div>
      {/* Tape Head Overlay */}
      <div 
        className={styles.scrollableTapeHeadOverlayNative}
        style={{ left: `${headX}px` }}
      />
    </div>
  );
}

export function Tape({
  index,
  configuration,
  scrollable = false,
  sharedMinR,
  sharedMaxR,
}: TapeProps) {
  // Heads and tapes need to be set at the same time, otherwise maybe problems occur with the animation.
  // Keep store subscriptions for normal run view, but allow explicit configuration override for previews.
  const stateHead = useGlobalZustand((state) => state.heads[index]);
  const stateTape = useGlobalZustand((state) => state.tapes[index]);
  const stateRunning = useGlobalZustand((state) => state.running);
  const blank = useGlobalZustand((state) => state.blank);

  const head = configuration ? (configuration.heads[index] ?? 0) : stateHead;
  const tape = configuration ? configuration.tapes[index] : stateTape;
  const running = configuration ? false : stateRunning;

  if (scrollable) {
    return (
      <ScrollableTapeView
        head={head}
        tape={tape}
        blank={blank}
        running={running}
        sharedMinR={sharedMinR ?? -50}
        sharedMaxR={sharedMaxR ?? 50}
      />
    );
  }

  return <StaticTapeView head={head} tape={tape} blank={blank} running={running} />;
}
