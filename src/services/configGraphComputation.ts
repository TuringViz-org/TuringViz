import { getStartConfiguration } from '@tmfunctions/Configurations';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import {
  cancelConfigGraphCompute,
  computeConfigGraphInWorker,
  isGraphComputeCancelled,
} from '@utils/graphWorkerClient';
import { MIN_CONFIG_GRAPH_TARGET_NODES } from '@utils/constants';

let latestRequest = 0;

/** All configuration-graph replacements share one commit boundary. */
export async function recomputeConfigGraphWithTargetNodes(
  targetNodes: number
): Promise<boolean> {
  const machine = useGlobalZustand.getState();
  if (!machine.startState || machine.transitions.size === 0) return false;

  const request = ++latestRequest;
  const finish = machine.beginConfigGraphCompute();
  const matchesMachine = (current: typeof machine) =>
    current.machineLoadVersion === machine.machineLoadVersion &&
    current.transitions === machine.transitions &&
    current.input === machine.input &&
    current.startState === machine.startState &&
    current.numberOfTapes === machine.numberOfTapes &&
    current.blank === machine.blank;
  const unsubscribe = useGlobalZustand.subscribe((current) => {
    if (request === latestRequest && !matchesMachine(current)) {
      cancelConfigGraphCompute();
    }
  });
  try {
    const graph = await computeConfigGraphInWorker({
      startConfig: getStartConfiguration(),
      transitions: machine.transitions,
      numberOfTapes: machine.numberOfTapes,
      blank: machine.blank,
      targetNodes: Math.max(MIN_CONFIG_GRAPH_TARGET_NODES, Math.floor(targetNodes)),
    });

    const current = useGlobalZustand.getState();
    if (request !== latestRequest || !matchesMachine(current)) return false;

    // Publish graph and version together: subscribers must never see a new graph
    // accompanied by the old layout version.
    useGlobalZustand.setState({
      configGraph: graph,
      configGraphVersion: current.configGraphVersion + 1,
    });
    return true;
  } catch (error) {
    if (!isGraphComputeCancelled(error)) {
      console.error('Failed to recompute configuration graph:', error);
    }
    return false;
  } finally {
    unsubscribe();
    finish();
  }
}
