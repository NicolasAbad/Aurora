import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { ROLE_LABEL, ROLES } from '../data/roles';
import { RESOURCE_NAME } from '../data/resourceNames';
import { narrativeText } from '../data/narrative';
import {
  hiringCost,
  isRoleUnlocked,
  openSlotsForRole,
  totalHired,
  totalOpenSlots,
  totalSalaryPerSecond,
  totalStaffCap,
} from '../core/staff';
import { formatRate } from '../core/format';
import { CostLabel } from './CostLabel';
import type { RoleId } from '../core/types';

export function StaffHiring() {
  const staff = useGameStore(useShallow((s) => s.staff));
  const buildings = useGameStore(useShallow((s) => s.buildings));
  const completedTech = useGameStore(useShallow((s) => s.research.completed));
  const crewQuartersLevel = useGameStore((s) => s.buildings.crewQuarters.level);
  const funding = useGameStore((s) => s.resources.funding.amount);
  const hire = useGameStore((s) => s.hire);

  const cap = totalStaffCap(crewQuartersLevel);
  const hired = totalHired(staff);
  const openSlots = totalOpenSlots(staff, buildings);

  // NARRATIVE §7 / UI_SPEC §4 (the idle-staff trap): hiring is NEVER blocked — the
  // player keeps the choice — but a hire that would land with nowhere to go requires
  // acknowledging it first (T-11), so idle salary burn is a choice, not a surprise.
  function handleHire(role: RoleId) {
    if (openSlotsForRole(staff, buildings, role) === 0 && !window.confirm(narrativeText('T-11'))) {
      return;
    }
    hire(role);
  }

  return (
    <div className="staff-panel">
      <div className="staff-panel__header">
        <span>Staff</span>
        <span>
          {hired}/{cap}
        </span>
      </div>
      <div className="staff-panel__salary">
        Salary burn: −{formatRate(totalSalaryPerSecond(staff))} {RESOURCE_NAME.funding}/s
      </div>
      {/* T-10: always visible, program-wide (NARRATIVE §7). */}
      <div className="staff-panel__open-slots">{narrativeText('T-10', { n: openSlots })}</div>
      {(Object.keys(ROLES) as RoleId[]).map((role) => {
        const unlocked = isRoleUnlocked(role, completedTech);
        const cost = hiringCost(role, staff.pools[role].hired);
        const canHire = unlocked && hired < cap && funding >= cost;
        return (
          <div key={role} className="staff-panel__row">
            <span>
              {ROLE_LABEL[role]} ({staff.pools[role].hired})
            </span>
            {unlocked ? (
              <button type="button" disabled={!canHire} onClick={() => handleHire(role)}>
                Hire (<CostLabel cost={{ funding: cost }} />)
              </button>
            ) : (
              <span className="staff-panel__locked">Requires tech: {ROLES[role].unlockTech}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
