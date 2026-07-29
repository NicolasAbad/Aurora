// NARRATIVE_EVENTS.md §3 / ECONOMY §11 (Sprint 9): random events. Two halves, mirroring
// this codebase's established process-resolution shape: `tickEvents` (called every ONLINE
// frame only, state/persistStore.ts's applyTick — never offline resolution, see
// core/types.ts's EventsState comment) accumulates active time and rolls the 15%/10-min
// check; `resolveEventChoice` applies whichever of the two options the player picked.
import {
  EVENT_CHECK_INTERVAL_MS,
  EVENT_CHECK_PROBABILITY,
  EVENT_DEFS,
  EVENT_DEFS_BY_ID,
  EVENT_MIN_GAP_MS,
  type EventDef,
  type EventPreconditionId,
} from '../data/events';
import { applyGrant } from './economy';
import { spendHardware } from './hardware';
import { applyModifiers, registerModifier } from './modifiers';
import type { EventsState, GameState, Modifier } from './types';

export const DEFAULT_EVENTS_STATE: EventsState = { activeMsAccumulated: 0, lastEventAt: null, pending: null };

export interface EventEligibilityContext {
  refineryBuilt: boolean;
  complexBBuilt: boolean; // lifetime Funding >= 300, same gate ComplexTabs itself uses
  hardwareAmount: number;
  scientistsHired: number;
}

function preconditionMet(id: EventPreconditionId, ctx: EventEligibilityContext): boolean {
  switch (id) {
    case 'refineryBuilt':
      return ctx.refineryBuilt;
    case 'complexBBuilt':
      return ctx.complexBBuilt;
    case 'hardware15Plus':
      return ctx.hardwareAmount >= 15;
    case 'scientistHired':
      return ctx.scientistsHired >= 1;
  }
}

/** "Every event declares a precondition explicitly — an absent precondition is a spec
 * error, not 'no gate'" (NARRATIVE §3's own rule) — every EVENT_DEFS entry has one, so
 * this never silently includes an event nothing has gated. */
export function eligibleEvents(ctx: EventEligibilityContext): EventDef[] {
  return EVENT_DEFS.filter((d) => preconditionMet(d.precondition, ctx));
}

export interface TickEventsResult {
  events: EventsState;
}

/**
 * "15% check per 10 active min, >=30 min apart, never during countdown" (NARRATIVE §3).
 * `duringCountdown`: true if any pad or the sounding mission currently has a committed
 * roll awaiting the launch button (state/persistStore.ts computes this) — the check
 * simply waits for the next window rather than being lost. At most one event is ever
 * `pending` at a time; a window rolling while one is already pending is a no-op (the
 * card must resolve first). Silently skips firing if the roll misses, the gap hasn't
 * passed, or nothing is currently eligible — the accumulator's leftover remainder always
 * carries forward either way, so no active time is ever double-counted or dropped.
 */
export function tickEvents(
  events: EventsState,
  deltaMs: number,
  ctx: EventEligibilityContext,
  duringCountdown: boolean,
  now: number,
  randomFn: () => number = Math.random,
): TickEventsResult {
  if (events.pending) return { events };

  const activeMsAccumulated = events.activeMsAccumulated + deltaMs;
  if (activeMsAccumulated < EVENT_CHECK_INTERVAL_MS) {
    return { events: { ...events, activeMsAccumulated } };
  }
  const carried = { ...events, activeMsAccumulated: activeMsAccumulated - EVENT_CHECK_INTERVAL_MS };

  if (duringCountdown) return { events: carried };
  if (events.lastEventAt !== null && now - events.lastEventAt < EVENT_MIN_GAP_MS) return { events: carried };
  if (randomFn() >= EVENT_CHECK_PROBABILITY) return { events: carried };

  const eligible = eligibleEvents(ctx);
  if (eligible.length === 0) return { events: carried };

  const chosen = eligible[Math.floor(randomFn() * eligible.length)];
  return {
    events: { ...carried, lastEventAt: now, pending: { id: chosen.id, triggeredAt: now } },
  };
}

export interface ResolveEventChoiceResult {
  resources: GameState['resources'];
  staff: GameState['staff'];
  modifiers: Modifier[];
  mission: GameState['mission'];
  events: EventsState;
}

