import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createGameLoop } from './core/tick';
import { startAutosave, useGameStore } from './state/persistStore';
import { useDevTools } from './state/devTools';
import './index.css';

startAutosave();
// Time-warp (CLAUDE.md rule 11, dev-only): the multiplier is applied here, at the
// callback that turns real elapsed frame time into simulated deltaMs — core/tick.ts
// itself just measures real time and stays unaware the warp concept exists. In a
// production build `__DEV_TOOLS__` inlines to `false`, so this collapses to `* 1`.
createGameLoop((deltaMs) => {
  const warp = __DEV_TOOLS__ ? useDevTools.getState().timeWarp : 1;
  useGameStore.getState().applyTick(deltaMs * warp);
}).start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
