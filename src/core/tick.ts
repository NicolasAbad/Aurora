export interface GameLoopHandle {
  start: () => void;
  stop: () => void;
}

interface GameLoopDeps {
  requestFrame: (cb: (time: number) => void) => number;
  cancelFrame: (handle: number) => void;
}

const browserDeps: GameLoopDeps = {
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

/**
 * Drives `onTick(deltaMs)` once per animation frame. Delta is always `now -
 * lastFrameTime` (CLAUDE.md rule 6: never an accumulating counter), so a dropped frame
 * or a backgrounded tab just produces one bigger delta on the next frame — never a
 * backlog of small ticks to catch up on.
 */
export function createGameLoop(
  onTick: (deltaMs: number) => void,
  deps: GameLoopDeps = browserDeps,
): GameLoopHandle {
  let frameHandle: number | null = null;
  let lastFrameTime: number | null = null;

  function frame(time: number): void {
    if (lastFrameTime !== null) {
      onTick(time - lastFrameTime);
    }
    lastFrameTime = time;
    frameHandle = deps.requestFrame(frame);
  }

  return {
    start(): void {
      if (frameHandle !== null) return; // already running
      lastFrameTime = null;
      frameHandle = deps.requestFrame(frame);
    },
    stop(): void {
      if (frameHandle !== null) deps.cancelFrame(frameHandle);
      frameHandle = null;
      lastFrameTime = null;
    },
  };
}
