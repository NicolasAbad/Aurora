import { useSettings } from '../state/settings';

/**
 * UI_SPEC §1c (Sprint 11, NEW): "v1 sound is synthesized, not sourced" — every sound
 * effect is a plain Web Audio oscillator tone, never a loaded audio file. One shared,
 * lazily-created AudioContext (browsers require a user gesture before audio starts; the
 * Launch button press that triggers these calls always satisfies that). Every call reads
 * `useSettings.getState().soundEnabled` directly rather than being a hook, so call sites
 * (setTimeout-driven countdown ticks, non-component callbacks) don't need to be React
 * components themselves.
 */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

interface ToneOptions {
  freq: number;
  durationMs: number;
  type?: OscillatorType;
  delayMs?: number;
}

function playTone({ freq, durationMs, type = 'sine', delayMs = 0 }: ToneOptions): void {
  if (!useSettings.getState().soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const startAt = ctx.currentTime + delayMs / 1000;
  const durationSec = durationMs / 1000;
  // Short linear attack/release envelope — a hard on/off click audibly pops.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.2, startAt + Math.min(0.01, durationSec / 4));
  gain.gain.linearRampToValueAtTime(0, startAt + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec);
}

/** One per countdown second (UI_SPEC §1c: "a tick/beep on each countdown second"). */
export function playCountdownTick(): void {
  playTone({ freq: 440, durationMs: 90 });
}

/** The liftoff moment (tick 0) — lower and longer than the per-second ticks. */
export function playLiftoffTone(): void {
  playTone({ freq: 660, durationMs: 320 });
}

/** UI_SPEC §1c: "a distinct success chime on a successful launch result." */
export function playSuccessChime(): void {
  playTone({ freq: 660, durationMs: 140 });
  playTone({ freq: 880, durationMs: 240, delayMs: 130 });
}

/** The failure counterpart — a single descending tone, distinct from success's rising pair. */
export function playFailureTone(): void {
  playTone({ freq: 220, durationMs: 450, type: 'sawtooth' });
}
