import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Ticker } from './Ticker';
import { useGameStore } from '../state/persistStore';
import { createInitialState } from '../data/initialState';

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState(createInitialState());
});

// UI_SPEC §2b: the ticker starts Funding-only; every other resource row appears only
// once the player has actually gained some of it.
describe('Ticker progressive disclosure', () => {
  it('shows only Funding on a fresh game', () => {
    render(<Ticker />);
    expect(screen.getByText('Funding')).toBeDefined();
    expect(screen.queryByText('Materials')).toBeNull();
    expect(screen.queryByText('Hardware')).toBeNull();
    expect(screen.queryByText('Propellant')).toBeNull();
    expect(screen.queryByText('Research')).toBeNull();
    expect(screen.queryByText('Reputation')).toBeNull();
    expect(screen.queryByText('Flight XP')).toBeNull();
  });

  it('reveals a resource row once lifetimeEarned > 0 for it', () => {
    useGameStore.setState((s) => ({
      resources: {
        ...s.resources,
        materials: { ...s.resources.materials, lifetimeEarned: 5 },
      },
    }));
    render(<Ticker />);
    expect(screen.getByText('Materials')).toBeDefined();
    expect(screen.queryByText('Hardware')).toBeNull();
  });

  it('reveals a secondary-row resource (e.g. Research) the same way', () => {
    useGameStore.setState((s) => ({
      resources: {
        ...s.resources,
        research: { ...s.resources.research, lifetimeEarned: 1 },
      },
    }));
    render(<Ticker />);
    expect(screen.getByText('Research')).toBeDefined();
    expect(screen.queryByText('Reputation')).toBeNull();
  });
});
