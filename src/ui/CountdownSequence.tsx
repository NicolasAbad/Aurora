import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../state/settings';
import { narrativeText } from '../data/narrative';
import { playCountdownTick, playLiftoffTone } from './sound';

// Plain mechanical status readouts — NOT narrative-ID-routed content (rule 9's own
// carve-out for mechanical/UI microcopy, same category ChecklistLabels/
// BuildingDef.description already occupy), since no reusable "every launch" narrative
// text exists in NARRATIVE_EVENTS.md — only N-10, scoped to Aurora I's first-ever
// countdown specifically (see CountdownSequence's own `narrativeId` prop below).
const TECHNICAL_READOUTS = [
  'Engines: nominal',
  'Guidance: locked',
  'Telemetry: green',
  'Propellant: pressurized',
  'Range: clear',
];

const TICK_MS = 1000;
const LIFTOFF_HOLD_MS = 1500;
const PARTICLE_COUNT = 40;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
}

/** UI_SPEC §1b item 4: "ONE particle moment... ONLY during countdown and liftoff." Plain
 * canvas + requestAnimationFrame, no library — smoke/exhaust puffs drifting up and out
 * from a fixed origin, fading over ~1-1.5s. */
function ParticleBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height } = canvas;
    const originX = width / 2;
    const originY = height * 0.85;
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: originX,
      y: originY,
      vx: (Math.random() - 0.5) * 70,
      vy: -Math.random() * 45 - 15,
      life: 0,
      maxLife: 900 + Math.random() * 500,
      radius: 2 + Math.random() * 3,
    }));

    let raf = 0;
    let last = performance.now();
    function frame(now: number) {
      const dt = now - last;
      last = now;
      ctx!.clearRect(0, 0, width, height);
      let anyAlive = false;
      for (const p of particles) {
        p.life += dt;
        if (p.life >= p.maxLife) continue;
        anyAlive = true;
        p.x += (p.vx * dt) / 1000;
        p.y += (p.vy * dt) / 1000 + (dt / 1000) * 25; // gentle drag — smoke settles, doesn't just fly off
        const t = p.life / p.maxLife;
        ctx!.globalAlpha = Math.max(0, 1 - t);
        ctx!.fillStyle = '#8b909a';
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius * (1 + t), 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      if (anyAlive) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} width={280} height={180} className="countdown-sequence__particles" aria-hidden="true" />;
}

interface CountdownSequenceProps {
  /** Set only for Aurora I's literal first-ever launch attempt — reuses N-10 verbatim
   * (NARRATIVE_EVENTS §1) for the whole sequence instead of the generic technical
   * readouts. See LaunchSequencePanel's call site for the exact trigger condition. */
  narrativeId?: string;
  onComplete: () => void;
}

/**
 * UI_SPEC screen 5 / §1b (Sprint 11, NEW — deferred from Sprint 9's own LaunchSequencePanel
 * comment): the full-screen 10→0 countdown takeover. Generic over `onComplete` so both
 * LaunchSequencePanel (Aurora/contract pads) and SoundingMissionPanel (sounding rockets)
 * share it — same reuse pattern RocketBlueprint/WeatherRadarSweep already established.
 * The actual mission outcome is already decided (rule 12: committedRoll drawn at
 * checklist completion) — this is a pure dramatic-reveal delay with no economy stakes,
 * so it's plain component state/timers, not a persisted Process.
 */
export function CountdownSequence({ narrativeId, onComplete }: CountdownSequenceProps) {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const [count, setCount] = useState(10);
  const [liftoff, setLiftoff] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    // Reduced motion must skip the flourish AND the wait, not just the visuals.
    if (reducedMotion) {
      onCompleteRef.current();
      return;
    }
    if (count > 0) {
      playCountdownTick();
      const t = setTimeout(() => setCount((c) => c - 1), TICK_MS);
      return () => clearTimeout(t);
    }
    playLiftoffTone();
    setLiftoff(true);
    const t = setTimeout(() => onCompleteRef.current(), LIFTOFF_HOLD_MS);
    return () => clearTimeout(t);
  }, [count, reducedMotion]);

  if (reducedMotion) return null;

  const readoutIndex = Math.min(TECHNICAL_READOUTS.length - 1, Math.floor((10 - count) / 2));
  const caption = narrativeId ? narrativeText(narrativeId) : liftoff ? 'LIFTOFF' : TECHNICAL_READOUTS[readoutIndex];

  return (
    <div className="countdown-sequence" role="status" aria-live="polite">
      <div key={count} className="countdown-sequence__digit">
        {count}
      </div>
      <div className="countdown-sequence__caption">{caption}</div>
      {liftoff && <ParticleBurst />}
    </div>
  );
}
