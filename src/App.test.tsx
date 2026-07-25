import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';

beforeEach(() => {
  localStorage.clear();
});

describe('App', () => {
  it('shows Funding 0 and the pitch button on first load', () => {
    render(<App />);
    expect(screen.getByText('Funding')).toBeDefined();
    expect(screen.getByText(/^0 \/ 500$/)).toBeDefined();
    expect(screen.getByRole('button', { name: /pitch investors/i })).toBeDefined();
  });

  it('pitching increases Funding (Sprint 1 acceptance: the pitch loop works)', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /pitch investors/i }));
    expect(screen.getByText(/^10 \/ 500$/)).toBeDefined();
  });
});
