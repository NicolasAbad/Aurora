import { useGameStore } from '../state/persistStore';
import { currentDirective } from '../core/directive';
import { narrativeText } from '../data/narrative';

/** UI_SPEC §2h (Sprint 9.5, NEW): persistent "what now" indicator near the ticker — no
 * dismiss button, just changes live as game state changes (core/directive.ts). Sprint
 * 10.5 gave this the Program Site Map as a corner thumbnail; Sprint 11.5's SECOND rework
 * (v3.7, real playtest finding: even a bigger thumbnail had no impact) detached the map
 * entirely — it's now its own destination via a ticker-area entry point (Ticker.tsx,
 * SiteMap.tsx), and this component goes back to being text-only. */
export function CurrentDirective() {
  const id = useGameStore(currentDirective);
  if (!id) return null;
  return (
    <div className="current-directive">
      <span className="current-directive__body">
        <span className="current-directive__label">Next</span>
        <span className="current-directive__text">{narrativeText(id)}</span>
      </span>
    </div>
  );
}
