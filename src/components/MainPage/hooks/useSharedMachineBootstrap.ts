import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { hasSharedMachineInHash, parseSharedMachineFromHash } from '@utils/shareTmLink';

type SetCodeFn = (
  code: string,
  shouldApplyImmediately?: boolean,
  autoLoad?: boolean
) => void;

/**
 * Loads a shared machine from `#tm=...` in the URL fragment once on startup.
 */
export function useSharedMachineBootstrap(setCode: SetCodeFn) {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const hash = window.location.hash;
    const load = async () => {
      const decoded = await parseSharedMachineFromHash(hash);
      if (!decoded) {
        if (hasSharedMachineInHash(hash)) {
          toast.warning('Shared machine link is invalid or corrupted.');
        }
        return;
      }

      setCode(decoded, true, false);
      toast.success('Shared Turing machine inserted into editor.');
    };

    void load();
  }, [setCode]);
}
