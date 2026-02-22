// src/components/ConfigGraph/ConfigGraph.tsx
import { useEffect } from 'react';

import { GraphUIProvider } from '@components/shared/GraphUIContext';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useGraphZustand } from '@zustands/GraphZustand';
import { ConfigNodeMode } from '@utils/constants';

import { ConfigGraphCircles } from './ConfigGraphCircles';

export function ConfigGraph() {
  const setConfigGraphNodeMode = useGraphZustand((s) => s.setConfigGraphNodeMode);

  useEffect(() => {
    setConfigGraphNodeMode(ConfigNodeMode.CIRCLES);
  }, [setConfigGraphNodeMode]);

  return <ConfigGraphCircles />;
}

export function ConfigGraphWrapper() {
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  return (
    <GraphUIProvider key={machineLoadVersion}>
      <ConfigGraph />
    </GraphUIProvider>
  );
}
