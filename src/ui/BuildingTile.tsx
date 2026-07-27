import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { BUILDINGS } from '../data/buildings';
import { RESOURCE_NAME } from '../data/resourceNames';
import { ROLE_LABEL } from '../data/roles';
import { narrativeText } from '../data/narrative';
import { costAtLevel, productionPerSecond } from '../core/economy';
import { formatRate } from '../core/format';
import {
  assignedToBuilding,
  buildingSlotCount,
  buildingStaffRatio,
  unassignedCount,
} from '../core/staff';
import { upgradeDeltaPreview } from '../core/upgradePreview';
import type { BuildingId, ResourceId, RoleId } from '../core/types';
import { CostLabel } from './CostLabel';

interface BuildingTileProps {
  buildingId: BuildingId;
  children?: ReactNode;
}

export function BuildingTile({ buildingId, children }: BuildingTileProps) {
  const def = BUILDINGS[buildingId];
  const level = useGameStore((s) => s.buildings[buildingId].level);
  const starvedIndicator = useGameStore((s) => s.buildings[buildingId].starvedIndicator);
  const ownedUpgrades = useGameStore((s) => s.buildings[buildingId].upgrades);
  const resources = useGameStore(useShallow((s) => s.resources));
  const staff = useGameStore(useShallow((s) => s.staff));
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
  const canAfford = costEntries.every(([id, amount]) => resources[id].amount >= amount);

  // ECONOMY §4 (v2.8): "slots exist only at building level >= 1" — an unbuilt building
  // must not appear as an assignment target at all, not just refuse the click.
  const roles = level >= 1 ? (Object.keys(def.slots ?? {}) as RoleId[]) : [];

  // UI_SPEC §4 (v3.5): leveled buildings preview the next level's delta on the Upgrade
  // button itself, "every level, forever" — one-time buildings have no "next level".
  const deltaPreview = !isLocked && !isOneTime
    ? upgradeDeltaPreview(buildingId, level, buildingStaffRatio(staff, buildingId, level))
    : null;

  return (
    <div className="building-tile">
      <div className="building-tile__header">
        <span className="building-tile__name">{def.name}</span>
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
              buildingStaffRatio(staff, buildingId, level),
            ),
          )}
          /s {RESOURCE_NAME[def.production.resource]}
          {def.production.consumes && starvedIndicator && (
            <span className="building-tile__starved"> — STARVED</span>
          )}
        </div>
      )}

      {/* UI_SPEC §4 (v3.5): "Every consuming building shows its inputs, not just its
          output" — its own line beside the production line, not folded into it. */}
      {def.production?.consumes && (
        <div className="building-tile__consumes">
          Consumes: <CostLabel cost={def.production.consumes} /> per {RESOURCE_NAME[def.production.resource]}
        </div>
      )}

      {roles.map((role) => {
        const assigned = assignedToBuilding(staff, role, buildingId);
        const slots = buildingSlotCount(buildingId, role, level);
        const canAssign = assigned < slots && unassignedCount(staff, role) > 0;
        const fullyStaffed = slots > 0 && assigned === slots;
        return (
          <div key={role} className="building-tile__staff-row">
            <span>{ROLE_LABEL[role]}</span>
            <div className="stepper">
              <button
                type="button"
                disabled={assigned === 0}
                onClick={() => assign(role, buildingId, -1)}
              >
                −
              </button>
              <span>
                {assigned}/{slots}
              </span>
              <button type="button" disabled={!canAssign} onClick={() => assign(role, buildingId, 1)}>
                +
              </button>
            </div>
            {/* T-12 (NARRATIVE §7, idle-staff trap companion): explains WHY the + is
                disabled here specifically, rather than leaving it a silent dead button. */}
            {fullyStaffed && <div className="building-tile__slot-note">{narrativeText('T-12')}</div>}
          </div>
        );
      })}

      {level >= 1 && def.internalUpgrades?.map((upgrade) => {
        const owned = ownedUpgrades.includes(upgrade.id);
        const canAffordUpgrade = (Object.entries(upgrade.cost) as [ResourceId, number][]).every(
          ([id, amount]) => resources[id].amount >= amount,
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
