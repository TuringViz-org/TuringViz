import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { GraphAnchor } from '@components/shared/GraphUIContext';
import { makeVirtualAnchor } from '@components/shared/graphAnchor';

import { HOVER_POPPER_DELAY_MS } from '@utils/constants';

import {
  getPointerSnapshot,
  subscribePointerTracker,
  type PointerSnapshot,
} from '@components/shared/pointerTracker';

/** Delayed hover details and persistent selection share the same pointer anchor. */
export function useHoverPopper(
  delayMs = HOVER_POPPER_DELAY_MS,
  selected = false,
  active = true
) {
  const [hovering, setHovering] = useState(false);
  const [delayedOpen, setDelayedOpen] = useState(false);
  const [anchorPos, setAnchorPos] = useState<GraphAnchor | null>(null);

  const timerRef = useRef<number | null>(null);
  const pointerStateRef = useRef<PointerSnapshot>(getPointerSnapshot());

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setHovering(false);
    setDelayedOpen(false);
    setAnchorPos(null);
    clearTimer();
  }, [clearTimer]);

  // Subscribe to pointer tracker to monitor dragging state
  useEffect(() => {
    pointerStateRef.current = getPointerSnapshot();

    const unsubscribe = subscribePointerTracker(() => {
      const prev = pointerStateRef.current;
      const next = getPointerSnapshot();

      // If dragging started, close the popper
      if (active && !prev.isDragging && next.isDragging) {
        close();
      }

      pointerStateRef.current = next;
    });

    return unsubscribe;
  }, [active, close]);

  const onMouseEnter = useCallback(
    (evt: React.MouseEvent) => {
      if (!active || selected) return;
      if (pointerStateRef.current.isDragging) return;

      setHovering(true);
      setAnchorPos({ top: evt.clientY, left: evt.clientX });

      clearTimer();
      timerRef.current = window.setTimeout(() => {
        setDelayedOpen(true);
        timerRef.current = null;
      }, delayMs);
    },
    [active, selected, clearTimer, delayMs]
  );

  const onMouseMove = useCallback(
    (evt: React.MouseEvent) => {
      if (pointerStateRef.current.isDragging) {
        close();
        return;
      }
      if (hovering && !selected) {
        setAnchorPos({ top: evt.clientY + 8, left: evt.clientX + 8 });
      }
    },
    [close, hovering, selected]
  );

  const onMouseLeave = useCallback(() => {
    setHovering(false);

    if (!selected) {
      setDelayedOpen(false);
      setAnchorPos(null);
      clearTimer();
    }
  }, [selected, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (active) return;
    setHovering(false);
    setDelayedOpen(false);
    clearTimer();
    if (!selected) setAnchorPos(null);
  }, [active, selected, clearTimer]);

  useEffect(() => {
    setDelayedOpen(selected);
  }, [selected]);

  const virtualAnchor = useMemo(() => makeVirtualAnchor(anchorPos), [anchorPos]);
  const open =
    active &&
    (selected || (delayedOpen && !pointerStateRef.current.isDragging)) &&
    !!anchorPos;

  return {
    hovering,
    open,
    virtualAnchor,
    anchorPos,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    setAnchorPos,
    close,
  };
}
