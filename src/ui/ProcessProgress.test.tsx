import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProcessProgress } from './ProcessProgress';
import type { Process } from '../core/types';

function makeProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'p1',
    kind: 'research',
    startedAt: 0,
    durationMs: 10 * 60_000,
    payload: {},
    ...overrides,
  };
}

describe('ProcessProgress', () => {
  it('shows remaining time in human units and a partial fill at the halfway point', () => {
    const process = makeProcess({ startedAt: 0, durationMs: 10 * 60_000 });
    const { container } = render(<ProcessProgress process={process} now={5 * 60_000} />);
    expect(screen.getByText('5m 0s')).toBeDefined();
    const fill = container.querySelector('.process-progress__fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('shows 0s and a full bar once the process is done', () => {
    const process = makeProcess({ startedAt: 0, durationMs: 10 * 60_000 });
    const { container } = render(<ProcessProgress process={process} now={20 * 60_000} />);
    expect(screen.getByText('0s')).toBeDefined();
    const fill = container.querySelector('.process-progress__fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('formats hour-scale durations (e.g. a 3h certification)', () => {
    const process = makeProcess({ startedAt: 0, durationMs: 3 * 60 * 60_000 });
    render(<ProcessProgress process={process} now={0} />);
    expect(screen.getByText('3h 0m')).toBeDefined();
  });
});
