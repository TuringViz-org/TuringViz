// src/components/MainPage/AppToaster.tsx
import { Toaster } from 'sonner';
import styles from '../../App.module.css';

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      duration={5000}
      gap={1}
      style={{ zIndex: 1400 }}
      toastOptions={{
        classNames: {
          toast: styles.toastRoot,
          closeButton: styles.toastClose,
        },
      }}
    />
  );
}
