import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/initialState';
import { launchAuroraMission, resolveAuroraChecklist } from '../core/auroraMission';
import { hardResetSave, importSave, loadGame, saveGame, SAVE_KEY, useGameStore } from './persistStore';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import { narrativeText } from '../data/narrative';
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

// UI_SPEC §2d (Sprint 7.5): the Campus reveal's Crew Quarters/R&D Lab step is a one-way
// latch, not a live comparison, specifically so a later Release (§4b) can't hide them again.
describe('staffCapReachedOnce — UI_SPEC §2d Campus reveal, one-way latch', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  it('flips true the moment hiring reaches the starting cap (2)', () => {
    const { pitch, hire } = useGameStore.getState();
    for (let i = 0; i < 20; i++) pitch();
    expect(useGameStore.getState().staffCapReachedOnce).toBeFalsy();
    hire('technician');
    expect(useGameStore.getState().staffCapReachedOnce).toBeFalsy(); // 1/2, not yet
    hire('technician');
    expect(useGameStore.getState().staffCapReachedOnce).toBe(true); // 2/2
  });

  it('stays true even after Release drops the pool back under cap', () => {
    const { pitch, hire, release } = useGameStore.getState();
    for (let i = 0; i < 20; i++) pitch();
    hire('technician');
    hire('technician');
    expect(useGameStore.getState().staffCapReachedOnce).toBe(true);
    release('technician');
    expect(useGameStore.getState().staffCapReachedOnce).toBe(true); // still latched
    expect(useGameStore.getState().staff.pools.technician.hired).toBe(1);
  });
});

describe('release — UI_SPEC §4b staff dismissal, through the real store', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  it('releasing drops salary burn on the very next tick', () => {
    const { pitch, hire, applyTick } = useGameStore.getState();
    for (let i = 0; i < 20; i++) pitch();
    hire('technician');
    const before = useGameStore.getState().resources.funding.amount;
    applyTick(60_000); // 1 Technician * 0.15/s * 60s = 9 F salary
    expect(useGameStore.getState().resources.funding.amount).toBeCloseTo(before - 9);

    useGameStore.getState().release('technician');
    const afterRelease = useGameStore.getState().resources.funding.amount;
    applyTick(60_000); // 0 hired now — no salary
    expect(useGameStore.getState().resources.funding.amount).toBe(afterRelease);
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
    expect(useGameStore.getState().narrative.seen).toContain('N-08');
  });
});

