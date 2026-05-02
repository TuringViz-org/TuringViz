import { describe, expect, it } from 'vitest';

import { ExampleTMs } from '@utils/ExampleTMs';
import { parseTuringMachine } from '../src/tmLanguage';

describe('Example machines', () => {
  it.each(ExampleTMs)('$name uses the current machine language', ({ code }) => {
    const result = parseTuringMachine(code);

    expect(result.diagnostics).toEqual([]);
    expect(result.machine).toBeDefined();
  });
});
