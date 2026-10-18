import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GraphUIProvider } from '@components/shared/GraphUIContext';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import { useConfigGraphNodeMode } from '@zustands/GraphZustand';
import { ConfigNodeMode } from '@utils/constants';
import { ConfigGraphCards } from './ConfigGraphCards';
import { ConfigGraphCircles } from './ConfigGraphCircles';

export function ConfigGraph({ active = true }: { active?: boolean }) {
  const nodeMode = useConfigGraphNodeMode();
  if (nodeMode === ConfigNodeMode.CARDS) return <ConfigGraphCards active={active} />;
  return <ConfigGraphCircles active={active} />;
}

export function ConfigGraphWrapper({ active = true }: { active?: boolean }) {
  const machineLoadVersion = useGlobalZustand((s) => s.machineLoadVersion);
  return (
    <ReactFlowProvider>
      <GraphUIProvider key={machineLoadVersion} active={active}>
        <ConfigGraph active={active} />
      </GraphUIProvider>
    </ReactFlowProvider>
  );
}
