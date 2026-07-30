import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from '../state/settings';
import { playCountdownTick, playFailureTone, playLiftoffTone, playSuccessChime } from './sound';

// jsdom provides no real AudioContext — every playX function must degrade silently
// (never throw) when Web Audio simply isn't available, same as any other environment
// lacking it (older browsers, some headless test runners).
describe('sound.ts — no AudioContext available (jsdom default)', () => {
  it('never throws for any of the exported sound cues', () => {
    expect(() => playCountdownTick()).not.toThrow();
    expect(() => playLiftoffTone()).not.toThrow();
    expect(() => playSuccessChime()).not.toThrow();
    expect(() => playFailureTone()).not.toThrow();
  });
});

// A minimal fake AudioContext so the soundEnabled gate itself can be verified without
// needing a real browser audio stack. `sound.ts` caches ONE AudioContext at module scope
// on first successful construction, so the "disabled" case must run first in this
// describe block — soundEnabled=false short-circuits before that construction ever
// happens (verified via a plain constructor counter, not an unrelated fresh instance).
let constructorCalls = 0;
class FakeOscillator {
  type = 'sine';
  frequency = { value: 0 };
  connect = () => {};
  start = () => {};
  stop = () => {};
}
class FakeGain {
  gain = { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} };
  connect = () => {};
}
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  constructor() {
    constructorCalls++;
  }
  createOscillator = () => new FakeOscillator();
  createGain = () => new FakeGain();
  resume = () => {};
}

describe('sound.ts — soundEnabled gating (fake AudioContext)', () => {
  const originalSoundEnabled = useSettings.getState().soundEnabled;

  beforeEach(() => {
    // @ts-expect-error test-only global stub
    globalThis.AudioContext = FakeAudioContext;
  });

  afterEach(() => {
    // @ts-expect-error test-only global stub
    delete globalThis.AudioContext;
    useSettings.setState({ soundEnabled: originalSoundEnabled });
  });

  it('never constructs an AudioContext when soundEnabled is false', () => {
    useSettings.setState({ soundEnabled: false });
    constructorCalls = 0;
    playCountdownTick();
    expect(constructorCalls).toBe(0);
  });

  it('plays a tone without throwing when soundEnabled is true', () => {
    useSettings.setState({ soundEnabled: true });
    expect(() => playSuccessChime()).not.toThrow();
  });
});
