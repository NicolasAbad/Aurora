import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { BUILDINGS } from '../data/buildings';
import { RESOURCE_NAME } from '../data/resourceNames';
import { ROLE_LABEL } from '../data/roles';
import { narrativeText } from '../data/narrative';
import {
  costAtLevel,
  fabricationConsumeMultiplier,
  productionPerSecond,
  refineryConsumeMultiplier,
} from '../core/economy';
import { formatRate } from '../core/format';
import {
  assignedToBuilding,
  buildingSlotCount,
  buildingStaffRatio,
  slotUpgradeForRole,
  unassignedCount,
} from '../core/staff';
import { upgradeDeltaPreview } from '../core/upgradePreview';
import type { BuildingId, Modifier, ResourceId, RoleId, StaffState } from '../core/types';
import { BuildingIcon } from './BuildingIcon';
import { CostLabel } from './CostLabel';

// Sprint 11 performance pass: a stub pool for roles this specific building has no slots
// for — `assignedToBuilding`/`unassignedCount`/`buildingStaffRatio` (core/staff.ts) all
// take a full StaffState, but only ever read `.pools[role]` for roles actually in
// `def.slots`, so a stable, never-read stand-in for the rest is safe and lets the
// selector below subscribe to just the relevant role(s) instead of all four.
const EMPTY_POOL: StaffState['pools'][RoleId] = { hired: 0, assigned: {} as Record<BuildingId, number> };
const EMPTY_MODIFIERS: Modifier[] = [];

interface BuildingTileProps {
  buildingId: BuildingId;
  children?: ReactNode;
}

