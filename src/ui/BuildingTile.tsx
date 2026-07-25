import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { BUILDINGS } from '../data/buildings';
import { costAtLevel, productionPerSecond } from '../core/economy';
import { formatAmount, formatRate } from '../core/format';
import {
  assignedToBuilding,
  buildingSlotCount,
  staffRatioForBuilding,
  unassignedCount,
} from '../core/staff';
import type { BuildingId, ResourceId, RoleId } from '../core/types';

const RESOURCE_ABBR: Record<ResourceId, string> = {
  funding: 'F',
  materials: 'M',
  hardware: 'H',
  propellant: 'P',
  research: 'R',
  reputation: 'Rep',
  flightxp: 'XP',
};

const ROLE_LABELS: Record<RoleId, string> = {
  technician: 'Technician',
  engineer: 'Engineer',
  scientist: 'Scientist',
  controller: 'Controller',
};

interface BuildingTileProps {
  buildingId: BuildingId;
  children?: ReactNode;
}

export function BuildingTile({ buildingId, children }: BuildingTileProps) {
  const def = BUILDINGS[buildingId];
  const level = useGameStore((s) => s.buildings[buildingId].level);
  const resources = useGameStore(useShallow((s) => s.resources));
  const staff = useGameStore(useShallow((s) => s.staff));
  const buyBuilding = useGameStore((s) => s.buyBuilding);
  const assign = useGameStore((s) => s.assign);

  const isOneTime = def.costFactor === null;
  const alreadyBuilt = isOneTime && level > 0;
  const cost = costAtLevel(def.baseCost, def.costFactor, level);
  const costEntries = Object.entries(cost) as [ResourceId, number][];
  const canAfford = costEntries.every(([id, amount]) => resources[id].amount >= amount);
  const costLabel = costEntries
    .map(([id, amount]) => `${formatAmount(amount)} ${RESOURCE_ABBR[id]}`)
    .join(' + ');

  const roles = Object.keys(def.slots ?? {}) as RoleId[];

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
              roles.length > 0 ? staffRatioForBuilding(staff, buildingId, roles[0]) : 1,
            ),
          )}
          /s {RESOURCE_ABBR[def.production.resource]}
        </div>
      )}

      {roles.map((role) => {
        const assigned = assignedToBuilding(staff, role, buildingId);
        const slots = buildingSlotCount(buildingId, role);
        const canAssign = assigned < slots && unassignedCount(staff, role) > 0;
        return (
          <div key={role} className="building-tile__staff-row">
            <span>{ROLE_LABELS[role]}</span>
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
