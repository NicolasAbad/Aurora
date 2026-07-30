import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MilestoneScreen } from './MilestoneScreen';
import { useGameStore, useAwaySummary } from '../state/persistStore';
import { createInitialState } from '../data/initialState';
import type { LaunchRecord } from '../core/types';

const auroraIISuccess: LaunchRecord = {
  id: 'l1',
  padId: 'padA',
  missionType: 'auroraII',
  success: true,
  timestamp: 0,
};

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState(createInitialState());
  useAwaySummary.setState({ summary: null });
});

// UI_SPEC §3 screen 8: fires once, on Aurora II's first success, never again.
describe('MilestoneScreen', () => {
  it('renders nothing on a fresh game (no Aurora II success yet)', () => {
    render(<MilestoneScreen />);
    expect(screen.queryByRole('dialog', { name: 'Program milestone' })).toBeNull();
  });

  it('renders once Aurora II has succeeded, showing N-16 and T-29 text', () => {
    useGameStore.setState((s) => ({ mission: { ...s.mission, launches: [auroraIISuccess] } }));
    render(<MilestoneScreen />);
    expect(screen.getByRole('dialog', { name: 'Program milestone' })).toBeDefined();
    expect(screen.getByText(/Aurora II completed its third pass around Earth/)).toBeDefined();
    expect(screen.getByText(/The next chapter — crewed missions/)).toBeDefined();
  });

  it('shows the run summary: launch counts by type, Records earned, Funding raised', () => {
    useGameStore.setState((s) => ({
      mission: { ...s.mission, launches: [auroraIISuccess] },
      records: ['firstIgnition', 'firstOrbit'],
      resources: { ...s.resources, funding: { ...s.resources.funding, lifetimeEarned: 12500 } },
    }));
    render(<MilestoneScreen />);
    expect(screen.getByText('Aurora II: 1')).toBeDefined();
    expect(screen.getByText('Program Records earned: 2')).toBeDefined();
    expect(screen.getByText('First ignition')).toBeDefined();
    expect(screen.getByText('First orbit')).toBeDefined();
    expect(screen.getByText('Total Funding raised: $12.5K')).toBeDefined();
  });

  it('does not render once already dismissed', () => {
    useGameStore.setState((s) => ({
      mission: { ...s.mission, launches: [auroraIISuccess] },
      economyFlags: { ...s.economyFlags, milestoneScreenDismissed: true },
    }));
    render(<MilestoneScreen />);
    expect(screen.queryByRole('dialog', { name: 'Program milestone' })).toBeNull();
  });

  it('stays hidden while the away-summary modal is still showing (sequential, not stacked)', () => {
    useGameStore.setState((s) => ({ mission: { ...s.mission, launches: [auroraIISuccess] } }));
    useAwaySummary.setState({
      summary: {
        elapsedMs: 60_000,
        appliedMs: 60_000,
        capped: false,
        fundingGained: 0,
        researchGained: 0,
        materialsGained: 0,
        hardwareGained: 0,
        propellantGained: 0,
        reputationGained: 0,
        flightxpGained: 0,
        completedProcessLabels: [],
        newRecordNames: [],
        stoppage: null,
      },
    });
    render(<MilestoneScreen />);
    expect(screen.queryByRole('dialog', { name: 'Program milestone' })).toBeNull();
  });

  it('Continue dismisses it permanently via economyFlags.milestoneScreenDismissed', () => {
    useGameStore.setState((s) => ({ mission: { ...s.mission, launches: [auroraIISuccess] } }));
    render(<MilestoneScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(useGameStore.getState().economyFlags.milestoneScreenDismissed).toBe(true);
  });
});
