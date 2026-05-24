// src/tmfunctions/Running.ts
import { createElement } from 'react';
import { toast } from 'sonner';

import {
  getCurrentConfiguration,
  nextConfigurations,
  nextConfigurationsFromState,
} from '@tmfunctions/Configurations';
import {
  useGlobalZustand,
  type PendingRunChoice,
  type RunChoiceOption,
} from '@zustands/GlobalZustand';
import { Configuration, Move, type Transition, hashConfig } from '@mytypes/TMTypes';

type RandomRunChoiceMode = 'all' | 'accepting' | 'rejecting';

const ACCEPTING_STATES = new Set(['accept', 'accepted', 'done']);
const REJECTING_STATES = new Set(['reject', 'rejected', 'error']);
const RANDOM_OUTCOME_SEARCH_LIMIT = 10000;

let randomRunChoiceMode: RandomRunChoiceMode | null = null;
let resumeLiveAfterRandomChoice = false;

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

function matchesRandomMode(state: string, mode: RandomRunChoiceMode) {
  const lower = state.toLowerCase();
  if (mode === 'accepting') return ACCEPTING_STATES.has(lower);
  if (mode === 'rejecting') return REJECTING_STATES.has(lower);
  return true;
}

function reachesRandomMode(config: Configuration, mode: RandomRunChoiceMode) {
  if (mode === 'all') return true;

  const store = useGlobalZustand.getState();
  const seen = new Set<string>();
  const queue = [config];
  let head = 0;

  while (head < queue.length && seen.size < RANDOM_OUTCOME_SEARCH_LIMIT) {
    const current = queue[head++];
    if (matchesRandomMode(current.state, mode)) return true;

    const hash = hashConfig(current);
    if (seen.has(hash)) continue;
    seen.add(hash);

    const transitions = store.transitions.get(current.state);
    if (!transitions) continue;

    const nexts = nextConfigurations(
      current,
      transitions,
      store.numberOfTapes,
      store.blank
    );
    for (const [nextConfig] of nexts) queue.push(nextConfig);
  }

  return false;
}

function pickRandomChoice(
  choices: RunChoiceOption[],
  mode: RandomRunChoiceMode
): RunChoiceOption | null {
  const eligible = choices.filter((choice) => reachesRandomMode(choice.config, mode));
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

function resumeLiveRun() {
  const store = useGlobalZustand.getState();
  store.incrementRunningLiveID();
  const runningID = useGlobalZustand.getState().runningLiveID;
  store.setRunningLive(true);

  setTimeout(() => {
    const latest = useGlobalZustand.getState();
    if (!latest.runningLive || latest.runningLiveID !== runningID) return;
    startRunningLive(runningID);
  }, store.runSpeedMs);
}

function chooseRandomlyFromNowOn(mode: RandomRunChoiceMode) {
  randomRunChoiceMode = mode;

  const store = useGlobalZustand.getState();
  const pending = store.pendingRunChoice;
  const shouldResumeLive = resumeLiveAfterRandomChoice;
  resumeLiveAfterRandomChoice = false;

  if (!pending) return;

  const choices = pending.byState.flatMap((entry) => entry.options);
  const choice = pickRandomChoice(choices, mode);
  if (!choice) {
    toast.warning(`No ${mode} computation is available from this choice.`);
    return;
  }

  applyStepTransition(pending.fromConfig, choice.config, choice.transitionIndex);
  toast.success(`Future nondeterministic choices will be ${mode} random.`);

  if (shouldResumeLive) resumeLiveRun();
}

function randomModeButton(label: string, mode: RandomRunChoiceMode, toastId: string) {
  return createElement(
    'button',
    {
      type: 'button',
      onClick: () => {
        toast.dismiss(toastId);
        chooseRandomlyFromNowOn(mode);
      },
      style: {
        border: '1px solid currentColor',
        borderRadius: 4,
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
        padding: '2px 6px',
      },
    },
    label
  );
}

function showRunChoiceToast(message: string) {
  const toastId = `run-choice-${Date.now()}`;

  toast.info(message, {
    id: toastId,
    duration: 12000,
    description: createElement(
      'div',
      { style: { display: 'grid', gap: 6 } },
      createElement(
        'span',
        null,
        'Alternatively, let all transitions be chosen randomly or towards a random accepting or rejecting computation: '
      ),
      createElement(
        'div',
        { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
        randomModeButton('Fully random', 'all', toastId),
        randomModeButton('Accepting', 'accepting', toastId),
        randomModeButton('Rejecting', 'rejecting', toastId)
      )
    ),
  });
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

  if (randomRunChoiceMode) {
    const choice = pickRandomChoice(choices, randomRunChoiceMode);
    if (choice) {
      applyStepTransition(currentConfig, choice.config, choice.transitionIndex);
      return true;
    }
    toast.warning(`No ${randomRunChoiceMode} computation is available from this choice.`);
  }

  const pending = groupPendingChoices(currentConfig, choices);
  resumeLiveAfterRandomChoice = store.runningLive;
  store.setRunning(false);
  store.setRunningLive(false);
  store.setPendingRunChoice(pending);
  store.setRunChoiceHighlightedTMEdges(pending.byState.map((entry) => entry.edgeId));

  if (pending.byState.length === 1) {
    showRunChoiceToast('Multiple next configurations found. Choose one in the dialog.');
  } else {
    showRunChoiceToast(
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