// Sprint 5: Mission Log beats fire from real store actions, not just core resolution
// (N-07/N-08 are already covered above via the certification flow itself).
describe('Mission Log narrative triggers (Sprint 5)', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  it('N-01 fires on the first pitch, not again on the second', () => {
    useGameStore.getState().pitch();
    expect(useGameStore.getState().narrative.seen).toEqual(['N-01']);
    useGameStore.getState().pitch();
    expect(useGameStore.getState().narrative.seen).toEqual(['N-01']); // idempotent
  });

  it('N-02 fires on the first hire', () => {
    useGameStore.setState((s) => ({ resources: { ...s.resources, funding: { ...s.resources.funding, amount: 200 } } }));
    useGameStore.getState().hire('technician');
    expect(useGameStore.getState().narrative.seen).toContain('N-02');
  });

  it('N-03 fires the moment Finance reaches level 1, not before', () => {
    useGameStore.setState((s) => ({ resources: { ...s.resources, funding: { ...s.resources.funding, amount: 200 } } }));
    expect(useGameStore.getState().narrative.seen).not.toContain('N-03');
    useGameStore.getState().buyBuilding('finance');
    expect(useGameStore.getState().narrative.seen).toContain('N-03');
  });

  it('N-06 fires the moment the Test Stand is built', () => {
    useGameStore.setState((s) => ({
      resources: { ...s.resources, funding: { ...s.resources.funding, amount: 2000 }, materials: { ...s.resources.materials, amount: 500 }, hardware: { ...s.resources.hardware, amount: 100, byTier: { aluminum: 100, titanium: 0 } } },
    }));
    useGameStore.getState().buyBuilding('testStand');
    expect(useGameStore.getState().narrative.seen).toContain('N-06');
  });

  it('N-04 fires via applyTick once lifetime Funding crosses 300 (Complex B unlock)', () => {
    useGameStore.setState((s) => ({ resources: { ...s.resources, funding: { ...s.resources.funding, amount: 300, lifetimeEarned: 300, cap: null } } }));
    expect(useGameStore.getState().narrative.seen).not.toContain('N-04');
    useGameStore.getState().applyTick(0);
    expect(useGameStore.getState().narrative.seen).toContain('N-04');
  });

  it('N-05 fires via applyTick once any Hardware has ever been fabricated', () => {
    useGameStore.setState((s) => ({ resources: { ...s.resources, hardware: { ...s.resources.hardware, lifetimeEarned: 1 } } }));
    useGameStore.getState().applyTick(0);
    expect(useGameStore.getState().narrative.seen).toContain('N-05');
  });

  it('N-09 fires via applyTick once any pad\'s "Rocket integrated" checklist item is true (Sprint 7)', () => {
    useGameStore.setState((s) => ({
      mission: {
        ...s.mission,
        pads: {
          padA: {
            rocketStatus: 'in_vab',
            stagesDone: ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration'],
            checklist: { ...s.mission.pads.padA!.checklist, rocketIntegrated: true },
            confidence: 0,
            committedRoll: null,
          },
        },
      },
    }));
    useGameStore.getState().applyTick(0);
    expect(useGameStore.getState().narrative.seen).toContain('N-09');
  });

  it('N-15 fires the moment Orbital flight research completes', () => {
    useGameStore.setState((s) => ({
      research: {
        completed: ['flightProgram'],
        inProgress: { id: 'r1', kind: 'research', startedAt: 0, durationMs: 1000, payload: { nodeId: 'orbitalFlight' } },
      },
      resources: { ...s.resources, research: { ...s.resources.research, amount: 0 } },
    }));
    useGameStore.getState().applyTick(10_000); // well past the process's 1s duration
    expect(useGameStore.getState().narrative.seen).toContain('N-15');
    expect(useGameStore.getState().research.completed).toContain('orbitalFlight');
  });

  it('N-10 fires the moment launchAurora is called (the countdown press), before the outcome is known', () => {
    useGameStore.setState((s) => ({
      mission: {
        ...s.mission,
        pads: {
          padA: {
            rocketStatus: 'on_pad',
            stagesDone: [],
            checklist: s.mission.pads.padA!.checklist,
            confidence: 100,
            committedRoll: 0.5,
          },
        },
      },
    }));
    useGameStore.getState().launchAurora('padA');
    expect(useGameStore.getState().narrative.seen).toContain('N-10');
  });

  it('N-11 fires on a successful Aurora I launch', () => {
    useGameStore.setState((s) => ({
      mission: {
        ...s.mission,
        pads: { padA: { rocketStatus: 'on_pad', stagesDone: [], checklist: s.mission.pads.padA!.checklist, confidence: 100, committedRoll: 0.1 } },
      },
    }));
    useGameStore.getState().launchAurora('padA');
    expect(useGameStore.getState().narrative.seen).toContain('N-11');
    expect(useGameStore.getState().mission.launches[0].success).toBe(true);
  });

  it('N-12 fires on a failed Aurora I launch', () => {
    useGameStore.setState((s) => ({
      mission: {
        ...s.mission,
        pads: { padA: { rocketStatus: 'on_pad', stagesDone: [], checklist: s.mission.pads.padA!.checklist, confidence: 10, committedRoll: 0.99 } },
      },
    }));
    useGameStore.getState().launchAurora('padA');
    expect(useGameStore.getState().narrative.seen).toContain('N-12');
    expect(useGameStore.getState().mission.launches[0].success).toBe(false);
  });
});

