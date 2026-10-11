import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Configuration } from '@mytypes/TMTypes';
import { useGlobalZustand } from '@zustands/GlobalZustand';

// Retain the last visible configuration without subscribing to hidden run steps.
// Resuming reads the latest configuration once, regardless of how many steps ran.
export function useGraphCurrentConfiguration(active: boolean): Configuration {
  const snapshot = useRef<Configuration | null>(null);
  const getSnapshot = useCallback(() => {
    if (active || !snapshot.current) {
      const { currentState, tapes, heads } = useGlobalZustand.getState();
      const previous = snapshot.current;
      if (
        !previous ||
        previous.state !== currentState ||
        previous.tapes !== tapes ||
        previous.heads !== heads
      ) {
        snapshot.current = { state: currentState, tapes, heads };
      }
    }
    return snapshot.current!;
  }, [active]);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!active) return () => {};
      return useGlobalZustand.subscribe((state, previous) => {
        if (
          state.currentState !== previous.currentState ||
          state.tapes !== previous.tapes ||
          state.heads !== previous.heads
        ) {
          notify();
        }
      });
    },
    [active]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
