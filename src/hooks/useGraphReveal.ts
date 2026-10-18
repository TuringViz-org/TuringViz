import { useLayoutEffect, useState } from 'react';
import { useGraphFrameTask } from './useGraphFrameTask';

/** Wait for renderer commits and its final viewport paint before showing it. */
export function useGraphReveal(blocked: boolean, settleMs = 90): boolean {
  const [visible, setVisible] = useState(false);
  const { schedule, cancel } = useGraphFrameTask([blocked, settleMs]);

  useLayoutEffect(() => {
    setVisible(false);
    if (blocked) return;
    let timer: number | undefined;
    schedule((isCurrent) => {
      timer = window.setTimeout(() => {
        if (isCurrent()) setVisible(true);
      }, settleMs);
    });
    return () => {
      cancel();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [blocked, settleMs, schedule, cancel]);

  return !blocked && visible;
}
