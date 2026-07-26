import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { BUILDINGS } from '../data/buildings';
import { RESOURCE_NAME } from '../data/resourceNames';
import { ROLE_LABEL } from '../data/roles';
import { costAtLevel, productionPerSecond } from '../core/economy';
import { formatAmount, formatRate } from '../core/format';
import {
  assignedToBuilding,
  buildingSlotCount,
  buildingStaffRatio,
  unassignedCount,
} from '../core/staff';
import type { BuildingId, ResourceId, RoleId } from '../core/types';

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

  const isOneTime = def.costFactor === null;
  const alreadyBuilt = isOneTime && level > 0;
  const cost = costAtLevel(def.baseCost, def.costFactor, level);
  const costEntries = Object.entries(cost) as [ResourceId, number][];
  const canAfford = costEntries.every(([id, amount]) => resources[id].amount >= amount);
  const costLabel = costEntries
    .map(([id, amount]) => `${formatAmount(amount)} ${RESOURCE_NAME[id]}`)
    .join(' + ');

  // ECONOMY §4 (v2.8): "slots exist only at building level >= 1" — an unbuilt building
  // must not appear as an assignment target at all, not just refuse the click.
  const roles = level >= 1 ? (Object.keys(def.slots ?? {}) as RoleId[]) : [];

  return (
    <div className="building-tile">
      <div className="building-tile__header">
        <span className="building-tile__name">{def.name}</span>
        <span className="building-tile__level">Level {level}</span>
      </div>

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

      {roles.map((role) => {
        const assigned = assignedToBuilding(staff, role, buildingId);
        const slots = buildingSlotCount(buildingId, role, level);
        const canAssign = assigned < slots && unassignedCount(staff, role) > 0;
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
          </div>
        );
      })}

      {level >= 1 && def.internalUpgrades?.map((upgrade) => {
        const owned = ownedUpgrades.includes(upgrade.id);
        const upgradeCostEntries = Object.entries(upgrade.cost) as [ResourceId, number][];
        const canAffordUpgrade = upgradeCostEntries.every(([id, amount]) => resources[id].amount >= amount);
        const upgradeCostLabel = upgradeCostEntries
          .map(([id, amount]) => `${formatAmount(amount)} ${RESOURCE_NAME[id]}`)
          .join(' + ');
        return (
          <div key={upgrade.id} className="building-tile__internal-upgrade">
            <span>{upgrade.name}</span>
            {owned ? (
              <span className="research-node__done">Owned</span>
            ) : (
              <button
                type="button"
                className="upgrade-button"
                disabled={!canAffordUpgrade}
                onClick={() => buyInternalUpgrade(buildingId, upgrade.id)}
              >
                Buy ({upgradeCostLabel})
              </button>
            )}
          </div>
        );
      })}

      {children}

      {!alreadyBuilt && (
        <button
          type="button"
          className="upgrade-button"
          disabled={!canAfford}
          onClick={() => buyBuilding(buildingId)}
        >
          {isOneTime ? 'Build' : 'Upgrade'} ({costLabel})
        </button>
      )}
    </div>
  );
}
