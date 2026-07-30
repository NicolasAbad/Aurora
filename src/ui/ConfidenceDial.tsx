import { formatPercent } from '../core/format';
import type { ConfidenceBreakdown } from '../core/confidence';

/**
 * UI_SPEC screen 4 (Sprint 10.5, Visual Identity 2.0, NEW): replaces the plain Confidence
 * percentage with a radial gauge — a blueprint-style needle sweeping a 0-100 arc, each
 * formula term rendering as its own colored arc segment that fills in as satisfied. Pure
 * presentational component (takes an already-computed ConfidenceBreakdown) so it has no
 * store access of its own — LaunchSequencePanel's ConfidenceBreakdownView still owns the
 * data and the tap-to-expand numeric breakdown underneath.
 */
const CX = 60;
const CY = 62;
const RADIUS = 50;
const NEEDLE_RADIUS = RADIUS - 8;

function polarToCartesian(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
}

// value 0 -> angle 180 (pointing left); value 100 -> angle 0 (pointing right); the arc
// sweeps over the top, left to right, as the gauge fills.
function angleForValue(value: number): number {
  return 180 - (Math.max(0, Math.min(100, value)) / 100) * 180;
}

function arcPath(fromValue: number, toValue: number): string {
  const fromAngle = angleForValue(fromValue);
  const toAngle = angleForValue(toValue);
  const start = polarToCartesian(fromAngle, RADIUS);
  const end = polarToCartesian(toAngle, RADIUS);
  const largeArcFlag = fromAngle - toAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

interface Term {
  key: string;
  value: number;
  className: string;
}

export function ConfidenceDial({ breakdown }: { breakdown: ConfidenceBreakdown }) {
  // Same term order as the numeric breakdown below it — base is always granted (not a
  // "satisfied condition"), so it renders first and unconditionally; each later term only
  // contributes a segment once its value is actually nonzero (i.e. satisfied).
  const terms: Term[] = [
    { key: 'base', value: breakdown.base, className: 'confidence-dial__segment--base' },
    { key: 'certification', value: breakdown.certification, className: 'confidence-dial__segment--certification' },
    { key: 'flightReview', value: breakdown.flightReview, className: 'confidence-dial__segment--flight-review' },
    { key: 'controllers', value: breakdown.controllers, className: 'confidence-dial__segment--controllers' },
    { key: 'serviceTower', value: breakdown.serviceTower, className: 'confidence-dial__segment--service-tower' },
    { key: 'weather', value: breakdown.weather, className: 'confidence-dial__segment--weather' },
    { key: 'experience', value: breakdown.experience, className: 'confidence-dial__segment--experience' },
  ];

  // Stacked, not overlaid: each satisfied term claims the next slice of the 0-100 arc in
  // formula order, clipped to 100 total — mirrors how `total` itself is capped
  // (core/confidence.ts's Math.min(100, ...)), so the filled arc never overshoots the ring.
  let cursor = 0;
  const segments = terms.flatMap((term) => {
    if (term.value <= 0 || cursor >= 100) return [];
    const from = cursor;
    const to = Math.min(100, cursor + term.value);
    cursor = to;
    return [{ ...term, from, to }];
  });

  const needleAngle = angleForValue(breakdown.total);
  const needleTip = polarToCartesian(needleAngle, NEEDLE_RADIUS);

  return (
    <svg viewBox="0 0 120 72" className="confidence-dial" aria-hidden="true">
      <path className="confidence-dial__track" d={arcPath(0, 100)} />
      {segments.map((seg) => (
        <path key={seg.key} className={`confidence-dial__segment ${seg.className}`} d={arcPath(seg.from, seg.to)} />
      ))}
      <line className="confidence-dial__needle" x1={CX} y1={CY} x2={needleTip.x} y2={needleTip.y} />
      <circle className="confidence-dial__hub" cx={CX} cy={CY} r="4" />
      <text x={CX} y={CY - 18} textAnchor="middle" className="confidence-dial__value">
        {formatPercent(breakdown.total)}
      </text>
    </svg>
  );
}
