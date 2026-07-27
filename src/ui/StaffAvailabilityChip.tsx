import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { ROLE_LABEL, ROLES } from '../data/roles';
import { unassignedCount } from '../core/staff';
import type { RoleId } from '../core/types';

interface StaffAvailabilityChipProps {
  onTap: () => void;
}

/** UI_SPEC §2c: "every complex tab shows a compact staff chip in its header —
 * `Available: 2 Tech · 1 Eng` (unassigned pool only) — so assignment decisions never
 * require navigating to Campus first. Tapping it opens the staff panel." */
export function StaffAvailabilityChip({ onTap }: StaffAvailabilityChipProps) {
  const staff = useGameStore(useShallow((s) => s.staff));
  const entries = (Object.keys(ROLES) as RoleId[])
    .map((role) => ({ role, count: unassignedCount(staff, role) }))
    .filter((e) => e.count > 0);

  return (
    <button type="button" className="staff-availability-chip" onClick={onTap}>
      {entries.length === 0
        ? 'Available: 0'
        : `Available: ${entries.map((e) => `${e.count} ${ROLE_LABEL[e.role]}`).join(' · ')}`}
    </button>
  );
}
