import { describe, expect, it } from 'vitest';
import { applyModifiers, pruneExpiredModifiers, registerModifier } from './modifiers';
import type { Modifier } from './types';

const NOW = 1_000_000;

describe('applyModifiers', () => {
  it('returns the base value unchanged when no modifier matches the target', () => {
    expect(applyModifiers(100, [], 'transfer.duration', NOW)).toBe(100);
  });

  it('applies a mult modifier (ECONOMY §5: Basic logistics -25% transfer)', () => {
    const modifiers: Modifier[] = [
      { id: 'research:basicLogistics', source: 'basicLogistics', target: 'transfer.duration', op: 'mult', value: 0.75 },
    ];
    expect(applyModifiers(1000, modifiers, 'transfer.duration', NOW)).toBe(750);
  });

  it('applies an add modifier (ECONOMY §5: Remote Ops +6h offline cap)', () => {
    const HOUR = 3_600_000;
    const modifiers: Modifier[] = [
      { id: 'research:remoteOps', source: 'remoteOps', target: 'offline.capMs', op: 'add', value: 6 * HOUR },
    ];
    expect(applyModifiers(10 * HOUR, modifiers, 'offline.capMs', NOW)).toBe(16 * HOUR);
  });

  it('ignores modifiers targeting something else', () => {
    const modifiers: Modifier[] = [
      { id: 'research:basicLogistics', source: 'basicLogistics', target: 'transfer.duration', op: 'mult', value: 0.75 },
    ];
    expect(applyModifiers(10, modifiers, 'offline.capMs', NOW)).toBe(10);
  });

  // Modifier.expiresAt (CLAUDE.md): E-05's temporary "processes +10% duration for 2h"
  // (Sprint 9) is the motivating case — a modifier that must stop applying once its
  // window passes, without requiring the array to have been pruned first.
  describe('expiresAt (Sprint 9: E-05-style temporary modifiers)', () => {
    it('excludes a modifier whose expiresAt has already passed', () => {
      const modifiers: Modifier[] = [
        { id: 'event:documentaryCrew', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: NOW - 1 },
      ];
      expect(applyModifiers(1000, modifiers, 'process.duration', NOW)).toBe(1000);
    });

    it('excludes a modifier expiring at exactly `now` (inclusive boundary, matching process completion)', () => {
      const modifiers: Modifier[] = [
        { id: 'event:documentaryCrew', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: NOW },
      ];
      expect(applyModifiers(1000, modifiers, 'process.duration', NOW)).toBe(1000);
    });

    it('still applies a modifier whose expiresAt is in the future', () => {
      const modifiers: Modifier[] = [
        { id: 'event:documentaryCrew', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: NOW + 1 },
      ];
      expect(applyModifiers(1000, modifiers, 'process.duration', NOW)).toBe(1100);
    });

    it('applies a modifier with no expiresAt regardless of how much time has passed (permanent, e.g. E-04)', () => {
      const modifiers: Modifier[] = [
        { id: 'event:starScientist', source: 'E-04', target: 'salary.flat', op: 'add', value: 0.6 },
      ];
      expect(applyModifiers(0, modifiers, 'salary.flat', NOW + 1_000_000_000)).toBe(0.6);
    });
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

describe('pruneExpiredModifiers', () => {
  it('removes only modifiers whose expiresAt has passed, keeping permanent and not-yet-expired ones', () => {
    const modifiers: Modifier[] = [
      { id: 'expired', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: NOW - 1 },
      { id: 'still-active', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: NOW + 1 },
      { id: 'permanent', source: 'E-04', target: 'salary.flat', op: 'add', value: 0.6 },
    ];
    const result = pruneExpiredModifiers(modifiers, NOW);
    expect(result.map((m) => m.id)).toEqual(['still-active', 'permanent']);
  });

  it('is a no-op when nothing has expired', () => {
    const modifiers: Modifier[] = [{ id: 'permanent', source: 'E-04', target: 'salary.flat', op: 'add', value: 0.6 }];
    expect(pruneExpiredModifiers(modifiers, NOW)).toEqual(modifiers);
  });
});
