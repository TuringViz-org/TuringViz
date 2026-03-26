// src/components/MainPage/PortalBridge.tsx
import { MutableRefObject, ReactNode, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type RefTarget = MutableRefObject<HTMLElement | null>;

interface PortalBridgeProps {
  // When true, the portal node is appended to the fullscreen container
  // Otherwise the node lives in the fallback container
  active: boolean;
  // When false, the portal content is unmounted entirely (spinner mode)
  enabled?: boolean;
  // Container used while fullscreen is active
  targetRef: RefTarget;
  // Container used in the regular layout
  fallbackRef: RefTarget;
  // Identifier emitted with switch events (optional).
  id?: string;
  children: ReactNode;
}

export type PortalBridgeLocation = 'target' | 'fallback';

export interface PortalBridgeSwitchDetail {
  id: string;
  location: PortalBridgeLocation;
}

export const PORTAL_BRIDGE_SWITCH_EVENT = 'portal-bridge:switch';
export const PORTAL_BRIDGE_BEFORE_SWITCH_EVENT = 'portal-bridge:before-switch';

/**
 * Keeps a single React tree mounted while moving its rendered DOM between
 * regular and fullscreen containers. The internal portal node is stable, so
 * React Flow keeps its state when the user toggles fullscreen.
 */
export function PortalBridge(props: PortalBridgeProps) {
  const { active, enabled = true, targetRef, fallbackRef, children, id } = props;

  const portalNodeRef = useRef<HTMLDivElement | null>(null);
  const lastContainerRef = useRef<HTMLElement | null>(null);
  const locationRef = useRef<PortalBridgeLocation | null>(null);

  if (!portalNodeRef.current) {
    const node = document.createElement('div');
    node.style.width = '100%';
    node.style.height = '100%';
    node.style.position = 'relative';
    portalNodeRef.current = node;
  }

  useLayoutEffect(() => {
    const portalNode = portalNodeRef.current;
    if (!portalNode) return;

    if (!enabled) {
      const prev = lastContainerRef.current;
      if (prev && prev.contains(portalNode)) {
        prev.removeChild(portalNode);
      }
      lastContainerRef.current = null;
      locationRef.current = null;
      return;
    }

    const nextContainer =
      active && targetRef.current ? targetRef.current : fallbackRef.current;
    if (!nextContainer) return;

    const nextLocation: PortalBridgeLocation =
      active && targetRef.current ? 'target' : 'fallback';
    const locationChanged = locationRef.current !== nextLocation;

    if (id && locationChanged) {
      window.dispatchEvent(
        new CustomEvent<PortalBridgeSwitchDetail>(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, {
          detail: { id, location: nextLocation },
        })
      );
    }

    const prev = lastContainerRef.current;
    if (prev && prev !== nextContainer && prev.contains(portalNode)) {
      prev.removeChild(portalNode);
    }

    if (!nextContainer.contains(portalNode)) {
      nextContainer.appendChild(portalNode);
    }

    lastContainerRef.current = nextContainer;

    if (locationChanged) {
      locationRef.current = nextLocation;
      if (id) {
        const schedule =
          typeof queueMicrotask === 'function'
            ? queueMicrotask
            : (cb: () => void) => Promise.resolve().then(cb);
        schedule(() => {
          window.dispatchEvent(
            new CustomEvent<PortalBridgeSwitchDetail>(PORTAL_BRIDGE_SWITCH_EVENT, {
              detail: { id, location: nextLocation },
            })
          );
        });
      }
    }

    return () => {
      const current = lastContainerRef.current;
      if (current && current.contains(portalNode)) {
        current.removeChild(portalNode);
      }
      lastContainerRef.current = null;
      locationRef.current = null;
    };
  }, [active, enabled, fallbackRef, targetRef]);

  if (!enabled || !portalNodeRef.current) {
    return null;
  }

  return createPortal(children, portalNodeRef.current);
}
