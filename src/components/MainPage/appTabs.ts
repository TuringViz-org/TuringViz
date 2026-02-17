export const APP_TABS = [
  { value: 'input', label: 'Input' },
  { value: 'run', label: 'Run' },
  { value: 'configurationGraph', label: 'Configuration Graph' },
  { value: 'configurationTree', label: 'Configuration Tree' },
] as const;

export type AppTab = (typeof APP_TABS)[number]['value'];
