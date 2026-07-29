import { describe, expect, it } from 'vitest';
import { appendLogLine, markSeen, missionLogBase, narrativeText, syncSeenIntoLog } from './narrative';

describe('narrativeText', () => {
  it('resolves an id to its text', () => {
    expect(narrativeText('N-01')).toContain('pitched');
  });

  it('fills {var} placeholders', () => {
    expect(narrativeText('T-10', { n: 3 })).toBe('Open slots across the program: 3');
  });

  it('returns empty string for an unknown id rather than throwing', () => {
    expect(narrativeText('not-a-real-id')).toBe('');
  });
});

describe('markSeen', () => {
  it('appends a new id once, no-ops on repeats', () => {
    const seen = markSeen([], 'N-01');
    expect(seen).toEqual(['N-01']);
    expect(markSeen(seen, 'N-01')).toBe(seen); // same reference: true no-op
  });
});

describe('missionLogBase (Sprint 9.5, UI_SPEC §2f)', () => {
  it('returns the existing log verbatim when one already exists', () => {
    const narrative = { seen: ['N-01'], log: ['custom line'] };
    expect(missionLogBase(narrative)).toBe(narrative.log);
  });

  it('backfills once from `seen` when `log` has never been populated (old save, rule 5)', () => {
    const narrative = { seen: ['N-01', 'N-02'] };
    expect(missionLogBase(narrative)).toEqual([narrativeText('N-01'), narrativeText('N-02')]);
  });

  it('backfills to an empty array for a fresh save with no history yet', () => {
    expect(missionLogBase({ seen: [] })).toEqual([]);
  });
});

describe('appendLogLine', () => {
  it('appends one line and caps the array length', () => {
    const log = appendLogLine(['a'], 'b');
    expect(log).toEqual(['a', 'b']);
  });

  it('caps at the max entry count, dropping the oldest first', () => {
    const long = Array.from({ length: 40 }, (_, i) => `line-${i}`);
    const log = appendLogLine(long, 'newest');
    expect(log).toHaveLength(40);
    expect(log[0]).toBe('line-1'); // oldest ('line-0') dropped
    expect(log[log.length - 1]).toBe('newest');
  });
});

describe('syncSeenIntoLog', () => {
  it('appends the newly-seen ids resolved to text, in order', () => {
    const seen = markSeen(markSeen(['N-01'], 'N-02'), 'N-03');
    const log = syncSeenIntoLog(1, seen, ['existing']);
    expect(log).toEqual(['existing', narrativeText('N-02'), narrativeText('N-03')]);
  });

  it('is a no-op (same reference) when `seen` did not grow', () => {
    const log = ['existing'];
    expect(syncSeenIntoLog(2, ['N-01', 'N-02'], log)).toBe(log);
  });
});
