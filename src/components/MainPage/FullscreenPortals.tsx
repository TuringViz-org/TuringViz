// src/components/MainPage/FullScreenPortals.tsx
import type { MutableRefObject, ReactNode } from 'react';
import { Box } from '@mui/material';
import { FullscreenShell } from './FullscreenShell';
import { PortalBridge } from './PortalBridge';
import styles from '../../App.module.css';

export type FullscreenPortalConfig = {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  render: boolean;
  setRender: (value: boolean) => void;
  enabled?: boolean;
  fallbackRef: MutableRefObject<HTMLDivElement | null>;
  fullscreenRef: MutableRefObject<HTMLDivElement | null>;
  actions?: ReactNode;
  content: ReactNode;
};

export function FullscreenPortals({ items }: { items: FullscreenPortalConfig[] }) {
  return (
    <>
      {items.map((item) => (
        <FullscreenShell
          key={`${item.id}-shell`}
          title={item.title}
          open={item.open}
          onClose={item.onClose}
          render={item.render}
          setRender={item.setRender}
          actions={item.actions}
        >
          <Box ref={item.fullscreenRef} className={styles.portal_mount} />
        </FullscreenShell>
      ))}

      {items.map((item) => (
        <PortalBridge
          key={`${item.id}-bridge`}
          active={item.open && item.render}
          enabled={item.enabled ?? true}
          fallbackRef={item.fallbackRef}
          targetRef={item.fullscreenRef}
          id={item.id}
        >
          {item.content}
        </PortalBridge>
      ))}
    </>
  );
}
