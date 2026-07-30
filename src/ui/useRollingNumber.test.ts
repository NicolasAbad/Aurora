import { describe, expect, it, afterEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { useSettings } from '../state/settings';
import { useRollingNumber } from './useRollingNumber';

function Probe({ target, durationMs }: { target: number; durationMs: number }) {
  const value = useRollingNumber(target, durationMs);
  return createElement('span', { 'data-testid': 'value' }, value.toFixed(2));
}

describe('useRollingNumber', () => {
  const originalReducedMotion = useSettings.getState().reducedMotion;

  afterEach(() => {
    useSettings.setState({ reducedMotion: originalReducedMotion });
  });

  it('snaps straight to target with no animation when reducedMotion is on', () => {
    useSettings.setState({ reducedMotion: true });
    const { getByTestId } = render(createElement(Probe, { target: 500, durationMs: 50 }));
    expect(getByTestId('value').textContent).toBe('500.00');
  });

  it('eases toward the target over time and converges when reducedMotion is off', async () => {
    useSettings.setState({ reducedMotion: false });
    const { getByTestId, rerender } = render(createElement(Probe, { target: 0, durationMs: 50 }));
    expect(getByTestId('value').textContent).toBe('0.00');

    act(() => {
      rerender(createElement(Probe, { target: 100, durationMs: 50 }));
    });

    await waitFor(
      () => {
        expect(getByTestId('value').textContent).toBe('100.00');
      },
      { timeout: 1000 },
    );
  });
});
