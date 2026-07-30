import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '../state/persistStore';
import { satelliteLaunches } from '../core/auroraMission';
import type { ContractOffer, LaunchRecord } from '../core/types';

// Deterministic spiral layout (golden-angle placement, radius grows with each dot) — an
// arbitrary number of dots always fits with no overlap, no need to pre-size a fixed grid.
const GOLDEN_ANGLE_DEG = 137.5;
const EARTH_RADIUS = 30;
const DOT_START_RADIUS = 44;
const DOT_RADIUS_STEP = 7;
const MARGIN = 20;

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

function missionLabel(launch: LaunchRecord, offers: ContractOffer[]): string {
  if (launch.missionType === 'auroraI') return 'Aurora I';
  if (launch.missionType === 'auroraII') return 'Aurora II';
  const offer = launch.contractId ? offers.find((o) => o.id === launch.contractId) : undefined;
  return offer ? `${offer.client} (Tier ${offer.tier})` : 'Contract fulfilled';
}

interface ConstellationViewProps {
  onClose: () => void;
}

/**
 * UI_SPEC §2i (Sprint 10.5, Visual Identity 2.0, NEW): Earth-centered visual, one
 * permanent dot per successful satellite mission (Aurora I, Aurora II, fulfilled
 * contracts — core/auroraMission.ts's satelliteLaunches), tappable for mission detail.
 * Reached from the Tracking Station tile and a small ticker-area icon+count (both in
 * App.tsx/Ticker.tsx) once at least one dot exists.
 */
export function ConstellationView({ onClose }: ConstellationViewProps) {
  const launches = useGameStore(useShallow((s) => s.mission.launches));
  const offers = useGameStore(useShallow((s) => s.contracts.offers));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dots = satelliteLaunches(launches);
  const half = Math.max(120, DOT_START_RADIUS + dots.length * DOT_RADIUS_STEP + MARGIN);
  const size = half * 2;
  const selected = dots.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="constellation-backdrop" onClick={onClose}>
      <div
        className="constellation-screen"
        role="dialog"
        aria-label="Constellation View"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="constellation-screen__header">
          <h2>Constellation View</h2>
          <button type="button" onClick={onClose} aria-label="Close constellation view">
            ×
          </button>
        </div>
        {dots.length === 0 ? (
          <p className="constellation-screen__empty">
            No successful missions yet — this fills in as Aurora I, Aurora II, and fulfilled contracts reach orbit.
          </p>
        ) : (
          <>
            <svg viewBox={`0 0 ${size} ${size}`} className="constellation-view" role="img" aria-label="Orbital constellation">
              <circle className="constellation-view__earth" cx={half} cy={half} r={EARTH_RADIUS} />
              <ellipse
                className="constellation-view__earth-line"
                cx={half}
                cy={half}
                rx={EARTH_RADIUS}
                ry={EARTH_RADIUS * 0.35}
              />
              <line
                className="constellation-view__earth-line"
                x1={half}
                y1={half - EARTH_RADIUS}
                x2={half}
                y2={half + EARTH_RADIUS}
              />
              {dots.map((launch, i) => {
                const radius = DOT_START_RADIUS + i * DOT_RADIUS_STEP;
                const angle = (i * GOLDEN_ANGLE_DEG * Math.PI) / 180;
                const x = half + radius * Math.cos(angle);
                const y = half + radius * Math.sin(angle);
                const label = missionLabel(launch, offers);
                return (
                  <circle
                    key={launch.id}
                    className={`constellation-view__dot${selectedId === launch.id ? ' constellation-view__dot--selected' : ''}`}
                    cx={x}
                    cy={y}
                    r="4"
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    onClick={() => setSelectedId(launch.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedId(launch.id);
                    }}
                  />
                );
              })}
            </svg>
            <div className="constellation-screen__count">
              {dots.length} successful mission{dots.length === 1 ? '' : 's'} in orbit
            </div>
            {selected && (
              <div className="constellation-screen__detail">
                <div className="constellation-screen__detail-title">{missionLabel(selected, offers)}</div>
                <div className="constellation-screen__detail-time">{formatTimestamp(selected.timestamp)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
