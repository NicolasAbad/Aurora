import { useState } from 'react';
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
import { formatCostEntry, formatRate } from '../core/format';
import { RoleIcon } from './RoleIcon';
import type { RoleId } from '../core/types';

/** UI_SPEC §4b: Release action per pool member — inline confirm (single tap + inline
 * confirm, not a browser `window.confirm` modal), since it's reversible in spirit
 * (re-hiring is always possible) but irreversible in save state (no refund). */
function ReleaseButton({ role, hired }: { role: RoleId; hired: number }) {
  const [confirming, setConfirming] = useState(false);
  const release = useGameStore((s) => s.release);
  if (hired === 0) return null;

  if (confirming) {
    return (
      <span className="staff-panel__release-confirm">
        {narrativeText('T-15', { role: ROLE_LABEL[role] })}
        <button
          type="button"
          onClick={() => {
            release(role);
            setConfirming(false);
          }}
        >
          Confirm
        </button>
        <button type="button" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button type="button" className="staff-panel__release-button" onClick={() => setConfirming(true)}>
      Release
    </button>
  );
}

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
        const roleHired = staff.pools[role].hired;

        // ECONOMY §3 v4.1 (Sprint 11.5, GDD §2 v2.11): Engineer/Scientist have no
        // direct-hire path at all — no cost to show, no Hire button, no idle-hire
        // warning (that warning is about the Hire button specifically; see
        // PromotionPanel for the actual promotion action these roles go through).
        if (!ROLES[role].hireable) {
          return (
            <div key={role} className="staff-panel__row-group">
              <div className="staff-panel__row">
                <span className="staff-panel__role-label">
                  <RoleIcon role={role} />
                  {ROLE_LABEL[role]} ({roleHired})
                </span>
                <span className="staff-panel__row-actions">
                  <span className="staff-panel__locked">{narrativeText('T-31')}</span>
                  <ReleaseButton role={role} hired={roleHired} />
                </span>
              </div>
            </div>
          );
        }

        const unlocked = isRoleUnlocked(role, completedTech);
        const cost = hiringCost(role, roleHired);
        const canHire = unlocked && hired < cap && funding >= cost;
        // T-13 (NARRATIVE §7 v3.7): the recurring cost is part of the hire decision every
        // time, not just when it's a mistake — shown permanently, not only on the idle flag.
        const hireLabel = narrativeText('T-13', {
          role: ROLE_LABEL[role],
          cost: formatCostEntry('funding', cost),
          salary: formatRate(ROLES[role].salaryPerSec),
        });
        // T-11 (idle-staff trap): hiring is NEVER blocked (the player keeps the choice),
        // but a hire that would land with nowhere to go shows a terse inline flag next to
        // the button — visible before the click, not a confirm() interruption after it.
        const wouldBeIdle = unlocked && openSlotsForRole(staff, buildings, role) === 0;
        return (
          <div key={role} className="staff-panel__row-group">
            <div className="staff-panel__row">
              <span className="staff-panel__role-label">
                <RoleIcon role={role} />
                {ROLE_LABEL[role]} ({roleHired})
              </span>
              <span className="staff-panel__row-actions">
                {unlocked ? (
                  <button type="button" disabled={!canHire} onClick={() => hire(role)}>
                    {hireLabel}
                  </button>
                ) : (
                  <span className="staff-panel__locked">Requires tech: {ROLES[role].unlockTech}</span>
                )}
                <ReleaseButton role={role} hired={roleHired} />
              </span>
            </div>
            {/* Own line below the row, not squeezed alongside the button — wrapped
                awkwardly there (found via Playwright screenshot verification, Sprint 9.5). */}
            {wouldBeIdle && <div className="staff-panel__idle-flag">{narrativeText('T-11')}</div>}
          </div>
        );
      })}
    </div>
  );
}
