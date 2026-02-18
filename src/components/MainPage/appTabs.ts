export const APP_TABS = [
  { value: 'input', label: 'Input' },
  { value: 'run', label: 'Run' },
  { value: 'configurationGraph', label: 'Configuration Graph' },
  { value: 'configurationTree', label: 'Computation Tree' },
] as const;

export type AppTab = (typeof APP_TABS)[number]['value'];
