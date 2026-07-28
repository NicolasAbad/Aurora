import { create } from 'zustand';

// UI_SPEC §6 (Settings screen): sound on/off, reduced motion. Deliberately a SEPARATE
// localStorage key from the main save (SAVE_KEY) — these are presentation preferences,
// not GameState/economy data, and shouldn't round-trip through save export/import or
// bloat the save schema (rule 5's "no schema change without a real reason"). Same
// "small store outside GameState" shape as state/devTools.ts's useDevTools, but
// PERSISTED (a player's sound/motion preference should survive a reload, unlike the
// dev-only time-warp which deliberately resets every session).
const SETTINGS_KEY = 'aurora-program-settings';

export interface UserSettings {
  soundEnabled: boolean;
  reducedMotion: boolean;
}

const DEFAULT_SETTINGS: UserSettings = { soundEnabled: true, reducedMotion: false };

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: UserSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

interface SettingsStore extends UserSettings {
  setSoundEnabled: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
}

export const useSettings = create<SettingsStore>()((set, get) => ({
  ...loadSettings(),
  setSoundEnabled: (soundEnabled) => {
    persistSettings({ soundEnabled, reducedMotion: get().reducedMotion });
    set({ soundEnabled });
  },
  setReducedMotion: (reducedMotion) => {
    persistSettings({ soundEnabled: get().soundEnabled, reducedMotion });
    set({ reducedMotion });
  },
}));
