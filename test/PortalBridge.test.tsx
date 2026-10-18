import { StrictMode, useEffect, useRef } from 'react';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PortalBridge,
  PORTAL_BRIDGE_BEFORE_SWITCH_EVENT,
  PORTAL_BRIDGE_SWITCH_EVENT,
  type PortalBridgeSwitchDetail,
} from '@components/MainPage/PortalBridge';
import { useFullscreenState } from '@components/MainPage/hooks/useFullscreenState';
import { FullscreenShell } from '@components/MainPage/FullscreenShell';

function Panel({ mounted }: { mounted: () => void }) {
  useEffect(mounted, [mounted]);
  return <div data-testid="renderer">Graph</div>;
}

function Harness({
  active,
  enabled = true,
  mounted,
}: {
  active: boolean;
  enabled?: boolean;
  mounted: () => void;
}) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div data-testid="panel" ref={fallbackRef} />
      <div data-testid="fullscreen" ref={targetRef} />
      <PortalBridge
        id="configGraph"
        active={active}
        enabled={enabled}
        fallbackRef={fallbackRef}
        targetRef={targetRef}
      >
        <Panel mounted={mounted} />
      </PortalBridge>
    </>
  );
}

afterEach(cleanup);

describe('stable graph portal', () => {
  it('moves the same renderer and portal node across repeated fullscreen transitions', async () => {
    const mounted = vi.fn();
    const view = render(<Harness active={false} mounted={mounted} />);
    const renderer = screen.getByTestId('renderer');
    const portal = renderer.parentElement;
    for (const active of [true, false, true, false]) {
      view.rerender(<Harness active={active} mounted={mounted} />);
      expect(screen.getByTestId('renderer')).toBe(renderer);
      expect(renderer.parentElement).toBe(portal);
      expect(screen.getByTestId(active ? 'fullscreen' : 'panel')).toContainElement(
        renderer
      );
    }
    await act(async () => {});
    expect(mounted).toHaveBeenCalledOnce();
  });

  it('notifies before moving and discards superseded queued switch notifications', async () => {
    const mounted = vi.fn();
    const before: Array<string | undefined> = [];
    const after: string[] = [];
    const onBefore = () =>
      before.push(
        screen.queryByTestId('renderer')?.parentElement?.parentElement?.dataset
          .testid
      );
    const onAfter = (event: Event) =>
      after.push((event as CustomEvent<PortalBridgeSwitchDetail>).detail.location);
    window.addEventListener(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, onBefore);
    window.addEventListener(PORTAL_BRIDGE_SWITCH_EVENT, onAfter);
    try {
      const view = render(<Harness active={false} mounted={mounted} />);
      await act(async () => {});
      before.length = 0;
      after.length = 0;
      view.rerender(<Harness active mounted={mounted} />);
      view.rerender(<Harness active={false} mounted={mounted} />);
      await act(async () => {});
      expect(before).toEqual(['panel', 'fullscreen']);
      expect(after).toEqual(['fallback']);
      view.rerender(<Harness active mounted={mounted} />);
      view.unmount();
      await act(async () => {});
      expect(after).toEqual(['fallback']);
    } finally {
      window.removeEventListener(PORTAL_BRIDGE_BEFORE_SWITCH_EVENT, onBefore);
      window.removeEventListener(PORTAL_BRIDGE_SWITCH_EVENT, onAfter);
    }
  });

  it('reattaches cleanly under StrictMode and releases disabled machine panels', () => {
    const mounted = vi.fn();
    const view = render(
      <StrictMode>
        <Harness active={false} mounted={mounted} />
      </StrictMode>
    );
    expect(screen.getByTestId('panel')).toContainElement(
      screen.getByTestId('renderer')
    );
    view.rerender(
      <StrictMode>
        <Harness active enabled={false} mounted={mounted} />
      </StrictMode>
    );
    expect(screen.queryByTestId('renderer')).toBeNull();
    expect(screen.getByTestId('panel')).toBeEmptyDOMElement();
    view.rerender(
      <StrictMode>
        <Harness active mounted={mounted} />
      </StrictMode>
    );
    expect(screen.getByTestId('fullscreen')).toContainElement(
      screen.getByTestId('renderer')
    );
  });
});

describe('fullscreen transition state', () => {
  it('masks explicitly visible graph nodes while preserving the mounted fullscreen content', () => {
    const mounted = vi.fn();
    const props = {
      title: 'Graph',
      open: true,
      onClose: vi.fn(),
      setRender: vi.fn(),
    };
    const content = (
      <div data-testid="visible-card" style={{ visibility: 'visible' }}>
        <Panel mounted={mounted} />
      </div>
    );
    const view = render(
      <FullscreenShell {...props} render={false}>
        {content}
      </FullscreenShell>
    );
    const card = screen.getByTestId('visible-card');
    const renderer = screen.getByTestId('renderer');
    expect(card).toHaveStyle({ visibility: 'visible' });
    expect(card.parentElement).toHaveStyle({ opacity: '0', height: '100%' });
    expect(screen.getByText('Preparing fullscreen view…')).toBeInTheDocument();

    view.rerender(
      <FullscreenShell {...props} render>
        {content}
      </FullscreenShell>
    );
    expect(screen.getByTestId('renderer')).toBe(renderer);
    expect(card.parentElement).toHaveStyle({ opacity: '1', height: '100%' });
    expect(screen.queryByText('Preparing fullscreen view…')).toBeNull();
    expect(mounted).toHaveBeenCalledOnce();
  });

  it('ignores transition completion after close and starts each new entry unready', () => {
    const view = renderHook(useFullscreenState);
    act(() => view.result.current.openFullscreen());
    expect(view.result.current.open).toBe(true);
    expect(view.result.current.render).toBe(false);
    act(() => view.result.current.setRender(true));
    expect(view.result.current.render).toBe(true);
    act(() => view.result.current.closeFullscreen());
    act(() => view.result.current.setRender(true));
    expect(view.result.current).toMatchObject({ open: false, render: false });
    act(() => view.result.current.openFullscreen());
    expect(view.result.current).toMatchObject({ open: true, render: false });
  });
});
