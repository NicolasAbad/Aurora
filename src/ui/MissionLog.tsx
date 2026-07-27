import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { NARRATIVE_TEXT } from '../data/narrative';

/** UI_SPEC §3.4: "collapsible bottom panel, last entry always visible as one italic
 * line; expands to scrollable feed." Reads straight off GameState.narrative.seen — every
 * beat is appended there the moment its trigger fires (pitch, hire, a certification
 * resolving, etc.), so this component has no logic of its own beyond display + expand. */
export function MissionLog() {
  const seen = useGameStore(useShallow((s) => s.narrative.seen));
  const [expanded, setExpanded] = useState(false);

  if (seen.length === 0) return null; // nothing has happened yet — no empty panel to show

  const lastId = seen[seen.length - 1];

  return (
    <div className="mission-log">
      <button
        type="button"
        className="mission-log__last-entry"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <em>{NARRATIVE_TEXT[lastId]}</em>
      </button>
      {expanded && (
        <div className="mission-log__feed">
          {[...seen].reverse().map((id) => (
            <p key={id} className="mission-log__entry">
              {NARRATIVE_TEXT[id]}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
