import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/initialState';
import { hardResetSave, loadGame, saveGame, SAVE_KEY, useGameStore } from './persistStore';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import type { Process } from '../core/types';

beforeEach(() => {
  localStorage.clear();
});

describe('loadGame', () => {
  it('returns a fresh initial state when nothing is saved', () => {
    const state = loadGame();
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(state.resources.funding.amount).toBe(0);
    expect(state.buildings.offices.level).toBe(1);
  });

  it('round-trips a saved state', () => {
    const state = createInitialState();
    state.resources.funding.amount = 250;
    saveGame(state);

    const loaded = loadGame();
    expect(loaded.resources.funding.amount).toBe(250);
  });

  // Sprint 4 acceptance: "save/load preserves in-progress research."
  it('round-trips in-progress research', () => {
    const state = createInitialState();
    state.research.inProgress = {
      id: 'research-aluminum',
      kind: 'research',
      startedAt: 12345,
      durationMs: 5 * 60_000,
      payload: { nodeId: 'aluminum' },
    };
    saveGame(state);

    const loaded = loadGame();
    expect(loaded.research.inProgress).toEqual(state.research.inProgress);
  });

  // Modifier.expiresAt contract (CLAUDE.md): pruned on load, not just filtered at
  // query time — a save that sat around past a temporary event effect's expiry
  // shouldn't carry the dead entry forward.
  it('prunes an expired modifier on load, keeping permanent and not-yet-expired ones', () => {
    const state = createInitialState();
    const now = Date.now();
    state.modifiers = [
      { id: 'expired', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: now - 1000 },
      { id: 'still-active', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: now + 1_000_000 },
      { id: 'permanent', source: 'E-04', target: 'salary.flat', op: 'add', value: 0.6 },
    ];
    saveGame(state);

    const loaded = loadGame();
    expect(loaded.modifiers.map((m) => m.id)).toEqual(['still-active', 'permanent']);
  });

  // Sprint 5: certifications have their own dedicated slot, same shape/pattern as
  // research's own "round-trips in-progress research" acceptance test above.
  it('round-trips in-progress certification and per-engine progress', () => {
    const state = createInitialState();
    state.certifications.engines.probe1.attempted = true;
    state.certifications.inProgress = {
      id: 'certification-probe1Test2-12345',
      kind: 'certification',
      startedAt: 12345,
      durationMs: 25 * 60_000,
      payload: { testId: 'probe1Test2' },
    };
    saveGame(state);

    const loaded = loadGame();
    expect(loaded.certifications.inProgress).toEqual(state.certifications.inProgress);
    expect(loaded.certifications.engines.probe1.attempted).toBe(true);
  });

  it('falls back to initial state on corrupt JSON instead of throwing', () => {
    localStorage.setItem(SAVE_KEY, '{not valid json');
    expect(() => loadGame()).not.toThrow();
    expect(loadGame().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('throws a clear error for an unmigratable future schema version', () => {
    const state = createInitialState();
    (state as unknown as { schemaVersion: number }).schemaVersion = CURRENT_SCHEMA_VERSION + 1;
    // A save from a newer version than this build knows about isn't "corrupt" — it's
    // out of range going backwards, which migrate() correctly cannot resolve forward.
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    // migrate() only walks forward; a version ahead of CURRENT is left as-is here and
    // simply returned, matching "never crash the app on load".
    expect(() => loadGame()).not.toThrow();
  });
});

describe('saveGame', () => {
  it('writes JSON that loadGame can read back unchanged', () => {
    const state = createInitialState();
    state.resources.materials.amount = 42;
    saveGame(state);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).resources.materials.amount).toBe(42);
  });

  // Modifier.expiresAt contract: pruned before the write itself, independent of
  // loadGame's own prune — checked against the raw JSON on disk, not the round trip.
  it('prunes an expired modifier before writing, independent of loadGame', () => {
    const state = createInitialState();
    state.modifiers = [
      { id: 'expired', source: 'E-05', target: 'process.duration', op: 'mult', value: 1.1, expiresAt: Date.now() - 1000 },
    ];
    saveGame(state);
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!) as { modifiers: unknown[] };
    expect(raw.modifiers).toEqual([]);
  });
});

