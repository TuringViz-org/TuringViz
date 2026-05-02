import { parseTuringMachine } from './index';
import type { Diagnostic, MachineProgram, ParseResult } from './types';

export function parseFixture(source: string): ParseResult {
  return parseTuringMachine(source);
}

export function expectValidMachine(source: string): MachineProgram {
  const result = parseFixture(source);

  expect(result.diagnostics).toEqual([]);
  expect(result.machine).toBeDefined();

  return result.machine!;
}

export function expectDiagnosticCodes(
  source: string,
  expectedCodes: string[],
): Diagnostic[] {
  const result = parseFixture(source);
  const actualCodes = result.diagnostics.map((diagnostic) => diagnostic.code);

  expect(result.machine).toBeUndefined();
  expect(actualCodes).toEqual(expect.arrayContaining(expectedCodes));

  return result.diagnostics;
}
