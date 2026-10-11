import { useEffect, type RefObject } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../src/App';
import { useGlobalZustand } from '@zustands/GlobalZustand';
import type { FullscreenPortalConfig } from '@components/MainPage/FullscreenPortals';
import type { AppTab } from '@components/MainPage/appTabs';
import { useGraphCurrentConfiguration } from '@hooks/useGraphCurrentConfiguration';

const graphUpdate = vi.hoisted(() => vi.fn());
const graphMount = vi.hoisted(() => vi.fn());

vi.mock('@components/MainPage/MainHeader', () => ({
  MainHeader: ({ onTabChange }: { onTabChange: (tab: AppTab) => void }) => (
    <>
      {(['run', 'configurationGraph', 'configurationTree'] as const).map((tab) => (
        <button key={tab} onClick={() => onTabChange(tab)}>
          {tab}
        </button>
      ))}
    </>
  ),
}));

vi.mock('@components/MainPage/DashboardLayout', () => ({
  DashboardLayout: ({
    tmPanelRef,
    configPanelRef,
    treePanelRef,
    onOpenConfigFullscreen,
  }: {
    tmPanelRef: RefObject<HTMLDivElement | null>;
    configPanelRef: RefObject<HTMLDivElement | null>;
    treePanelRef: RefObject<HTMLDivElement | null>;
    onOpenConfigFullscreen: () => void;
  }) => (
    <>
      <div ref={tmPanelRef} />
      <div ref={configPanelRef} />
      <div ref={treePanelRef} />
      <button onClick={onOpenConfigFullscreen}>Fullscreen graph</button>
    </>
  ),
}));

vi.mock('@components/MainPage/FullscreenPortals', () => ({
  FullscreenPortals: ({ items }: { items: FullscreenPortalConfig[] }) => (
    <>
      {items.map((item) =>
        item.enabled ? <div key={item.id}>{item.content}</div> : null
      )}
    </>
  ),
}));

vi.mock('@components/MainPage/lazyPanels', () => {
  function Graph({ name, active }: { name: string; active: boolean }) {
    const config = useGraphCurrentConfiguration(active);
    useEffect(() => {
      graphMount(name);
    }, [name]);
    useEffect(() => {
      graphUpdate(name);
    }, [name, config]);
    return <div data-testid={name} data-state={config.state} data-active={active} />;
  }
  return {
    LazyTMGraphWrapper: () => null,
    LazyConfigGraphWrapper: ({ active }: { active: boolean }) => (
      <Graph name="config" active={active} />
    ),
    LazyComputationTreeWrapper: ({ active }: { active: boolean }) => (
      <Graph name="tree" active={active} />
    ),
    LazyRunChoiceDialog: () => null,
  };
});

vi.mock('@components/Footer/SiteFooter', () => ({ default: () => null }));
vi.mock('@components/MainPage/AppToaster', () => ({ AppToaster: () => null }));
vi.mock('@components/MainPage/hooks/useGistBootstrap', () => ({
  useGistBootstrap: () => {},
}));
vi.mock('@components/MainPage/hooks/useSharedMachineBootstrap', () => ({
  useSharedMachineBootstrap: () => {},
}));

describe('inactive graph panels', () => {
  beforeEach(() => {
    useGlobalZustand.getState().reset();
    graphUpdate.mockClear();
    graphMount.mockClear();
  });
  afterEach(cleanup);

  it.each([
    ['configurationGraph', 'config'],
    ['configurationTree', 'tree'],
  ])('retains %s without processing hidden run steps', (tab, name) => {
    render(<App />);
    expect(screen.queryByTestId(name)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(tab));
    const instance = screen.getByTestId(name);

    fireEvent.click(screen.getByText('run'));
    expect(screen.getByTestId(name)).toBe(instance);
    expect(instance).toHaveAttribute('data-active', 'false');
    graphUpdate.mockClear();

    act(() => {
      for (let i = 0; i < 100; i++) {
        useGlobalZustand.getState().setCurrentState(`q${i}`);
        useGlobalZustand.getState().setTapes([[[], [{ value: String(i) }]]]);
      }
    });
    expect(graphUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(tab));
    expect(screen.getByTestId(name)).toBe(instance);
    expect(instance).toHaveAttribute('data-state', 'q99');
    expect(graphUpdate).toHaveBeenCalledTimes(1);
    expect(graphMount).toHaveBeenCalledTimes(1);

    // Repeated tab changes retain the same renderer and its local viewport state.
    fireEvent.click(screen.getByText('run'));
    fireEvent.click(screen.getByText(tab));
    expect(screen.getByTestId(name)).toBe(instance);
    expect(graphMount).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['configurationGraph', 'config'],
    ['configurationTree', 'tree'],
  ])('discards the cached %s only when another machine is loaded', (tab, name) => {
    render(<App />);
    fireEvent.click(screen.getByText(tab));
    fireEvent.click(screen.getByText('run'));
    graphUpdate.mockClear();
    act(() => {
      useGlobalZustand
        .getState()
        .setAll(new Set(['q0']), 'q0', new Map(), '_', 1, [[[], []]], null);
    });
    expect(screen.queryByTestId(name)).not.toBeInTheDocument();
    expect(graphUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(tab));
    expect(screen.getByTestId(name)).toHaveAttribute('data-state', 'q0');
    expect(graphMount).toHaveBeenCalledTimes(2);
  });

  it('keeps a graph active while it is open in fullscreen', () => {
    render(<App />);
    fireEvent.click(screen.getByText('configurationGraph'));
    fireEvent.click(screen.getByText('Fullscreen graph'));
    fireEvent.click(screen.getByText('run'));
    expect(screen.getByTestId('config')).toHaveAttribute('data-active', 'true');
    act(() => {
      useGlobalZustand.getState().setCurrentState('q1');
    });
    expect(screen.getByTestId('config')).toHaveAttribute('data-state', 'q1');
  });
});
