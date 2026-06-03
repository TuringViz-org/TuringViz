// src/tmfunctions/Running.ts
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
import {
  isAcceptingStateName,
  isRejectingStateName,
  type RunMode,
} from '@utils/constants';

// Run modes that resolve nondeterministic choices automatically.
type AutoRunMode = Exclude<RunMode, 'manual'>;

// Outcome of searching whether a targeted (accepting/rejecting) state is reachable.
type ReachResult = 'reachable' | 'unreachable' | 'limit-reached';

const RANDOM_OUTCOME_SEARCH_LIMIT = 50000;

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

function matchesTargetMode(state: string, mode: 'accepting' | 'rejecting') {
  return mode === 'accepting' ? isAcceptingStateName(state) : isRejectingStateName(state);
}

// BFS over reachable configurations to check whether an accepting/rejecting state
// can be reached. Bounded by RANDOM_OUTCOME_SEARCH_LIMIT distinct configurations;
// if the bound is hit before the search space is exhausted, the answer is unknown
// ('limit-reached') rather than a definitive 'unreachable'.
function reachesTargetMode(
  config: Configuration,
  mode: 'accepting' | 'rejecting'
): ReachResult {
  const store = useGlobalZustand.getState();
  const seen = new Set<string>();
  const queue = [config];
  let head = 0;

  while (head < queue.length) {
    if (seen.size >= RANDOM_OUTCOME_SEARCH_LIMIT) return 'limit-reached';

    const current = queue[head++];
    if (matchesTargetMode(current.state, mode)) return 'reachable';

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

  return 'unreachable';
}

type PickResult = { choice: RunChoiceOption | null; limitReached: boolean };

function pickRandomChoice(choices: RunChoiceOption[], mode: AutoRunMode): PickResult {
  // 'random' is truly random: pick uniformly among all next configurations.
  if (mode === 'random') {
    if (choices.length === 0) return { choice: null, limitReached: false };
    return { choice: choices[Math.floor(Math.random() * choices.length)], limitReached: false };
  }

  // 'accepting'/'rejecting': keep only choices from which the target is reachable.
  const eligible: RunChoiceOption[] = [];
  let limitReached = false;
  for (const choice of choices) {
    const result = reachesTargetMode(choice.config, mode);
    if (result === 'reachable') eligible.push(choice);
    else if (result === 'limit-reached') limitReached = true;
  }

  if (eligible.length === 0) return { choice: null, limitReached };
  return { choice: eligible[Math.floor(Math.random() * eligible.length)], limitReached };
}

function warnNoComputationAvailable(mode: AutoRunMode, limitReached: boolean) {
  // No stable id: every Step/Start attempt should surface the message anew.
  if (limitReached) {
    toast.warning(
      `Reached the search limit of ${RANDOM_OUTCOME_SEARCH_LIMIT} configurations without confirming a ${mode} computation. Switch the run mode to continue.`
    );
  } else {
    toast.warning(
      `No ${mode} computation is reachable from here. Switch the run mode to continue.`
    );
  }
}

function pauseForManualChoice(currentConfig: Configuration, choices: RunChoiceOption[]) {
  const store = useGlobalZustand.getState();
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

  // Manual mode: pause and let the user pick (highlight edges + dialog).
  if (store.runMode === 'manual') {
    pauseForManualChoice(currentConfig, choices);
    return false;
  }

  // Automatic mode: resolve the choice ourselves.
  const { choice, limitReached } = pickRandomChoice(choices, store.runMode);
  if (choice) {
    applyStepTransition(currentConfig, choice.config, choice.transitionIndex);
    return true;
  }

  // No reachable target in this mode: do NOT fall back to a manual choice.
  // Show a single toast; the run stays put until the user switches the mode.
  warnNoComputationAvailable(store.runMode, limitReached);
  return false;
}

// Switches the run mode and, if we're paused on a nondeterministic choice and the
// new mode is automatic, resolves that pending choice immediately so running can
// continue from the current configuration.
export function changeRunMode(mode: RunMode) {
  const store = useGlobalZustand.getState();
  store.setRunMode(mode);

  if (mode === 'manual') return;

  const pending = store.pendingRunChoice;
  if (!pending) return;

  const choices = pending.byState.flatMap((entry) => entry.options);
  const { choice, limitReached } = pickRandomChoice(choices, mode);
  if (!choice) {
    // Nothing reachable in this mode: drop the manual choice/highlights so the
    // run is blocked with a single toast until the user switches the mode again.
    store.clearRunChoice();
    warnNoComputationAvailable(mode, limitReached);
    return;
  }

  applyStepTransition(pending.fromConfig, choice.config, choice.transitionIndex);
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