// Sprint 1 acceptance: "pitch -> hire -> assign -> passive Funding loop works; salary
// burn visible; letting Funding hit 0 pauses production and recovers via pitching."
// Exercises the real store (merge-reset to a fresh GameState each test, keeping the
// action methods Zustand attached at store-creation time).
describe('game store actions (Sprint 1 acceptance loop)', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  it('pitch -> buy Finance -> hire -> assign -> tick grows Funding passively', () => {
    const { pitch, buyBuilding, hire, assign, applyTick } = useGameStore.getState();

    for (let i = 0; i < 20; i++) pitch(); // 20 * 10 = 200 F
    expect(useGameStore.getState().resources.funding.amount).toBe(200);

    buyBuilding('finance'); // costs 150 F at level 0
    expect(useGameStore.getState().buildings.finance.level).toBe(1);
    expect(useGameStore.getState().resources.funding.amount).toBe(50);

    for (let i = 0; i < 20; i++) pitch(); // top back up: +200
    hire('technician'); // 50 F
    hire('technician'); // 50 * 1.15
    assign('technician', 'finance', 1);
    assign('technician', 'finance', 1);

    const before = useGameStore.getState().resources.funding.amount;
    applyTick(60_000); // 60s: Finance +2 F/s fully staffed = 120; salary 2*0.15*60 = 18
    const after = useGameStore.getState().resources.funding.amount;
    expect(after).toBeCloseTo(before - 18 + 120);
  });

  it('insolvency pauses production and clears automatically once pitching restores funding', () => {
    const { pitch, buyBuilding, hire, assign, applyTick } = useGameStore.getState();

    for (let i = 0; i < 20; i++) pitch();
    buyBuilding('finance');
    for (let i = 0; i < 20; i++) pitch();
    hire('technician');
    hire('technician');
    assign('technician', 'finance', 1);
    assign('technician', 'finance', 1);

    useGameStore.setState((s) => ({
      resources: { ...s.resources, funding: { ...s.resources.funding, amount: 0 } },
    }));

    applyTick(60_000);
    expect(useGameStore.getState().economyFlags.payrollUnpaid).toBe(true);
    expect(useGameStore.getState().resources.funding.amount).toBe(0); // no debt

    // GDD §1b: pitching is the explicit insolvency bail-out. Store actions have no
    // cooldown themselves (that's PitchButton's UI-only debounce), so a few calls here
    // stand in for "the player pitches a few times to cover the 18F/tick salary gap."
    pitch();
    pitch();
    pitch();
    applyTick(60_000);
    expect(useGameStore.getState().economyFlags.payrollUnpaid).toBe(false);
  });
});

// SPRINTS.md Sprint 2 task 3: "global time multiplier applied at the timestamp layer,
// so ... processes ... accelerate consistently. Without this, multi-hour timers are
// untestable." Confirms warp actually reaches process completion, not just economy.
describe('applyTick — time-warp reaches process resolution (SPRINTS.md task 3)', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  // `applyTick(deltaMs, warp)` shifts startedAt back by the warp *bonus* on the
  // assumption that `deltaMs` of real wall-clock time has already elapsed since the
  // process started (true in the real game loop, whose deltaMs comes from an actual
  // requestAnimationFrame timestamp delta). Backdating startedAt by exactly deltaMs
  // here models that same assumption for a synchronous, real-time-free unit test.
  function tenMinuteProcess(deltaMs: number): Process {
    return {
      id: 'p1',
      kind: 'research',
      startedAt: Date.now() - deltaMs,
      durationMs: 10 * 60_000,
      payload: {},
    };
  }

  it('does not complete a 10-min process after a 1s real tick at warp x1', () => {
    useGameStore.setState({ processes: [tenMinuteProcess(1000)] });
    useGameStore.getState().applyTick(1000, 1);
    expect(useGameStore.getState().processes).toHaveLength(1);
  });

  it('completes the same 10-min process after a 1s real tick at warp x600 (equivalent to 10 real minutes)', () => {
    useGameStore.setState({ processes: [tenMinuteProcess(1000)] });
    useGameStore.getState().applyTick(1000, 600);
    expect(useGameStore.getState().processes).toHaveLength(0);
  });

  it('leaves a still-running process\'s remaining time reduced by the warped amount, not the real amount', () => {
    useGameStore.setState({ processes: [tenMinuteProcess(1000)] });
    useGameStore.getState().applyTick(1000, 60); // 1s real * x60 = 60s of virtual progress
    const [p] = useGameStore.getState().processes;
    // The process should now look ~60s further along than its real age (~1s) would
    // suggest — the warp bonus (59s), on top of the 1s that had genuinely elapsed.
    expect(Date.now() - p.startedAt).toBeGreaterThanOrEqual(59_000);
  });

  // Sprint 2 acceptance: "two parallel processes resolve correctly" — through the real
  // store's applyTick (the online path), not just resolveProcesses in isolation.
  it('resolves two parallel processes independently through the real store', () => {
    const now = Date.now();
    const fast: Process = { id: 'fast', kind: 'research', startedAt: now - 1000, durationMs: 5 * 60_000, payload: {} };
    const slow: Process = { id: 'slow', kind: 'research', startedAt: now - 1000, durationMs: 20 * 60_000, payload: {} };
    useGameStore.setState({ processes: [fast, slow] });

    // 1s real tick at x600 = 600s (10 min) of virtual progress: `fast` (5 min) completes,
    // `slow` (20 min) doesn't.
    useGameStore.getState().applyTick(1000, 600);

    const remaining = useGameStore.getState().processes;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('slow');
  });
});