describe('Mission Log generic completions (Sprint 9.5, T-18/19/20 — UI_SPEC §2f)', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  it('a narrative beat (N-01) also lands in narrative.log, resolved to its display text', () => {
    useGameStore.getState().pitch();
    expect(useGameStore.getState().narrative.log).toEqual([narrativeText('N-01')]);
  });

  it('T-18 logs a line when a promotion process completes via applyTick', () => {
    useGameStore.setState((s) => ({
      staff: {
        ...s.staff,
        pools: { ...s.staff.pools, technician: { ...s.staff.pools.technician, hired: 1 } },
      },
      processes: [
        { id: 'p1', kind: 'training', startedAt: 0, durationMs: 1000, payload: { from: 'technician', to: 'engineer' } },
      ] as Process[],
    }));
    useGameStore.getState().applyTick(10_000);
    expect(useGameStore.getState().narrative.log).toContain(
      narrativeText('T-18', { fromRole: 'Technician', toRole: 'Engineer' }),
    );
  });

  it('T-19 logs a line when a research node completes via applyTick', () => {
    useGameStore.setState((s) => ({
      research: {
        completed: [],
        inProgress: { id: 'r1', kind: 'research', startedAt: 0, durationMs: 1000, payload: { nodeId: 'aluminum' } },
      },
      resources: { ...s.resources, research: { ...s.resources.research, amount: 0 } },
    }));
    useGameStore.getState().applyTick(10_000);
    expect(useGameStore.getState().narrative.log).toContain(narrativeText('T-19', { node: 'Aluminum alloys' }));
  });

  it('T-20 logs a line when an internal upgrade is bought', () => {
    useGameStore.setState((s) => ({
      resources: { ...s.resources, funding: { ...s.resources.funding, amount: 1000 } },
    }));
    useGameStore.getState().buyInternalUpgrade('finance', 'grantsDesk');
    expect(useGameStore.getState().narrative.log).toContain(
      narrativeText('T-20', { building: 'Finance', upgrade: 'Grants desk' }),
    );
  });

  it('T-23 fires once per employed role when a building crosses a level-10 milestone (ECONOMY §4c)', () => {
    useGameStore.setState((s) => ({
      buildings: { ...s.buildings, fabrication: { ...s.buildings.fabrication, level: 9 } },
      resources: {
        ...s.resources,
        funding: { ...s.resources.funding, amount: 1_000_000 },
        materials: { ...s.resources.materials, amount: 1_000_000 },
      },
    }));
    useGameStore.getState().buyBuilding('fabrication'); // 9 -> 10, crosses the milestone
    expect(useGameStore.getState().buildings.fabrication.level).toBe(10);
    expect(useGameStore.getState().narrative.log).toContain(
      narrativeText('T-23', { building: 'Fabrication', role: 'Engineer' }),
    );
    expect(useGameStore.getState().narrative.log).toContain(
      narrativeText('T-23', { building: 'Fabrication', role: 'Technician' }),
    );
  });

  it('T-23 does not fire on a non-milestone level (e.g. 9 -> not a multiple of 10)', () => {
    useGameStore.setState((s) => ({
      buildings: { ...s.buildings, fabrication: { ...s.buildings.fabrication, level: 7 } },
      resources: {
        ...s.resources,
        funding: { ...s.resources.funding, amount: 1_000_000 },
        materials: { ...s.resources.materials, amount: 1_000_000 },
      },
    }));
    useGameStore.getState().buyBuilding('fabrication'); // 7 -> 8
    expect(useGameStore.getState().buildings.fabrication.level).toBe(8);
    expect(useGameStore.getState().narrative.log ?? []).toEqual([]);
  });

  it('backfills log from existing seen history the first time an older save (no `log` field yet) fires a new event', () => {
    useGameStore.setState(() => ({
      narrative: { seen: ['N-01', 'N-02'] }, // simulates a pre-Sprint-9.5 save
      resources: { ...useGameStore.getState().resources, funding: { ...useGameStore.getState().resources.funding, amount: 200 } },
    }));
    expect(useGameStore.getState().narrative.log).toBeUndefined();
    useGameStore.getState().buyBuilding('finance'); // fires N-03, not already in `seen`
    expect(useGameStore.getState().narrative.log).toEqual([
      narrativeText('N-01'),
      narrativeText('N-02'),
      narrativeText('N-03'),
    ]);
  });
});

describe('Launch Pad B (Sprint 9): buyBuilding initializes mission.pads.padB', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  it('N-17 fires and mission.pads.padB is created the moment Launch Pad B reaches level 1', () => {
    useGameStore.setState((s) => ({
      resources: {
        ...s.resources,
        funding: { ...s.resources.funding, amount: 6000 },
        materials: { ...s.resources.materials, amount: 1500 },
        hardware: { ...s.resources.hardware, amount: 100, byTier: { aluminum: 100, titanium: 0 } },
      },
    }));
    expect(useGameStore.getState().mission.pads.padB).toBeUndefined();
    useGameStore.getState().buyBuilding('launchPadB');
    expect(useGameStore.getState().buildings.launchPadB.level).toBe(1);
    expect(useGameStore.getState().mission.pads.padB).toMatchObject({ rocketStatus: 'none', stagesDone: [], confidence: 0, committedRoll: null });
    expect(useGameStore.getState().narrative.seen).toContain('N-17');
  });
});

