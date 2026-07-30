import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { useGameStore } from './state/persistStore';
import { createInitialState } from './data/initialState';

beforeEach(() => {
  localStorage.clear();
  // useGameStore is a module-level singleton (Zustand) — without an explicit reset, a
  // setState() call in one test leaks into the next test's initial render. Shallow
  // merge (no replace flag): createInitialState() only returns GameState's data
  // fields, so this resets them without touching the store's action functions, which
  // live as separate top-level keys on the same store object.
  useGameStore.setState(createInitialState());
});

describe('App', () => {
  it('shows Funding 0 and the pitch button on first load', () => {
    render(<App />);
    expect(screen.getByText('Funding')).toBeDefined();
    expect(screen.getByText(/^0 \/ 1,000$/)).toBeDefined();
    expect(screen.getByRole('button', { name: /pitch investors/i })).toBeDefined();
  });

  it('pitching increases Funding (Sprint 1 acceptance: the pitch loop works)', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /pitch investors/i }));
    // Sprint 11: the ticker value rolls toward the new amount (useRollingNumber) rather
    // than snapping instantly — the underlying store value IS already 10 synchronously
    // (confirmed via the store directly), the DOM just takes a moment to catch up.
    expect(useGameStore.getState().resources.funding.amount).toBe(10);
    await waitFor(() => {
      expect(screen.getByText(/^10 \/ 1,000$/)).toBeDefined();
    });
  });
});

// SPRINTS.md Sprint 8, task 1: contextual one-time tooltips (NARRATIVE §2).
describe('App — FTUE tooltip (T-01..T-09)', () => {
  it('shows T-01 on a fresh load (nothing else is eligible yet)', () => {
    render(<App />);
    expect(screen.getByText('Pitch your idea to raise your first funding.')).toBeDefined();
  });

  it('dismissing T-01 reveals T-02 once Funding >= 50', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Pitch your idea to raise your first funding.')).toBeNull();

    act(() => {
      useGameStore.setState((s) => ({
        resources: { ...s.resources, funding: { ...s.resources.funding, amount: 50 } },
      }));
    });
    expect(screen.getByText('You can afford your first technician now.')).toBeDefined();
  });
});

// SPRINTS.md Sprint 8, task 2 / UI_SPEC §4: "Milestones: small non-blocking call-out
// card (title + one Mission Log line), auto-dismisses." Drives the store directly
// (bypassing the tick loop / real record-earning flow, which is core/records.ts's own
// concern, already tested there) to isolate MilestoneCallout's own diff-and-timeout logic.
describe('App — milestone call-out (Program Records)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a card with the record name once `records` gains a new entry', () => {
    render(<App />);
    act(() => {
      useGameStore.setState({ records: ['firstIgnition'] });
    });
    expect(screen.getByText('First ignition')).toBeDefined();
  });

  it('pairs the title with the most recently added Mission Log line, when one landed the same update', () => {
    const { container } = render(<App />);
    act(() => {
      useGameStore.setState((s) => ({
        records: ['firstIgnition'],
        narrative: { ...s.narrative, seen: ['N-07'] },
      }));
    });
    const callout = container.querySelector('.milestone-callout');
    expect(callout).not.toBeNull();
    expect(callout!.textContent).toContain('First ignition');
    // N-07's own text also appears in the Mission Log panel simultaneously (expected —
    // both react to the same narrative.seen change), so this scopes to the callout only.
    expect(callout!.textContent).toContain('The engine blew at four seconds');
  });

  it('auto-dismisses after 5s with no user interaction required', () => {
    render(<App />);
    act(() => {
      useGameStore.setState({ records: ['firstIgnition'] });
    });
    expect(screen.getByText('First ignition')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('First ignition')).toBeNull();
  });

  it('shows a fresh card for a second, later record', () => {
    render(<App />);
    act(() => {
      useGameStore.setState({ records: ['firstIgnition'] });
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('First ignition')).toBeNull();

    act(() => {
      useGameStore.setState({ records: ['firstIgnition', 'firstFlight'] });
    });
    expect(screen.getByText('First flight')).toBeDefined();
  });
});
