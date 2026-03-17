import { atom } from 'jotai';
import { applyTheme } from '../lib/theme';
import type { ThemeMode, AccentColor, AccentSaturation } from '../lib/theme';

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

function persist<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export const themeModeAtom = atom<ThemeMode>(stored('pref:themeMode', 'dark'));
export const accentColorAtom = atom<AccentColor>(stored('pref:accentColor', 'red'));
export const accentSaturationAtom = atom<AccentSaturation>(stored('pref:accentSaturation', 'default'));
export const accentOverrideAtom = atom<boolean>(false);

/** Write-only atom: set theme mode and apply + persist */
export const setThemeModeAtom = atom(null, (get, set, mode: ThemeMode) => {
  set(themeModeAtom, mode);
  set(accentOverrideAtom, false);
  persist('pref:themeMode', mode);
  applyTheme(mode, get(accentColorAtom), false, get(accentSaturationAtom));
});

/** Write-only atom: set accent color and apply + persist */
export const setAccentColorAtom = atom(null, (get, set, accent: AccentColor) => {
  const mode = get(themeModeAtom);
  const isOverride = mode === 'focus' || mode === 'zen';
  set(accentColorAtom, accent);
  set(accentOverrideAtom, isOverride);
  persist('pref:accentColor', accent);
  applyTheme(mode, accent, isOverride, get(accentSaturationAtom));
});

/** Write-only atom: set saturation level and apply + persist */
export const setAccentSaturationAtom = atom(null, (get, set, saturation: AccentSaturation) => {
  set(accentSaturationAtom, saturation);
  persist('pref:accentSaturation', saturation);
  applyTheme(get(themeModeAtom), get(accentColorAtom), get(accentOverrideAtom), saturation);
});

// Re-export types for convenience
export type { ThemeMode, AccentColor, AccentSaturation };
