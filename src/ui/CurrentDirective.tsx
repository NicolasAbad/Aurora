import { useGameStore } from '../state/persistStore';
import { currentDirective } from '../core/directive';
import { narrativeText } from '../data/narrative';
import { SiteMap } from './SiteMap';

/** UI_SPEC §2h (Sprint 9.5, NEW): persistent "what now" indicator near the ticker — no
 * dismiss button, just changes live as game state changes (core/directive.ts). Sprint
 * 10.5 (Visual Identity 2.0): gains the Program Site Map as its visual backing
 * (SiteMap.tsx) — rendered unconditionally (see that file's own header note on why it
 * isn't gated on `id`), the directive text itself stays conditional as before. */
export function CurrentDirective() {
  const id = useGameStore(currentDirective);
  return (
    <div className="current-directive">
      {id && (
        <span className="current-directive__body">
          <span className="current-directive__label">Next</span>
          <span className="current-directive__text">{narrativeText(id)}</span>
        </span>
      )}
      <SiteMap />
    </div>
  );
}
