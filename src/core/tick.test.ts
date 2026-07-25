import { describe, expect, it } from 'vitest';
import { createGameLoop } from './tick';

// Deterministic fake clock: requestFrame stores the callback instead of scheduling it;
// tick(time) runs it once (clearing it first, since running it re-schedules for "next frame").
function createFakeClock() {
  let pending: ((t: number) => void) | null = null;
  return {
    requestFrame: (cb: (t: number) => void) => {
      pending = cb;
      return 1;
    },
    cancelFrame: () => {
      pending = null;
    },
    tick(time: number) {
      const cb = pending;
      pending = null;
      cb?.(time);
    },
  };
}

describe('createGameLoop', () => {
  it('does not call onTick on the first frame (no prior timestamp to diff against)', () => {
    const clock = createFakeClock();
    const deltas: number[] = [];
    const loop = createGameLoop((d) => deltas.push(d), clock);
    loop.start();
    clock.tick(1000);
    expect(deltas).toEqual([]);
  });

  it('computes delta as now - lastFrameTime, never an accumulated counter', () => {
    const clock = createFakeClock();
    const deltas: number[] = [];
    const loop = createGameLoop((d) => deltas.push(d), clock);
    loop.start();
    clock.tick(1000);
    clock.tick(1016);
    expect(deltas).toEqual([16]);
    // A large gap (e.g. a backgrounded tab) produces ONE big delta, not a backlog of
    // small catch-up ticks.
    clock.tick(1500);
    expect(deltas).toEqual([16, 484]);
  });

  it('stop() cancels the pending frame so no further ticks fire', () => {
    const clock = createFakeClock();
    const deltas: number[] = [];
    const loop = createGameLoop((d) => deltas.push(d), clock);
    loop.start();
    clock.tick(0);
    clock.tick(16);
    loop.stop();
    clock.tick(1000); // nothing pending; this is a no-op
    expect(deltas).toEqual([16]);
  });

  it('start() is idempotent while already running', () => {
    const clock = createFakeClock();
    let calls = 0;
    const loop = createGameLoop(() => {
      calls++;
    }, clock);
    loop.start();
    loop.start();
    clock.tick(0);
    clock.tick(16);
    expect(calls).toBe(1);
  });

  it('restarting after stop() begins a fresh delta baseline', () => {
    const clock = createFakeClock();
    const deltas: number[] = [];
    const loop = createGameLoop((d) => deltas.push(d), clock);
    loop.start();
    clock.tick(0);
    clock.tick(16);
    loop.stop();
    loop.start();
    clock.tick(500); // first frame after restart: no delta yet
    clock.tick(516);
    expect(deltas).toEqual([16, 16]);
  });
});
