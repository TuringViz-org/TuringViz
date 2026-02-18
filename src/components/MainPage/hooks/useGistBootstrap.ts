import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { extractGistId, fetchGistContent } from '@utils/gist';

type SetCodeFn = (code: string, shouldApplyImmediately?: boolean) => void;

/**
 * Loads `?gist=` content once on app startup and injects it into the editor store.
 */
export function useGistBootstrap(setCode: SetCodeFn) {
  const gistInitRef = useRef(false);

  useEffect(() => {
    if (gistInitRef.current) return;
    gistInitRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const gistParam = params.get('gist');
    if (!gistParam) return;

    const gistId = extractGistId(gistParam);
    if (!gistId) {
      toast.warning('Invalid gist parameter.');
      return;
    }

    const fileName = params.get('file') ?? undefined;
    const controller = new AbortController();

    const load = async () => {
      try {
        const content = await fetchGistContent(gistId, {
          fileName,
          signal: controller.signal,
        });
        setCode(content, true);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;

        console.error('Failed to load gist:', error);
        toast.warning('Failed to load gist. Check the ID and try again.');
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [setCode]);
}
