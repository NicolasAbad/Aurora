import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { SiteMapCelebration, SiteMapScreen } from './SiteMap';
import { useGameStore } from '../state/persistStore';
import { createInitialState } from '../data/initialState';

beforeEach(() => {
  useGameStore.setState(createInitialState());
});

describe('SiteMapScreen', () => {
  it('renders as a dialog with every building complex row and a close button', () => {
    render(<SiteMapScreen onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Program Site Map' })).toBeDefined();
    expect(screen.getByText('Campus')).toBeDefined();
    expect(screen.getByText('Production')).toBeDefined();
    expect(screen.getByText('Testing')).toBeDefined();
    expect(screen.getByText('Launch')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close site map' })).toBeDefined();
  });

  it('shows every plot labeled, built or not (players can see what is still ahead)', () => {
    render(<SiteMapScreen onClose={() => {}} />);
    expect(screen.getByText('Offices')).toBeDefined(); // built from the start
    expect(screen.getByText('Finance')).toBeDefined(); // unbuilt in the initial state
  });

  it('shows the legend for live activity states', () => {
    render(<SiteMapScreen onClose={() => {}} />);
    expect(screen.getByText('Producing')).toBeDefined();
    expect(screen.getByText('Idle')).toBeDefined();
    expect(screen.getByText('Starved')).toBeDefined();
    expect(screen.getByText('Payroll paused')).toBeDefined();
  });
});

describe('SiteMapScreen — live activity state (UI_SPEC §2h THIRD reconception)', () => {
  it("a staffed, producing building's plot carries the active state in its title", () => {
    const state = createInitialState();
    state.buildings.finance.level = 2;
    state.staff.pools.technician.assigned.finance = 2;
    useGameStore.setState(state);
    render(<SiteMapScreen onClose={() => {}} />);
    expect(screen.getByTitle('Finance — active')).toBeDefined();
  });

  it("a built-but-unstaffed producer's plot carries the idle state", () => {
    const state = createInitialState();
    state.buildings.finance.level = 1; // built, nobody assigned
    useGameStore.setState(state);
    render(<SiteMapScreen onClose={() => {}} />);
    expect(screen.getByTitle('Finance — idle')).toBeDefined();
  });

  it('a starved consumer carries the starved state', () => {
    const state = createInitialState();
    state.buildings.fabrication.level = 2;
    state.staff.pools.engineer.assigned.fabrication = 1;
    state.staff.pools.technician.assigned.fabrication = 1;
    state.buildings.fabrication.starvedIndicator = true;
    useGameStore.setState(state);
    render(<SiteMapScreen onClose={() => {}} />);
    expect(screen.getByTitle('Fabrication — starved')).toBeDefined();
  });

  it('payroll-unpaid overrides every staffed producer to the paused state', () => {
    const state = createInitialState();
    state.buildings.finance.level = 2;
    state.staff.pools.technician.assigned.finance = 2;
    state.economyFlags.payrollUnpaid = true;
    useGameStore.setState(state);
    render(<SiteMapScreen onClose={() => {}} />);
    expect(screen.getByTitle('Finance — paused')).toBeDefined();
  });

  it('a non-producer building (VAB) has no activity suffix at all — nothing to report', () => {
    const state = createInitialState();
    state.buildings.vab.level = 2;
    useGameStore.setState(state);
    render(<SiteMapScreen onClose={() => {}} />);
    expect(screen.getByTitle('VAB')).toBeDefined();
  });

  it('highlights the Current Directive-named building as the directed plot', () => {
    const state = createInitialState();
    state.resources.funding = { amount: 0, cap: 1000, lifetimeEarned: 0 }; // D-01: pitch investors -> Offices
    useGameStore.setState(state);
    render(<SiteMapScreen onClose={() => {}} />);
    const officesPlot = screen.getByTitle('Offices').closest('.site-map__plot');
    expect(officesPlot?.className).toContain('site-map__plot--directed');
  });
});

describe('SiteMapCelebration (UI_SPEC §2h, Site Map SECOND rework)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders nothing on mount, even though Offices is already built (baseline captured at mount)', () => {
    render(<SiteMapCelebration />);
    expect(screen.queryByText('Offices built')).toBeNull();
  });

  it('fires the moment a building crosses level 0 -> 1, naming it', () => {
    render(<SiteMapCelebration />);
    act(() => {
      useGameStore.setState((s) => ({
        buildings: { ...s.buildings, finance: { ...s.buildings.finance, level: 1 } },
      }));
    });
    expect(screen.getByText('Finance built')).toBeDefined();
  });

  it('does NOT fire again for a building leveling up further (only the first construction)', () => {
    render(<SiteMapCelebration />);
    act(() => {
      useGameStore.setState((s) => ({
        buildings: { ...s.buildings, finance: { ...s.buildings.finance, level: 1 } },
      }));
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Finance built')).toBeNull();

    act(() => {
      useGameStore.setState((s) => ({
        buildings: { ...s.buildings, finance: { ...s.buildings.finance, level: 2 } },
      }));
    });
    expect(screen.queryByText('Finance built')).toBeNull();
  });

  it('auto-dismisses after its timer with no interaction required', () => {
    render(<SiteMapCelebration />);
    act(() => {
      useGameStore.setState((s) => ({
        buildings: { ...s.buildings, finance: { ...s.buildings.finance, level: 1 } },
      }));
    });
    expect(screen.getByText('Finance built')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('Finance built')).toBeNull();
  });

  it('a returning player with buildings already on disk does not replay the celebration for them', () => {
    const state = createInitialState();
    state.buildings.finance.level = 1;
    state.buildings.rndLab.level = 1;
    useGameStore.setState(state);
    render(<SiteMapCelebration />);
    expect(screen.queryByText('Finance built')).toBeNull();
    expect(screen.queryByText('R&D Lab built')).toBeNull();
  });

  // Sprint 11.5 Priority-1 bug class, found here too via live Playwright verification —
  // unit tests alone missed it (a single setState + one timer advance never exercises
  // real continuous ticking). resolveEconomyTick's own Fabrication/Refinery starvation
  // bookkeeping (core/economy.ts's updateStarvation) hands back a NEW object reference
  // every tick even when the values are unchanged, so `buildings` "changes" (by
  // reference) on essentially every real frame. A dismiss timer keyed on that raw object
  // would restart every tick and never fire — the same freeze useRollingNumber had, just
  // for a setTimeout instead of a rAF loop. This test simulates that exact churn: many
  // setState calls handing fabrication/refinery a fresh (but value-identical) object
  // reference each time, interleaved with small timer advances, well past the
  // celebration's own duration.
  it('still auto-dismisses under continuous buildings-reference churn (real tick behavior)', () => {
    render(<SiteMapCelebration />);
    act(() => {
      useGameStore.setState((s) => ({
        buildings: { ...s.buildings, finance: { ...s.buildings.finance, level: 1 } },
      }));
    });
    expect(screen.getByText('Finance built')).toBeDefined();

    // ~200 "ticks" of 16ms each = ~3.2s of simulated real time, comfortably past the
    // celebration's own ~2.4s duration — each one hands fabrication/refinery a BRAND
    // NEW object reference (same values), exactly like a real tick's updateStarvation.
    for (let i = 0; i < 200; i++) {
      act(() => {
        useGameStore.setState((s) => ({
          buildings: {
            ...s.buildings,
            fabrication: { ...s.buildings.fabrication },
            refinery: { ...s.buildings.refinery },
          },
        }));
        vi.advanceTimersByTime(16);
      });
    }
    expect(screen.queryByText('Finance built')).toBeNull();
  });
});
