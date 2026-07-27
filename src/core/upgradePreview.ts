// UI_SPEC §4 (v3.5 clarity rule): "Upgrade buttons preview the NEXT level's delta...
// Answers 'why upgrade' at a glance, every level, forever." Pure formatting logic,
// separated from BuildingTile.tsx so it's independently testable (rule 7) — covers every
// building shape that has a real, already-implemented numeric per-level effect (rate
// production, cap bonus, staff cap bonus, and — new this sprint — Test Stand's
// certification-duration reduction). Buildings with no wired numeric effect yet (VAB,
// Launch Pad, Launch Control, Tracking Station's XP multiplier — that's Sprint 10) return
// null rather than inventing a plausible-sounding preview.
import { BUILDINGS } from '../data/buildings';
import { RESOURCE_NAME } from '../data/resourceNames';
import { certificationDurationMultiplier, TEST_STAND_DURATION_REDUCTION_PER_LEVEL } from './certification';
import { productionPerSecond } from './economy';
import type { BuildingId, ResourceId } from './types';

export function upgradeDeltaPreview(buildingId: BuildingId, level: number, staffRatio: number): string | null {
  const def = BUILDINGS[buildingId];

  if (def.production) {
    const current = productionPerSecond(def.production.basePerSec, level, staffRatio);
    const next = productionPerSecond(def.production.basePerSec, level + 1, staffRatio);
    const delta = next - current;
    return `Level ${level + 1} → +${delta.toFixed(1)}/s ${RESOURCE_NAME[def.production.resource]} (currently +${current.toFixed(1)}/s)`;
  }

  if (def.capBonus) {
    const parts = (Object.entries(def.capBonus) as [ResourceId, number][]).map(
      ([id, amount]) => `+${amount} ${RESOURCE_NAME[id]} cap`,
    );
    return `Level ${level + 1} → ${parts.join(', ')}`;
  }

  if (def.staffCapBonus) {
    return `Level ${level + 1} → +${def.staffCapBonus} staff cap`;
  }

  if (buildingId === 'testStand') {
    const currentPct = Math.round((1 - certificationDurationMultiplier(level, false)) * 100);
    const nextPct = Math.round((1 - certificationDurationMultiplier(level + 1, false)) * 100);
    if (level < 1) {
      return `Level ${level + 1} → enables certifications; each level after that: -${Math.round(TEST_STAND_DURATION_REDUCTION_PER_LEVEL * 100)}% certification duration`;
    }
    return `Level ${level + 1} → -${nextPct}% certification duration (currently -${currentPct}%)`;
  }

  return null;
}
