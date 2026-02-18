// src/zustands/EditorZustand.ts
import { create } from 'zustand';
import { ExampleTMs } from '@utils/ExampleTMs';

const RECENT_MACHINES_STORAGE_KEY = 'turingviz.recentMachines.v1';
const MAX_RECENT_MACHINES = 10;

export type RecentMachine = {
  id: string;
  label: string;
  code: string;
  loadedAt: number;
};

function getRecentMachineLabel(code: string): string {
  const lines = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return 'Untitled machine';

  const nameLine = lines.find((line) => /^name\s*:/i.test(line));
  const raw = (nameLine ?? lines[0]).replace(/^name\s*:\s*/i, '').trim();
  const unquoted = raw.replace(/^["'](.*)["']$/, '$1').trim();
  const label = unquoted || 'Untitled machine';
  return label.length > 80 ? `${label.slice(0, 77)}...` : label;
}

function loadRecentMachinesFromStorage(): RecentMachine[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];

  try {
    const raw = window.localStorage.getItem(RECENT_MACHINES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is RecentMachine => {
        return (
          entry &&
          typeof entry === 'object' &&
          typeof entry.id === 'string' &&
          typeof entry.label === 'string' &&
          typeof entry.code === 'string' &&
          typeof entry.loadedAt === 'number'
        );
      })
      .slice(0, MAX_RECENT_MACHINES);
  } catch {
    return [];
  }
}

function persistRecentMachinesToStorage(machines: RecentMachine[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      RECENT_MACHINES_STORAGE_KEY,
      JSON.stringify(machines)
    );
  } catch {
    // Ignore storage write failures (quota/private mode).
  }
}

interface EditorZustand {
  // For the MonacoEditor
  code: string;
  setCode: (code: string, force?: boolean) => void;
  recentMachines: RecentMachine[];
  rememberRecentMachine: (code: string) => void;
  // Used to force reloading the editor, e.g. after selecting the same example again
  // (Monaco does not reload if the value is the same)
  nonce: number;
  bumpNonce: () => void;
}

export const useEditorZustand = create<EditorZustand>((set, get) => ({
  code: ExampleTMs[0].code,
  recentMachines: loadRecentMachinesFromStorage(),
  nonce: 0,
  setCode: (code, force = false) => {
    const same = get().code === code;
    set({
      code,
      nonce: force || same ? get().nonce + 1 : get().nonce,
    });
  },
  rememberRecentMachine: (code) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    const now = Date.now();
    const next: RecentMachine[] = [
      {
        id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
        label: getRecentMachineLabel(code),
        code,
        loadedAt: now,
      },
      ...get().recentMachines.filter((entry) => entry.code !== code),
    ].slice(0, MAX_RECENT_MACHINES);

    // Persist first so the content survives even if parsing/rendering crashes afterwards.
    persistRecentMachinesToStorage(next);
    set({ recentMachines: next });
  },
  bumpNonce: () => set((s) => ({ nonce: s.nonce + 1 })),
}));
