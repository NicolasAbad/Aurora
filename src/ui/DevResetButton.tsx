import { hardResetSave } from '../state/persistStore';

// Sprint 3.5 (owner manual-play finding): a fast way to wipe the save while manually
// testing, without waiting for Sprint 8's real hard-reset UI. CLAUDE.md rule 11: render
// this only behind `__DEV_TOOLS__` at the call site (App.tsx) — mirrors TimeWarpControl.
export function DevResetButton() {
  function handleClick() {
    if (!window.confirm('Reset save and reload?')) return;
    hardResetSave();
  }

  return (
    <button type="button" className="dev-reset-button" onClick={handleClick}>
      Reset save (dev)
    </button>
  );
}
