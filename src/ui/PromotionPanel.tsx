import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { PROMOTIONS, ROLE_LABEL } from '../data/roles';
import { formatDuration } from '../core/format';
import { unassignedCount } from '../core/staff';
import { CostLabel } from './CostLabel';

// ECONOMY §3: promotions are gated ONLY by the Classroom upgrade, never by the target
// role's direct-hire tech (the intended zero-Scientist bootstrap path). Progressive
// disclosure: nothing to show at all before the Classroom exists (UI_SPEC §2b).
export function PromotionPanel() {
  const staff = useGameStore(useShallow((s) => s.staff));
  const classroomBuilt = useGameStore((s) => s.buildings.crewQuarters.upgrades.includes('classroom'));
  const funding = useGameStore((s) => s.resources.funding.amount);
  const startPromotion = useGameStore((s) => s.startPromotion);

  if (!classroomBuilt) return null;

  return (
    <div className="staff-panel">
      <div className="staff-panel__header">
        <span>Promotions</span>
      </div>
      {PROMOTIONS.map((promo) => {
        const canPromote = unassignedCount(staff, promo.from) >= 1 && funding >= promo.costFunding;
        return (
          <div key={`${promo.from}-${promo.to}`} className="staff-panel__row">
            <span>
              {ROLE_LABEL[promo.from]} → {ROLE_LABEL[promo.to]}
            </span>
            <button
              type="button"
              disabled={!canPromote}
              onClick={() => startPromotion(promo.from, promo.to)}
            >
              Promote (<CostLabel cost={{ funding: promo.costFunding }} />, {formatDuration(promo.durationMs)})
            </button>
          </div>
        );
      })}
    </div>
  );
}
