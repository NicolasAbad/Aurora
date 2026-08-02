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