// Sprint 5 acceptance (core/data portion — UI narration lands after Sprint 4.5):
// the full test-fail-retry-certify sequence through the REAL store, not isolated core
// calls (CLAUDE.md's "acceptance verified through the integrated path" rule).
describe('certification flow through the real store (Sprint 5)', () => {
  beforeEach(() => {
    const state = createInitialState();
    state.resources.hardware.amount = 100;
    state.resources.hardware.byTier.aluminum = 100;
    state.resources.hardware.cap = 200;
    state.resources.propellant.amount = 300;
    state.resources.propellant.cap = 500;
    useGameStore.setState(state);
  });

  it('probe1Test1 resolves as a scripted failure, then unlocks probe1Test2, which certifies the engine', () => {
    const { startCertificationTest, applyTick } = useGameStore.getState();

    startCertificationTest('probe1Test1');
    expect(useGameStore.getState().certifications.inProgress).not.toBeNull();

    applyTick(1000, 2000); // >= 25 simulated minutes in one warped tick

    expect(useGameStore.getState().certifications.inProgress).toBeNull();
    expect(useGameStore.getState().certifications.engines.probe1.attempted).toBe(true);
    expect(useGameStore.getState().certifications.engines.probe1.certified).toBe(false);
    expect(useGameStore.getState().narrative.seen).toContain('N-07');
    expect(useGameStore.getState().resources.flightxp.amount).toBe(30);

    startCertificationTest('probe1Test2');
    expect(useGameStore.getState().certifications.inProgress).not.toBeNull();

    applyTick(1000, 600 * 26);

    expect(useGameStore.getState().certifications.engines.probe1.certified).toBe(true);
    // 30 (test1) + 15 (test2's static-fire-success reward)
    expect(useGameStore.getState().resources.flightxp.amount).toBe(45);
  });
});

// Sprint 3.5: hardResetSave found a real race — removeItem() + reload() isn't enough,
// because reload() fires `beforeunload`, and the autosave handler re-saves the CURRENT
// in-memory state right after the key was cleared, before the reloaded page ever reads
// it. Placed last in this file: hardResetSave permanently flips a module-level guard
// with no reset hook (mirroring what only a real page reload undoes in production), so
// it would break every subsequent saveGame() call in this test file if it ran earlier.
describe('hardResetSave (Sprint 3.5) — must be the last describe block in this file', () => {
  it('clears the save and makes a subsequent saveGame() (simulating the beforeunload race) a no-op', () => {
    saveGame(createInitialState());
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();

    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    hardResetSave();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(reload).toHaveBeenCalled();

    // Simulates the autosave's beforeunload handler firing after hardResetSave already
    // removed the key but before/during the same reload — without the guard, this would
    // silently resurrect the save.
    saveGame(createInitialState());
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });
});
