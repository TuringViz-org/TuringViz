// src/components/TapeList/Tape.tsx
import React, { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

import { TapeCell, TapeCellProps } from '@components/TapeList/TapeCell';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { Configuration, getTapeFieldorBlank } from '@mytypes/TMTypes';

import styles from './TapeList.module.css';

export type TapeProps = {
  index: number; //This is the index of the tape, used to identify the tape
  configuration?: Configuration;
};

export function Tape({ index, configuration }: TapeProps) {
  const [propList, setPropList] = React.useState<TapeCellProps[]>([]);

  // Heads and tapes need to be set at the same time, otherwise maybe problems occur with the animation.
  // Keep store subscriptions for normal run view, but allow explicit configuration override for previews.
  const stateHead = useGlobalZustand((state) => state.heads[index]);
  const stateTape = useGlobalZustand((state) => state.tapes[index]);
  const head = configuration ? (configuration.heads[index] ?? 0) : stateHead;
  const tape = configuration ? configuration.tapes[index] : stateTape;
  const prevHeadRef = useRef<number | null>(null);

  const wrapperRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const oldHead = prevHeadRef.current;
    const newHead = head;

    //Update the prevHeadRef to the new head
    prevHeadRef.current = newHead;

    const running = configuration ? false : useGlobalZustand.getState().running;

    const blank = useGlobalZustand.getState().blank;

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
  }, [head, tape]);

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