/**
 * Applies whichever option ('A' or 'B') the player picked for the currently-pending
 * event, then clears `pending`. Each effect kind (data/events.ts's EventOptionEffect)
 * maps to one mechanic; `haltProduction`/`freeScientistWithSalaryPremium`/
 * `reputationAndTempDurationPenalty` all register real core/modifiers.ts Modifiers
 * (CLAUDE.md rule 4) rather than special-casing the event inside economy.ts — the modifier
 * IDs are timestamped (not fixed) because these events can fire more than once across a
 * long playthrough (NARRATIVE §3 doesn't mark any of them one-time), and each occurrence
 * should stack its own effect rather than silently no-op against registerModifier's
 * same-id idempotency guard.
 */
export function resolveEventChoice(
  state: Pick<GameState, 'resources' | 'staff' | 'modifiers' | 'mission' | 'events'>,
  choice: 'A' | 'B',
  now: number,
): ResolveEventChoiceResult | null {
  const events = state.events ?? DEFAULT_EVENTS_STATE;
  if (!events.pending) return null;
  const def = EVENT_DEFS_BY_ID.get(events.pending.id);
  if (!def) return null;
  const effect = (choice === 'A' ? def.optionA : def.optionB).effect;

  let resources = state.resources;
  let staff = state.staff;
  let modifiers = state.modifiers;
  let mission = state.mission;

  switch (effect.kind) {
    case 'fundingPercentPenalty': {
      const amount = Math.round(resources.funding.amount * effect.amount);
      resources = { ...resources, funding: { ...resources.funding, amount: Math.max(0, resources.funding.amount - amount) } };
      break;
    }
    case 'haltProduction': {
      modifiers = registerModifier(modifiers, {
        id: `event-${def.id}-halt-${now}`,
        source: def.id,
        target: 'production.rate',
        op: 'mult',
        value: 0,
        expiresAt: now + effect.durationMs,
      });
      break;
    }
    case 'grant': {
      let next = resources;
      if (effect.funding) {
        next = { ...next, funding: applyGrant(next.funding, effect.funding, true) };
      }
      if (effect.reputation) {
        // ECONOMY §9 (Sprint 10): Public relations' +20% Reputation applies to a
        // positive event grant, never to the negative-penalty branch below.
        next =
          effect.reputation >= 0
            ? {
                ...next,
                reputation: applyGrant(next.reputation, applyModifiers(effect.reputation, state.modifiers, 'reputation.gain', now), true),
              }
            : { ...next, reputation: { ...next.reputation, amount: Math.max(0, next.reputation.amount + effect.reputation) } };
      }
      resources = next;
      break;
    }
    case 'spendHardware': {
      resources = { ...resources, hardware: spendHardware(resources.hardware, Math.min(effect.amount, resources.hardware.amount)) };
      break;
    }
    case 'confidencePenaltyNext': {
      mission = { ...mission, confidencePenaltyNext: (mission.confidencePenaltyNext ?? 0) + effect.amount };
      break;
    }
    case 'freeScientistWithSalaryPremium': {
      staff = {
        ...staff,
        pools: { ...staff.pools, scientist: { ...staff.pools.scientist, hired: staff.pools.scientist.hired + 1 } },
      };
      modifiers = registerModifier(modifiers, {
        id: `event-${def.id}-salary-${now}`,
        source: def.id,
        target: 'salary.flat',
        op: 'add',
        value: effect.salaryFlatPerSecond,
      });
      break;
    }
    case 'reputationAndTempDurationPenalty': {
      resources = {
        ...resources,
        reputation: applyGrant(resources.reputation, applyModifiers(effect.reputation, state.modifiers, 'reputation.gain', now), true),
      };
      modifiers = registerModifier(modifiers, {
        id: `event-${def.id}-duration-${now}`,
        source: def.id,
        target: 'process.duration',
        op: 'mult',
        value: effect.durationMult,
        expiresAt: now + effect.expiresInMs,
      });
      break;
    }
    case 'buyMaterials': {
      if (resources.funding.amount >= effect.fundingCost) {
        resources = {
          ...resources,
          funding: { ...resources.funding, amount: resources.funding.amount - effect.fundingCost },
          materials: applyGrant(resources.materials, effect.materialsGained, true),
        };
      }
      break;
    }
    case 'none':
      break;
  }

  return { resources, staff, modifiers, mission, events: { ...events, pending: null } };
}
