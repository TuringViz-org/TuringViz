import { useCallback, useState } from 'react';

export type FullscreenState = {
  open: boolean;
  render: boolean;
  setRender: (value: boolean) => void;
  openFullscreen: () => void;
  closeFullscreen: () => void;
};

/** The graph stays mounted; render only marks the settled fullscreen destination. */
export function useFullscreenState(): FullscreenState {
  const [state, setState] = useState({ open: false, render: false });
  const openFullscreen = useCallback(() => {
    setState({ open: true, render: false });
  }, []);
  const closeFullscreen = useCallback(() => {
    setState({ open: false, render: false });
  }, []);
  const setRender = useCallback((render: boolean) => {
    setState((state) => {
      // Ignore late transition callbacks after the dialog has already closed.
      const ready = state.open && render;
      return state.render === ready ? state : { ...state, render: ready };
    });
  }, []);
  return { ...state, setRender, openFullscreen, closeFullscreen };
}
