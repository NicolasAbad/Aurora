import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { ROLES } from '../data/roles';
import { RESOURCE_NAME } from '../data/resourceNames';
import {
  hiringCost,
  isRoleUnlocked,
  totalHired,
  totalSalaryPerSecond,
  totalStaffCap,
} from '../core/staff';
import { formatAmount, formatRate } from '../core/format';
import type { RoleId } from '../core/types';

const ROLE_LABELS: Record<RoleId, string> = {
  technician: 'Technician',
  engineer: 'Engineer',
  scientist: 'Scientist',
  controller: 'Controller',
};

export function StaffHiring() {
  const staff = useGameStore(useShallow((s) => s.staff));
  const completedTech = useGameStore(useShallow((s) => s.research.completed));
  const crewQuartersLevel = useGameStore((s) => s.buildings.crewQuarters.level);
  const funding = useGameStore((s) => s.resources.funding.amount);
  const hire = useGameStore((s) => s.hire);

  const cap = totalStaffCap(crewQuartersLevel);
  const hired = totalHired(staff);

  return (
    <div className="staff-panel">
      <div className="staff-panel__header">
        <span>Staff</span>
        <span>
          {hired}/{cap}
        </span>
      </div>
      <div className="staff-panel__salary">
        Salary burn: −{formatRate(totalSalaryPerSecond(staff))} F/s
      </div>
      {(Object.keys(ROLES) as RoleId[]).map((role) => {
        const unlocked = isRoleUnlocked(role, completedTech);
        const cost = hiringCost(role, staff.pools[role].hired);
        const canHire = unlocked && hired < cap && funding >= cost;
        return (
          <div key={role} className="staff-panel__row">
            <span>
              {ROLE_LABELS[role]} ({staff.pools[role].hired})
            </span>
            {unlocked ? (
              <button type="button" disabled={!canHire} onClick={() => hire(role)}>
                Hire ({formatAmount(cost)} {RESOURCE_NAME.funding})
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