export function BuildingTile({ buildingId, children }: BuildingTileProps) {
  const def = BUILDINGS[buildingId];
  const level = useGameStore((s) => s.buildings[buildingId].level);
  const starvedIndicator = useGameStore((s) => s.buildings[buildingId].starvedIndicator);
  const ownedUpgrades = useGameStore((s) => s.buildings[buildingId].upgrades);
  // Only fabrication's consume-multiplier ever reads modifiers — every other tile gets a
  // stable empty array back, so a modifier expiring/being added elsewhere never
  // re-renders the other 17 tiles.
  const modifiers = useGameStore(
    useShallow((s) => (buildingId === 'fabrication' ? s.modifiers : EMPTY_MODIFIERS)),
  );
  // Only the specific resource ids this building's own cost + internal-upgrade costs
  // actually reference (usually 1-3 of the 7) — was the whole `resources` slice before,
  // re-rendering every tile on every tick regardless of which resources it cares about.
  const relevantResourceIds = Array.from(
    new Set([
      ...(Object.keys(def.baseCost) as ResourceId[]),
      ...(def.internalUpgrades ?? []).flatMap((u) => Object.keys(u.cost) as ResourceId[]),
    ]),
  );
  const resourceAmounts = useGameStore(
    useShallow((s) => Object.fromEntries(relevantResourceIds.map((id) => [id, s.resources[id].amount]))),
  ) as Record<ResourceId, number>;
  // Only the role pool(s) this building has slots for — unassignedCount/
  // assignedToBuilding/buildingStaffRatio never read any other role for this buildingId.
  const relevantRoles = Object.keys(def.slots ?? {}) as RoleId[];
  const relevantPools = useGameStore(
    useShallow((s) => Object.fromEntries(relevantRoles.map((r) => [r, s.staff.pools[r]]))),
  ) as Partial<StaffState['pools']>;
  const staff: StaffState = {
    astronauts: [],
    pools: {
      technician: relevantPools.technician ?? EMPTY_POOL,
      engineer: relevantPools.engineer ?? EMPTY_POOL,
      scientist: relevantPools.scientist ?? EMPTY_POOL,
      controller: relevantPools.controller ?? EMPTY_POOL,
    },
  };
  const buyBuilding = useGameStore((s) => s.buyBuilding);
  const buyInternalUpgrade = useGameStore((s) => s.buyInternalUpgrade);
  const assign = useGameStore((s) => s.assign);

  // UI_SPEC §2b: `locked` buildings (v1: Training Center only) render with their
  // condition and never a functional purchase path — not just disabled, genuinely
  // unbuildable in v1.
  const isLocked = def.unlockCondition.kind === 'locked';

  const isOneTime = def.costFactor === null;
  const alreadyBuilt = isOneTime && level > 0;
  const cost = costAtLevel(def.baseCost, def.costFactor, level);
  const costEntries = Object.entries(cost) as [ResourceId, number][];
  const canAfford = costEntries.every(([id, amount]) => resourceAmounts[id] >= amount);

  // ECONOMY §4 (v2.8): "slots exist only at building level >= 1" — an unbuilt building
  // must not appear as an assignment target at all, not just refuse the click.
  const roles = level >= 1 ? (Object.keys(def.slots ?? {}) as RoleId[]) : [];

  // UI_SPEC §4 (v3.5): leveled buildings preview the next level's delta on the Upgrade
  // button itself, "every level, forever" — one-time buildings have no "next level".
  const deltaPreview = !isLocked && !isOneTime
    ? upgradeDeltaPreview(buildingId, level, buildingStaffRatio(staff, buildingId, level, ownedUpgrades), ownedUpgrades)
    : null;

  return (
    <div className="building-tile">
      <div className="building-tile__header">
        <span className="building-tile__title">
          <BuildingIcon buildingId={buildingId} />
          <span className="building-tile__name">{def.name}</span>
        </span>
        {!isLocked && <span className="building-tile__level">Level {level}</span>}
      </div>

      {/* UI_SPEC §4: "nothing purchasable... may be offered without plain-language copy
          stating its effect" — every building shows this before any purchase happens. */}
      <div className="building-tile__description">{def.description}</div>

      {def.production && (
        <div className="building-tile__rate">
          {formatRate(
            productionPerSecond(
              def.production.basePerSec,
              level,
              buildingStaffRatio(staff, buildingId, level, ownedUpgrades),
            ),
          )}
          /s {RESOURCE_NAME[def.production.resource]}
          {def.production.consumes && starvedIndicator && (
            <span className="building-tile__starved"> — STARVED</span>
          )}
        </div>
      )}

      {/* UI_SPEC §4 (v3.5): "Every consuming building shows its inputs, not just its
          output" — its own line beside the production line, not folded into it.
          ECONOMY §4 v3.6: reflects the REAL effective rate (QA station/Recovery
          loop/Aluminum alloys), not the static base — a stale number here would fail
          the same "states its effect" bar Test Stand leveling/Auto-refuel were held to. */}
      {def.production?.consumes && (() => {
        const consumeMultiplier =
          buildingId === 'fabrication'
            ? fabricationConsumeMultiplier(ownedUpgrades.includes('qaStation'), modifiers, Date.now())
            : buildingId === 'refinery'
              ? refineryConsumeMultiplier(ownedUpgrades.includes('recoveryLoop'))
              : 1;
        const effectiveConsumes = Object.fromEntries(
          (Object.entries(def.production!.consumes!) as [ResourceId, number][]).map(([id, amount]) => [
            id,
            amount * consumeMultiplier,
          ]),
        );
        return (
          <div className="building-tile__consumes">
            Consumes: <CostLabel cost={effectiveConsumes} precise /> per {RESOURCE_NAME[def.production!.resource]}
          </div>
        );
      })()}

      {roles.map((role) => {
        const assigned = assignedToBuilding(staff, role, buildingId);
        const slots = buildingSlotCount(buildingId, role, level, ownedUpgrades);
        const canAssign = assigned < slots && unassignedCount(staff, role) > 0;
        const fullyStaffed = slots > 0 && assigned === slots;
        // T-12a/T-12b (NARRATIVE §7 v3.7, idle-staff trap companion): explains WHY the +
        // is disabled — naming the real slot-adding upgrade when one exists and isn't
        // bought yet, rather than the old generically-wrong "raise the level" line.
        const slotUpgrade = slotUpgradeForRole(buildingId, role);
        const slotUpgradeAvailable = slotUpgrade && !ownedUpgrades.includes(slotUpgrade.id);
        const fullyStaffedText = slotUpgradeAvailable
          ? narrativeText('T-12a', { upgradeName: slotUpgrade.name })
          : narrativeText('T-12b');
        return (
          <div key={role} className="building-tile__staff-row">
            <div className="building-tile__staff-row-main">
              <span>{ROLE_LABEL[role]}</span>
              <div className="stepper">
                <button
                  type="button"
                  disabled={assigned === 0}
                  aria-label={`Unassign a ${ROLE_LABEL[role]} from ${def.name}`}
                  onClick={() => assign(role, buildingId, -1)}
                >
                  −
                </button>
                <span>
                  {assigned}/{slots}
                </span>
                <button
                  type="button"
                  disabled={!canAssign}
                  aria-label={`Assign a ${ROLE_LABEL[role]} to ${def.name}`}
                  onClick={() => assign(role, buildingId, 1)}
                >
                  +
                </button>
              </div>
            </div>
            {/* Own line below the stepper row — squeezing this sentence-length text into
                the same flex row as the stepper wrapped awkwardly (found via Playwright
                screenshot verification, Sprint 9.5). */}
            {fullyStaffed && <div className="building-tile__slot-note">{fullyStaffedText}</div>}
          </div>
        );
      })}

      {level >= 1 && def.internalUpgrades?.map((upgrade) => {
        const owned = ownedUpgrades.includes(upgrade.id);
        const canAffordUpgrade = (Object.entries(upgrade.cost) as [ResourceId, number][]).every(
          ([id, amount]) => resourceAmounts[id] >= amount,
        );
        return (
          <div key={upgrade.id} className="building-tile__internal-upgrade">
            <div className="building-tile__internal-upgrade-header">
              <span>{upgrade.name}</span>
              {owned && <span className="research-node__done">Owned</span>}
            </div>
            <div className="building-tile__internal-upgrade-description">
              {narrativeText(upgrade.narrativeId)}
            </div>
            {!owned && (
              <button
                type="button"
                className="upgrade-button"
                disabled={!canAffordUpgrade}
                onClick={() => buyInternalUpgrade(buildingId, upgrade.id)}
              >
                Buy (<CostLabel cost={upgrade.cost} />)
              </button>
            )}
          </div>
        );
      })}

      {children}

      {deltaPreview && <div className="building-tile__delta-preview">{deltaPreview}</div>}

      {isLocked ? (
        <span className="building-tile__locked-badge">Locked in v1</span>
      ) : (
        !alreadyBuilt && (
          <button
            type="button"
            className="upgrade-button"
            disabled={!canAfford}
            onClick={() => buyBuilding(buildingId)}
          >
            {isOneTime ? 'Build' : 'Upgrade'} (<CostLabel cost={cost} />)
          </button>
        )
      )}
    </div>
  );
}
