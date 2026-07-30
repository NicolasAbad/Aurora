import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { missionLogBase } from '../data/narrative';
import { categorizeLogLine } from '../core/missionLogCategory';
import { RECORD_DEFS } from '../core/records';
import { MissionLogIcon } from './MissionLogIcon';
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
 * line; expands to scrollable feed." UI_SPEC §2f (Sprint 9.5): gained an unread-count
 * badge (entries added since the panel was last opened this session — like the FTUE
 * tooltips' dismiss-set, this is session-local, not persisted to GameState) and generic
 * process completions (T-18/19/20) alongside the flavor-heavy N-* beats, both through the
 * same `missionLogBase` feed (data/narrative.ts) so this component has no logic of its
 * own beyond display + expand + the unread count. UI_SPEC §8: "Records board lives as a
 * tab inside this panel." */
export function MissionLog() {
  const narrative = useGameStore(useShallow((s) => s.narrative));
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>('log');
  const feed = missionLogBase(narrative);
  const [lastReadCount, setLastReadCount] = useState(feed.length);

  if (feed.length === 0) return null; // nothing has happened yet — no empty panel to show

  const unreadCount = Math.max(0, feed.length - lastReadCount);

  function toggle() {
    setExpanded((e) => {
      const next = !e;
      if (next) setLastReadCount(feed.length); // opening clears the badge
      return next;
    });
  }

  return (
    <div className="mission-log">
      <button
        type="button"
        className="mission-log__last-entry"
        onClick={toggle}
        aria-expanded={expanded}
      >
        <span className="mission-log__last-entry-text">
          <MissionLogIcon category={categorizeLogLine(feed[feed.length - 1])} />
          <em>{feed[feed.length - 1]}</em>
        </span>
        {!expanded && unreadCount > 0 && <span className="mission-log__badge">{unreadCount}</span>}
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
              {[...feed].reverse().map((text, i) => (
                <p key={`${feed.length - i}-${text}`} className="mission-log__entry">
                  <MissionLogIcon category={categorizeLogLine(text)} />
                  {text}
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
