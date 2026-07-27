import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { NARRATIVE_TEXT } from '../data/narrative';
import { RECORD_DEFS } from '../core/records';
import type { RecordId } from '../core/types';

// ECONOMY §8b's own table order (first ignition -> first flight -> Kármán -> orbit ->
// customer -> delivery) — the arc's natural sequence, not RECORD_DEFS' object-key order.
const RECORD_ORDER: RecordId[] = [
  'firstIgnition',
  'firstFlight',
  'pastKarman',
  'firstOrbit',
  'firstCustomer',
  'firstDelivery',
];

/** UI_SPEC §2b: "earned records show fully; unearned ones render as dimmed unnamed
 * placeholders ('———') — countable, not readable." */
function RecordsBoard() {
  const records = useGameStore(useShallow((s) => s.records));
  return (
    <div className="mission-log__records">
      {RECORD_ORDER.map((id) => {
        const earned = records.includes(id);
        return (
          <div key={id} className={`mission-log__record ${earned ? 'mission-log__record--earned' : ''}`}>
            {earned ? RECORD_DEFS[id].name : '———'}
          </div>
        );
      })}
    </div>
  );
}

type Tab = 'log' | 'records';

/** UI_SPEC §3.4: "collapsible bottom panel, last entry always visible as one italic
 * line; expands to scrollable feed." Reads straight off GameState.narrative.seen — every
 * beat is appended there the moment its trigger fires (pitch, hire, a certification
 * resolving, etc.), so this component has no logic of its own beyond display + expand.
 * UI_SPEC §8: "Records board lives as a tab inside this panel." */
export function MissionLog() {
  const seen = useGameStore(useShallow((s) => s.narrative.seen));
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>('log');

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
        <div className="mission-log__panel">
          <div className="mission-log__tabs">
            <button
              type="button"
              className={`mission-log__tab ${tab === 'log' ? 'mission-log__tab--active' : ''}`}
              onClick={() => setTab('log')}
            >
              Log
            </button>
            <button
              type="button"
              className={`mission-log__tab ${tab === 'records' ? 'mission-log__tab--active' : ''}`}
              onClick={() => setTab('records')}
            >
              Records
            </button>
          </div>
          {tab === 'log' ? (
            <div className="mission-log__feed">
              {[...seen].reverse().map((id) => (
                <p key={id} className="mission-log__entry">
                  {NARRATIVE_TEXT[id]}
                </p>
              ))}
            </div>
          ) : (
            <RecordsBoard />
          )}
        </div>
      )}
    </div>
  );
}
