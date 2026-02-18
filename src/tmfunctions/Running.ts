// src/tmfunctions/Running.ts
import { toast } from 'sonner';

import {
  getCurrentConfiguration,
  nextConfigurationsFromState,
} from '@tmfunctions/Configurations';
import { printTMState } from '@utils/printTMState';
import {
  useGlobalZustand,
  type PendingRunChoice,
  type RunChoiceOption,
} from '@zustands/GlobalZustand';
import { Configuration, Move, type Transition, hashConfig } from '@mytypes/TMTypes';

function buildFallbackTransition(
  fromState: string,
  toState: string,
  tapeCount: number
): Transition {
  return {
    from: fromState,
    to: toState,
    tapecondition: Array.from({ length: tapeCount }, () => ({})),
    write: Array.from({ length: tapeCount }, () => ({})),
    direction: Array.from({ length: tapeCount }, () => Move.S),
  };
}

function getNextChoices(currentConfig: Configuration): RunChoiceOption[] {
  const store = useGlobalZustand.getState();
  const perStateTransitions = store.transitions.get(currentConfig.state) ?? [];
  const raw = nextConfigurationsFromState(currentConfig);

  return raw.map(([config, transitionIndex]) => ({
    config,
    transitionIndex,
    transition:
      perStateTransitions[transitionIndex] ??
      buildFallbackTransition(currentConfig.state, config.state, store.numberOfTapes),
  }));
}

function applyStepTransition(
  currentConfig: Configuration,
  nextConfig: Configuration,
  transitionIndex: number
) {
  const store = useGlobalZustand.getState();

  store.setRunning(true);
  store.setLastState(currentConfig.state);
  store.setLastTransition(transitionIndex);
  store.setTapes(nextConfig.tapes);
  store.setHeads(nextConfig.heads);
  store.setCurrentState(nextConfig.state);
  store.triggerTransition();
  store.setLastConfig(currentConfig);
  store.clearRunChoice();

  if (import.meta.env.DEV) {
    console.log(nextConfig.state);
    console.log(transitionIndex);
    console.log('TM State: ', printTMState());
  }
}

function groupPendingChoices(
  currentConfig: Configuration,
  choices: RunChoiceOption[]
): PendingRunChoice {
  const grouped = new Map<string, RunChoiceOption[]>();

  for (const choice of choices) {
    const bucket = grouped.get(choice.config.state) ?? [];
    bucket.push(choice);
    grouped.set(choice.config.state, bucket);
  }

  const byState = Array.from(grouped.entries())
    .map(([nextState, options]) => ({
      nextState,
      edgeId: `${currentConfig.state}→${nextState}`,
      options,
    }))
    .sort((a, b) => a.nextState.localeCompare(b.nextState));

  return {
    fromConfig: currentConfig,
    byState,
    selectedState: byState.length === 1 ? byState[0].nextState : null,
  };
}

// Returned boolean is whether a step was executed.
export function makeStep(): boolean {
  const store = useGlobalZustand.getState();
  const currentConfig = getCurrentConfiguration();

  if (store.pendingRunChoice) {
    toast.warning('Please resolve the pending transition choice first.');
    return false;
  }

  const choices = getNextChoices(currentConfig);

  if (choices.length === 0) {
    console.warn('No next configuration available. The machine has stopped.');
    return false;
  }

  if (choices.length === 1) {
    applyStepTransition(currentConfig, choices[0].config, choices[0].transitionIndex);
    return true;
  }

  const pending = groupPendingChoices(currentConfig, choices);
  store.setRunning(false);
  store.setRunningLive(false);
  store.setPendingRunChoice(pending);
  store.setRunChoiceHighlightedTMEdges(pending.byState.map((entry) => entry.edgeId));

  if (pending.byState.length === 1) {
    toast.info('Multiple next configurations found. Choose one in the dialog.');
  } else {
    toast.info(
      'Multiple next states found. Click a highlighted TM transition to choose the next configuration.'
    );
  }

  return false;
}

export function selectPendingRunChoice(nextState: string, optionIndex: number): boolean {
  const store = useGlobalZustand.getState();
  const pending = store.pendingRunChoice;
  if (!pending) return false;

  const currentConfig = getCurrentConfiguration();
  if (hashConfig(currentConfig) !== hashConfig(pending.fromConfig)) {
    store.clearRunChoice();
    toast.warning('Pending transition choice became stale and was cleared.');
    return false;
  }

  const group = pending.byState.find((entry) => entry.nextState === nextState);
  if (!group) return false;

  const option = group.options[optionIndex];
  if (!option) return false;

  applyStepTransition(pending.fromConfig, option.config, option.transitionIndex);
  return true;
}

export function closePendingRunChoiceDialog() {
  const store = useGlobalZustand.getState();
  if (!store.pendingRunChoice) return;
  store.setPendingRunChoiceState(null);
}

export function clearPendingRunChoice() {
  useGlobalZustand.getState().clearRunChoice();
}

export function handleTMGraphRunChoiceEdgeClick(from: string, to: string): boolean {
  const store = useGlobalZustand.getState();
  const pending = store.pendingRunChoice;
  if (!pending) return false;
  if (pending.fromConfig.state !== from) return false;

  const group = pending.byState.find((entry) => entry.nextState === to);
  if (!group) return false;

  store.setPendingRunChoiceState(to);
  return true;
}

export function startRunningLive(runningID: number = -1) {
  useGlobalZustand.getState().setRunningLive(true);
  let currentRunningID = useGlobalZustand.getState().runningLiveID;
  if (runningID === -1) {
    useGlobalZustand.getState().incrementRunningLiveID();
    currentRunningID += 1;
  }
  if (makeStep()) {
    const delayMs = useGlobalZustand.getState().runSpeedMs;
    setTimeout(() => {
      if (!useGlobalZustand.getState().runningLive) return;
      if (currentRunningID !== useGlobalZustand.getState().runningLiveID) return;
      startRunningLive(currentRunningID);
    }, delayMs);
  } else {
    useGlobalZustand.getState().setRunningLive(false);
  }
}

export function stopRunningLive() {
  useGlobalZustand.getState().setRunningLive(false);
}

export function runningReset() {
  const store = useGlobalZustand.getState();
  const numTapes = store.tapes.length;

  store.setRunningLive(false);
  store.setRunning(false);
  store.setCurrentState(store.startState);
  store.setHeads(Array(numTapes).fill(0));
  store.setTapes(store.input.map((tape) => [...tape]));
  store.setLastState('');
  store.setLastTransition(-1);
  store.setLastConfig(null);
  store.clearRunChoice();
}

export function setConfiguration(config: Configuration) {
  const store = useGlobalZustand.getState();
  const currentConfig = getCurrentConfiguration();
  const targetHash = hashConfig(config);

  let isNext = false;
  let transitionIndex = -1;
  const nextChoices = getNextChoices(currentConfig);

  for (const choice of nextChoices) {
    if (hashConfig(choice.config) === targetHash) {
      isNext = true;
      transitionIndex = choice.transitionIndex;
      break;
    }
  }

  store.setRunningLive(false);
  store.incrementRunningLiveID();
  store.clearRunChoice();

  if (!isNext) {
    store.setRunning(false);
    store.setCurrentState(config.state);
    store.setHeads(config.heads);
    store.setTapes(config.tapes);
    store.setLastState('');
    store.setLastTransition(-1);
    store.setLastConfig(null);
    return;
  }

  applyStepTransition(currentConfig, config, transitionIndex);
}
