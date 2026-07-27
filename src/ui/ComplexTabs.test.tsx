import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ComplexTabs } from './ComplexTabs';
import { useGameStore } from '../state/persistStore';
import { createInitialState } from '../data/initialState';

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState(createInitialState());
});

function isLocked(label: string): boolean {
  return screen.getByRole('button', { name: new RegExp(label, 'i') }).className.includes('locked');
}

// Third occurrence of the same bug class (Complex B hardcoded in Sprint 3, Testing
// hardcoded in Sprint 5): a complex tab's `unlocked` value silently pinned to a literal
// instead of reading real game state, making it permanently unreachable regardless of
// progress. This test exists so the next one is caught here, not by manual play.
describe('ComplexTabs — every unlock is state-driven (regression: 2 prior silent hardcodes)', () => {
  it('Campus is always unlocked', () => {
    render(<ComplexTabs active="campus" onSelect={() => {}} />);
    expect(isLocked('Campus')).toBe(false);
  });

  it('Production locks/unlocks with lifetime Funding (ECONOMY §4: >= 300)', () => {
    const { rerender } = render(<ComplexTabs active="campus" onSelect={() => {}} />);
    expect(isLocked('Production')).toBe(true);

    act(() => {
      useGameStore.setState((s) => ({
        resources: { ...s.resources, funding: { ...s.resources.funding, lifetimeEarned: 300 } },
      }));
    });
    rerender(<ComplexTabs active="campus" onSelect={() => {}} />);
    expect(isLocked('Production')).toBe(false);
  });

  it('Testing locks/unlocks with the "testStand" tech (ECONOMY §4)', () => {
    const { rerender } = render(<ComplexTabs active="campus" onSelect={() => {}} />);
    expect(isLocked('Testing')).toBe(true);

    act(() => {
      useGameStore.setState((s) => ({
        research: { ...s.research, completed: [...s.research.completed, 'testStand'] },
      }));
    });
    rerender(<ComplexTabs active="campus" onSelect={() => {}} />);
    expect(isLocked('Testing')).toBe(false);
  });

  // INTENTIONAL, not a bug: Complex D has no panel content until Sprint 7 builds VAB/
  // Pad/Launch Control/Tracking Station, so its tab stays hardcoded-locked even though
  // its tech gate (flightProgram) is already reachable (the Program branch is complete
  // since Sprint 4) — unlocking the tab now would open onto a blank screen. Sprint 7 is
  // expected to make this state-driven like Testing above; when it does, this specific
  // assertion should be replaced with a state-driven version, not just deleted.
  it('Launch stays locked even once its tech (flightProgram) is researched — pending Sprint 7', () => {
    useGameStore.setState((s) => ({
      research: { ...s.research, completed: [...s.research.completed, 'flightProgram'] },
    }));
    render(<ComplexTabs active="campus" onSelect={() => {}} />);
    expect(isLocked('Launch')).toBe(true);
  });
});
