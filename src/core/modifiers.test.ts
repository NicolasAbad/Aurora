import { describe, expect, it } from 'vitest';
import { applyModifiers, registerModifier } from './modifiers';
import type { Modifier } from './types';

describe('applyModifiers', () => {
  it('returns the base value unchanged when no modifier matches the target', () => {
    expect(applyModifiers(100, [], 'transfer.duration')).toBe(100);
  });

  it('applies a mult modifier (ECONOMY §5: Basic logistics -25% transfer)', () => {
    const modifiers: Modifier[] = [
      { id: 'research:basicLogistics', source: 'basicLogistics', target: 'transfer.duration', op: 'mult', value: 0.75 },
    ];
    expect(applyModifiers(1000, modifiers, 'transfer.duration')).toBe(750);
  });

  it('applies an add modifier (ECONOMY §5: Remote Ops +6h offline cap)', () => {
    const HOUR = 3_600_000;
    const modifiers: Modifier[] = [
      { id: 'research:remoteOps', source: 'remoteOps', target: 'offline.capMs', op: 'add', value: 6 * HOUR },
    ];
    expect(applyModifiers(10 * HOUR, modifiers, 'offline.capMs')).toBe(16 * HOUR);
  });

  it('ignores modifiers targeting something else', () => {
    const modifiers: Modifier[] = [
      { id: 'research:basicLogistics', source: 'basicLogistics', target: 'transfer.duration', op: 'mult', value: 0.75 },
    ];
    expect(applyModifiers(10, modifiers, 'offline.capMs')).toBe(10);
  });
});

describe('registerModifier', () => {
  it('appends a new modifier', () => {
    const result = registerModifier([], { id: 'a', source: 'a', target: 't', op: 'add', value: 1 });
    expect(result).toHaveLength(1);
  });

  it('is idempotent — registering the same id twice does not duplicate it', () => {
    const first = registerModifier([], { id: 'a', source: 'a', target: 't', op: 'add', value: 1 });
    const second = registerModifier(first, { id: 'a', source: 'a', target: 't', op: 'add', value: 1 });
    expect(second).toHaveLength(1);
  });
});
