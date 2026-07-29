import { create } from 'zustand';

// CLAUDE.md rule 11: dev-only, excluded from production builds. This store itself is
// harmless to ship (it's just a number), but nothing ever reads or renders it in
// production — every call site is gated behind `__DEV_TOOLS__` (a build-time constant,
// see vite.config.ts), so `if (__DEV_TOOLS__) {...}` becomes dead code a production
// build's minifier strips. Without this, multi-hour timers (Sprint 4+) are untestable.
// SPRINTS.md Sprint 9.5 task 8: ×5 added for the owner's own manual playtesting sessions
// (fast enough to skip dead air, slow enough to still feel the game's real pacing —
// ×60/×600 are for verifying timer math, not for playing).
export type TimeWarpMultiplier = 1 | 5 | 60 | 600;

interface DevToolsStore {
  timeWarp: TimeWarpMultiplier;
  setTimeWarp: (multiplier: TimeWarpMultiplier) => void;
}

export const useDevTools = create<DevToolsStore>()((set) => ({
  timeWarp: 1,
  setTimeWarp: (timeWarp) => set({ timeWarp }),
}));
