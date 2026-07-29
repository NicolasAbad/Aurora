import { useDevTools, type TimeWarpMultiplier } from '../state/devTools';

const OPTIONS: TimeWarpMultiplier[] = [1, 5, 60, 600];

// CLAUDE.md rule 11: render this only behind `__DEV_TOOLS__` at the call site (App.tsx)
// — this component itself doesn't gate anything, the caller decides whether to mount it.
export function TimeWarpControl() {
  const timeWarp = useDevTools((s) => s.timeWarp);
  const setTimeWarp = useDevTools((s) => s.setTimeWarp);

  return (
    <div className="time-warp-control">
      <span className="time-warp-control__label">Time warp (dev)</span>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={
            option === timeWarp ? 'time-warp-control__option time-warp-control__option--active' : 'time-warp-control__option'
          }
          onClick={() => setTimeWarp(option)}
        >
          ×{option}
        </button>
      ))}
    </div>
  );
}
