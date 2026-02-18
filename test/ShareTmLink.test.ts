// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildSharedMachineUrl,
  decodeSharedMachine,
  encodeSharedMachine,
  parseSharedMachineFromHash,
} from '@utils/shareTmLink';
import { NonDetSubSetSum } from '@utils/ExampleTMs';

describe('shareTmLink', () => {
  it('round-trips encoded machine text', async () => {
    const encoded = await encodeSharedMachine(NonDetSubSetSum.code);
    expect(encoded).toBeTruthy();

    const decoded = await decodeSharedMachine(encoded!);
    expect(decoded).toBe(NonDetSubSetSum.code);
  });

  it('builds and parses a share URL hash payload', async () => {
    const url = await buildSharedMachineUrl(NonDetSubSetSum.code);
    expect(url).toMatch(/^https:\/\/turingviz\.org\/#tm=/);

    const hash = new URL(url!).hash;
    const decoded = await parseSharedMachineFromHash(hash);
    expect(decoded).toBe(NonDetSubSetSum.code);
  });

  it('returns null for invalid payloads', async () => {
    await expect(parseSharedMachineFromHash('#tm=v2.br.invalid_payload')).resolves.toBeNull();
  });

  it('returns null for legacy unsupported payloads', async () => {
    await expect(parseSharedMachineFromHash('#tm=v1.anything')).resolves.toBeNull();
  });
});
