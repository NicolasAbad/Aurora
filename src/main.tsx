import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createGameLoop } from './core/tick';
import { startAutosave, useGameStore } from './state/persistStore';
import { useDevTools } from './state/devTools';
import './index.css';

startAutosave();
// Time-warp (CLAUDE.md rule 11, dev-only): the multiplier is passed through to
// applyTick, which needs both the real deltaMs and the warp factor separately (it
// scales the economy delta directly, but shifts process timestamps by the warp
// *bonus* — see persistStore.ts). core/tick.ts itself just measures real time and
// stays unaware the warp concept exists. In a production build `__DEV_TOOLS__` inlines
// to `false`, so this collapses to warp = 1 (no-op) always.
createGameLoop((deltaMs) => {
  const warp = __DEV_TOOLS__ ? useDevTools.getState().timeWarp : 1;
  useGameStore.getState().applyTick(deltaMs, warp);
}).start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
