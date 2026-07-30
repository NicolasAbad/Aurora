import { describe, expect, it } from 'vitest';
import { categorizeLogLine } from './missionLogCategory';

// The 5 generic completion templates (T-18/19/20/23/26, state/persistStore.ts) are
// deterministic — same fixed prefix every time — so these are exact, not heuristic.
describe('categorizeLogLine — generic completions', () => {
  it('T-18 (promotion) -> people', () => {
    expect(categorizeLogLine('Promotion complete: one of your Technicians is now a(n) Engineer.')).toBe('people');
  });

  it('T-19 (research) -> flask', () => {
    expect(categorizeLogLine('Research complete: Aluminum alloys.')).toBe('flask');
  });

  it('T-20 (building upgrade) -> building', () => {
    expect(categorizeLogLine('Upgrade complete: Finance — Grants desk.')).toBe('building');
  });

  it('T-23 (slot expansion) -> building', () => {
    expect(categorizeLogLine('Finance expanded! +1 Technician slot.')).toBe('building');
  });

  it('T-26 (Flight Experience node) -> rocket', () => {
    expect(categorizeLogLine('Flight Experience: Efficient mixtures unlocked.')).toBe('rocket');
  });
});

// N-* narrative beats are prose, not templates — best-effort keyword heuristic (see
// missionLogCategory.ts's own header note). Spot-checked against a representative sample
// of NARRATIVE_TEXT's actual N-01..N-17 copy, not exhaustive.
describe('categorizeLogLine — N-* flavor beats (heuristic)', () => {
  it('categorizes a staff-flavored beat as people', () => {
    expect(categorizeLogLine('A technician quit a stable job to join you. His family is worried. He is not.')).toBe(
      'people',
    );
  });

  it('categorizes a facility-flavored beat as building', () => {
    expect(
      categorizeLogLine('You leased a warehouse on the edge of town. The landlord asked twice if the rocket thing was serious.'),
    ).toBe('building');
  });

  it('categorizes a customer/contract-flavored beat as document', () => {
    expect(categorizeLogLine('First satisfied customer. The check has every zero they promised. Finance framed it.')).toBe(
      'document',
    );
  });

  it('categorizes an orbit/milestone-flavored beat as star', () => {
    expect(
      categorizeLogLine('Orbit. The word that sounded like science fiction back at that bar is now a line item in the quarterly plan.'),
    ).toBe('star');
  });

  it('falls back to rocket for an unmatched flight-flavored beat', () => {
    expect(
      categorizeLogLine('The engine blew at four seconds. The team spent the night in the debris, taking notes. Nobody mentioned quitting.'),
    ).toBe('rocket');
  });
});