describe('Satellite contracts through the real store (Sprint 9)', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  it('offer generation (via applyTick), acceptance, and build-start flow through the real store; the pad becomes exclusively the contract\'s', () => {
    useGameStore.setState((s) => ({
      resources: {
        ...s.resources,
        reputation: { ...s.resources.reputation, amount: 100 },
        hardware: { ...s.resources.hardware, amount: 40, byTier: { aluminum: 40, titanium: 0 }, cap: 500 },
      },
      buildings: { ...s.buildings, payloadProcessing: { ...s.buildings.payloadProcessing, level: 1 } },
    }));

    useGameStore.getState().applyTick(0);
    const offer = useGameStore.getState().contracts.offers.find((o) => o.tier === 1);
    expect(offer).toBeDefined();

    useGameStore.getState().acceptContractOffer(offer!.id);
    expect(useGameStore.getState().contracts.active).toHaveLength(1);

    useGameStore.getState().startContractStage('padA', offer!.id);
    expect(useGameStore.getState().mission.pads.padA?.contractId).toBe(offer!.id);
    expect(useGameStore.getState().resources.hardware.amount).toBe(0); // 40 - 40 paid
    expect(useGameStore.getState().contracts.active[0].padId).toBe('padA');

    // Pad exclusivity: Aurora's own action must now refuse this pad (the "pad-queue
    // tension" SPRINTS.md's acceptance criterion names) — nothing should change.
    useGameStore.getState().startAuroraStage('padA');
    expect(useGameStore.getState().mission.pads.padA?.stagesDone).toEqual([]);
  });
});

// SPRINTS.md Sprint 7 task 4: "committedRoll drawn and persisted at checklist
// completion; countdown resolves it deterministically (export/import cannot re-roll —
// regression test)." A save-scummer's whole strategy is: get to checklist completion,
// export (or just let autosave write), keep re-importing/reloading hoping for a
// different outcome. This proves that doesn't work — the committedRoll surviving a real
// JSON round-trip is what makes the outcome already decided, not just "not re-rolled in
// the same session."
describe('roll commitment survives export/import (Sprint 7 regression test, rule 12)', () => {
  it('a committedRoll drawn before saving resolves identically after a save/load round-trip, never redrawn', () => {
    const state = createInitialState();
    state.buildings.trackingStation.level = 1;
    state.buildings.launchControl.level = 1;
    state.staff.pools.controller.hired = 3;
    state.staff.pools.controller.assigned.launchControl = 3;
    state.certifications.engines.orbital1 = { attempted: true, certified: true, extendedCertified: true };
    state.mission.pads.padA = {
      rocketStatus: 'on_pad',
      stagesDone: ['structure', 'engines', 'guidance', 'satellitePayload', 'finalIntegration', 'padTransfer', 'propellantLoad', 'flightReview'],
      checklist: {
        rocketIntegrated: true, enginesCertified: true, transferToPad: true, propellantLoaded: true,
        flightReview: true, controllersOnStation: true, trackingActive: true, weatherWindow: true,
      },
      confidence: 100,
      committedRoll: 0.6789, // already committed — confidence 100 means this is a guaranteed success either way,
      // but the EXACT value must still survive the round-trip unchanged (checked below).
    };

    saveGame(state);
    const reloaded = loadGame();

    expect(reloaded.mission.pads.padA?.committedRoll).toBe(0.6789);

    // Calling the tick-time resolver again post-reload (as the next real frame would)
    // must be a true no-op — never redraw just because the process went through a
    // save/load boundary.
    const reResolved = resolveAuroraChecklist(
      reloaded.mission, 'padA', reloaded.buildings, reloaded.staff,
      reloaded.certifications.engines.orbital1, reloaded.resources.flightxp.amount,
      () => { throw new Error('must not draw a fresh roll — committedRoll is already set'); },
    );
    expect(reResolved.pads.padA?.committedRoll).toBe(0.6789);

    const result = launchAuroraMission(reloaded.resources, reloaded.mission, 'padA', reloaded.research.completed, reloaded.narrative.seen, Date.now());
    expect(result!.mission.launches[0].success).toBe(true); // 0.6789 < 1.0 (100% confidence)
  });
});

