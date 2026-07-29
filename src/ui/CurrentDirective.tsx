import { useGameStore } from '../state/persistStore';
import { currentDirective } from '../core/directive';
import { narrativeText } from '../data/narrative';

/** UI_SPEC §2h (Sprint 9.5, NEW): persistent "what now" indicator near the ticker — no
 * dismiss button, just changes live as game state changes (core/directive.ts). */
export function CurrentDirective() {
  const id = useGameStore(currentDirective);
  if (!id) return null;
  return (
    <div className="current-directive">
      <span className="current-directive__label">Next</span>
      <span className="current-directive__text">{narrativeText(id)}</span>
    </div>
  );
}
