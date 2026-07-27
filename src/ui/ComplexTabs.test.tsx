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

  // Sprint 7: state-driven like Testing above, now that Complex D (VAB/Pad/Launch
  // Control/Tracking Station) has real panel content to unlock onto.
  it('Launch locks/unlocks with the "flightProgram" tech (ECONOMY §4)', () => {
    const { rerender } = render(<ComplexTabs active="campus" onSelect={() => {}} />);
    expect(isLocked('Launch')).toBe(true);

    act(() => {
      useGameStore.setState((s) => ({
        research: { ...s.research, completed: [...s.research.completed, 'flightProgram'] },
      }));
    });
    rerender(<ComplexTabs active="campus" onSelect={() => {}} />);
    expect(isLocked('Launch')).toBe(false);
  });
});
