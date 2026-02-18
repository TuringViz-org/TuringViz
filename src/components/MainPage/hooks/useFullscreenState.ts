import { useCallback, useState } from 'react';

export type FullscreenState = {
  open: boolean;
  render: boolean;
  setRender: (value: boolean) => void;
  openFullscreen: () => void;
  closeFullscreen: () => void;
};

/**
 * Shared state for fullscreen panel lifecycle.
 * `render` is controlled independently from `open` so heavy graph trees can
 * stay mounted only after fullscreen transition has completed.
 */
export function useFullscreenState(): FullscreenState {
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);

  const openFullscreen = useCallback(() => {
    setOpen(true);
  }, []);

  const closeFullscreen = useCallback(() => {
    setOpen(false);
  }, []);

  return {
    open,
    render,
    setRender,
    openFullscreen,
    closeFullscreen,
  };
}
