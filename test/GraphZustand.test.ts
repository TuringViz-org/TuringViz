import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphZustand } from '@zustands/GraphZustand';
import { ConfigNodeMode, DEFAULT_GRAPH_NODES_ELK_OPTS } from '@utils/constants';

describe('graph settings', () => {
  beforeEach(() => useGraphZustand.getState().reset());

  it('preserves functional updates and independent partial ELK settings', () => {
    const settings = useGraphZustand.getState();
    settings.setConfigGraphNodeMode(() => ConfigNodeMode.CARDS);
    settings.setComputationTreeDepth((previous) => previous + 1);
    settings.setConfigGraphELKSettings((previous) => ({
      nodeSep: previous.nodeSep + 1,
    }));
    const updated = useGraphZustand.getState();
    expect(updated.configGraphNodeMode).toBe(ConfigNodeMode.CARDS);
    expect(updated.computationTreeDepth).toBe(settings.computationTreeDepth + 1);
    expect(updated.configGraphELKSettings).toEqual({
      ...settings.configGraphELKSettings,
      nodeSep: settings.configGraphELKSettings.nodeSep + 1,
    });
    expect(updated.computationTreeELKSettings).toBe(
      settings.computationTreeELKSettings
    );
    updated.reset();
    expect(useGraphZustand.getState().configGraphELKSettings).toEqual(
      DEFAULT_GRAPH_NODES_ELK_OPTS
    );
    expect(useGraphZustand.getState().configGraphELKSettings).not.toBe(
      settings.configGraphELKSettings
    );
  });
});
