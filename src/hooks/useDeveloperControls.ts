import { useEffect, useState } from 'react';

function readDeveloperControlsEnabled() {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get('dev') === 'true') return true;

  return window.location.pathname
    .split('/')
    .filter(Boolean)
    .includes('dev');
}

export function useDeveloperControls() {
  const [enabled, setEnabled] = useState(readDeveloperControlsEnabled);

  useEffect(() => {
    const update = () => setEnabled(readDeveloperControlsEnabled());

    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);

  return enabled;
}