// Sprint 3.5: hardResetSave found a real race — removeItem() + reload() isn't enough,
// because reload() fires `beforeunload`, and the autosave handler re-saves the CURRENT
// UI_SPEC §6 (Settings screen import): unlike loadGame()'s silent boot-time fallback
// (tested at the top of this file — never crash, just fall back), an explicit import
// must say clearly why it refused, and must never silently accept a save loadGame would
// just shrug at. Placed here (immediately before hardResetSave, not near loadGame where
// it was first written) for the exact same reason hardResetSave itself must be last:
// a SUCCESSFUL import also flips the module-level `resetInProgress` guard with no reset
// hook, so it would break every subsequent saveGame() call in this file if it ran
// earlier — discovered live when adding these tests broke four unrelated ones below.
describe('importSave', () => {
  it('rejects invalid JSON with a clear error, without touching the existing save', () => {
    const existing = createInitialState();
    existing.resources.funding.amount = 42;
    saveGame(existing);

    const result = importSave('not json at all {{{');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid JSON/i);
    expect(loadGame().resources.funding.amount).toBe(42); // untouched
  });

  it('rejects an object with no schemaVersion', () => {
    const result = importSave(JSON.stringify({ resources: {} }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/version info/i);
  });

  it('rejects a save from a newer schema version than this build supports', () => {
    const future = { ...createInitialState(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    const result = importSave(JSON.stringify(future));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/newer version/i);
  });

  // importSave's `reload` param is injectable specifically so tests never have to
  // invoke the real window.location.reload() — jsdom's version is non-configurable
  // (vi.spyOn can't touch it) and, discovered live, actually corrupts jsdom's shared
  // localStorage/navigation state for every later test if it fires for real. A no-op
  // stub here plus an explicit assertion that it was called is both safer and more
  // precise than trying to intercept the real global.
  it('accepts a valid current-version save, migrates it into place, and reloads', () => {
    const reload = vi.fn();
    const toImport = createInitialState();
    toImport.resources.funding.amount = 999;
    const result = importSave(JSON.stringify(toImport), reload);

    expect(result.ok).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(loadGame().resources.funding.amount).toBe(999);
  });

  it('migrates an older-version save on import, same as loadGame would', () => {
    const older = createInitialState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed pre-v2 shape for the migration test
    const raw: any = { ...older, schemaVersion: 1 };
    delete raw.buildings.offices.starvedIndicator;
    delete raw.buildings.offices.fedStreakMs;

    const result = importSave(JSON.stringify(raw), vi.fn());
    expect(result.ok).toBe(true);
    expect(loadGame().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loadGame().buildings.offices.starvedIndicator).toBe(false);
  });
});

describe('dismissMilestoneScreen (Sprint 10 task 3)', () => {
  beforeEach(() => {
    useGameStore.setState(createInitialState());
  });

  it('latches economyFlags.milestoneScreenDismissed permanently', () => {
    expect(useGameStore.getState().economyFlags.milestoneScreenDismissed).toBeUndefined();
    useGameStore.getState().dismissMilestoneScreen();
    expect(useGameStore.getState().economyFlags.milestoneScreenDismissed).toBe(true);
    // Idempotent: calling it again is a no-op, not an error.
    useGameStore.getState().dismissMilestoneScreen();
    expect(useGameStore.getState().economyFlags.milestoneScreenDismissed).toBe(true);
  });
});

// in-memory state right after the key was cleared, before the reloaded page ever reads
// it. Placed last in this file: hardResetSave permanently flips a module-level guard
// with no reset hook (mirroring what only a real page reload undoes in production), so
// it would break every subsequent saveGame() call in this test file if it ran earlier —
// the same reason the importSave block right above also has to sit this late (its
// successful-import tests flip the same guard).
describe('hardResetSave (Sprint 3.5) — must be the last describe block in this file', () => {
  it('clears the save and makes a subsequent saveGame() (simulating the beforeunload race) a no-op', () => {
    // Seeded directly, not via saveGame() — by the time this runs, importSave's own
    // successful-import tests (immediately above) have already flipped the module-level
    // resetInProgress guard, which would make a saveGame() call here silently no-op.
    // What's under test is hardResetSave's own clear + guard, not saveGame's write path
    // (already covered by the 'saveGame' describe block earlier in this file).
    localStorage.setItem(SAVE_KEY, JSON.stringify(createInitialState()));
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
