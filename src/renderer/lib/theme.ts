/** Theme engine — applies CSS custom properties to :root */

export type ThemeMode = 'dark' | 'light' | 'focus' | 'zen';
export type AccentColor = 'red' | 'blue' | 'green' | 'purple' | 'orange' | 'teal';
export type AccentSaturation = 'vibrant' | 'default' | 'muted' | 'subtle' | 'mono';

interface ThemeColors {
  'bg-primary': string;
  'bg-secondary': string;
  'bg-tertiary': string;
  'bg-hover': string;
  'bg-active': string;
  'bg-input': string;
  'text-primary': string;
  'text-secondary': string;
  'text-tertiary': string;
  'border-primary': string;
  'border-secondary': string;
  'scrollbar': string;
  'scrollbar-hover': string;
}

export const accents: Record<AccentColor, { base: string; hover: string; subtle: string }> = {
  red:    { base: '#dc4c3e', hover: '#c53727', subtle: 'rgba(220,76,62,0.15)' },
  blue:   { base: '#4a9eff', hover: '#3182ce', subtle: 'rgba(74,158,255,0.15)' },
  green:  { base: '#4caf50', hover: '#388e3c', subtle: 'rgba(76,175,80,0.15)' },
  purple: { base: '#9c7cff', hover: '#7c5ce0', subtle: 'rgba(156,124,255,0.15)' },
  orange: { base: '#ff8c42', hover: '#e67329', subtle: 'rgba(255,140,66,0.15)' },
  teal:   { base: '#26a69a', hover: '#1d8a80', subtle: 'rgba(38,166,154,0.15)' },
};

const themes: Record<ThemeMode, ThemeColors> = {
  dark: {
    'bg-primary': '#1e1e1e', 'bg-secondary': '#252525', 'bg-tertiary': '#2d2d2d',
    'bg-hover': '#363636', 'bg-active': '#404040', 'bg-input': '#333333',
    'text-primary': '#e8e8e8', 'text-secondary': '#a0a0a0', 'text-tertiary': '#6b6b6b',
    'border-primary': '#3a3a3a', 'border-secondary': '#2d2d2d',
    'scrollbar': '#4a4a4a', 'scrollbar-hover': '#5a5a5a',
  },
  light: {
    'bg-primary': '#ffffff', 'bg-secondary': '#f7f7f7', 'bg-tertiary': '#eeeeee',
    'bg-hover': '#e8e8e8', 'bg-active': '#dcdcdc', 'bg-input': '#f0f0f0',
    'text-primary': '#1a1a1a', 'text-secondary': '#555555', 'text-tertiary': '#999999',
    'border-primary': '#e0e0e0', 'border-secondary': '#ebebeb',
    'scrollbar': '#cccccc', 'scrollbar-hover': '#b0b0b0',
  },
  focus: {
    'bg-primary': '#0e0e0e', 'bg-secondary': '#141414', 'bg-tertiary': '#1c1c1c',
    'bg-hover': '#242424', 'bg-active': '#2a2a2a', 'bg-input': '#1c1c1c',
    'text-primary': '#e4e4e4', 'text-secondary': '#969696', 'text-tertiary': '#5c5c5c',
    'border-primary': '#222222', 'border-secondary': '#1a1a1a',
    'scrollbar': '#303030', 'scrollbar-hover': '#404040',
  },
  zen: {
    'bg-primary': '#1a1914', 'bg-secondary': '#201f19', 'bg-tertiary': '#28261f',
    'bg-hover': '#302e26', 'bg-active': '#38362d', 'bg-input': '#28261f',
    'text-primary': '#c8c0ae', 'text-secondary': '#8a8272', 'text-tertiary': '#5c5647',
    'border-primary': '#2e2c24', 'border-secondary': '#26241d',
    'scrollbar': '#3a3830', 'scrollbar-hover': '#4a4840',
  },
};

// ── Color utilities ──

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  h /= 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastText(hex: string): string {
  return luminance(hex) > 0.4 ? '#111111' : '#ffffff';
}

const saturationMultipliers: Record<AccentSaturation, number> = {
  vibrant: 1.25, default: 1.0, muted: 0.6, subtle: 0.3, mono: 0,
};

function adjustSaturation(hex: string, sat: AccentSaturation): string {
  if (sat === 'default') return hex;
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(1, s * saturationMultipliers[sat]), l);
}

function adjustRgbaSaturation(rgba: string, sat: AccentSaturation): string {
  if (sat === 'default') return rgba;
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
  if (!m) return rgba;
  const hex = `#${(+m[1]).toString(16).padStart(2, '0')}${(+m[2]).toString(16).padStart(2, '0')}${(+m[3]).toString(16).padStart(2, '0')}`;
  const adj = adjustSaturation(hex, sat);
  const r = parseInt(adj.slice(1, 3), 16);
  const g = parseInt(adj.slice(3, 5), 16);
  const b = parseInt(adj.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${m[4] ?? '1'})`;
}

// ── Apply ──

export function applyTheme(
  mode: ThemeMode,
  accent: AccentColor,
  accentOverride: boolean,
  saturation: AccentSaturation = 'default',
): void {
  const colors = themes[mode];
  const a = accents[accent];
  const root = document.documentElement;

  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(`--color-${key}`, value);
  }

  let accentColor = adjustSaturation(a.base, saturation);
  root.style.setProperty('--color-accent', accentColor);
  root.style.setProperty('--color-accent-hover', adjustSaturation(a.hover, saturation));
  root.style.setProperty('--color-accent-subtle', adjustRgbaSaturation(a.subtle, saturation));

  if (mode === 'focus' && !accentOverride) {
    accentColor = '#e8e8e8';
    root.style.setProperty('--color-accent', accentColor);
    root.style.setProperty('--color-accent-hover', '#d0d0d0');
    root.style.setProperty('--color-accent-subtle', 'rgba(255,255,255,0.10)');
  }
  if (mode === 'zen' && !accentOverride) {
    accentColor = adjustSaturation('#b0a080', saturation);
    root.style.setProperty('--color-accent', accentColor);
    root.style.setProperty('--color-accent-hover', adjustSaturation('#968862', saturation));
    root.style.setProperty('--color-accent-subtle', adjustRgbaSaturation('rgba(176,160,128,0.12)', saturation));
  }

  root.style.setProperty('--color-accent-text', contrastText(accentColor));
  root.dataset.muted = (mode === 'focus' || mode === 'zen') ? 'true' : 'false';
}

/** Apply theme on app start — reads persisted preferences or falls back to defaults */
export function initTheme(): void {
  let mode: ThemeMode = 'dark';
  let accent: AccentColor = 'red';
  let saturation: AccentSaturation = 'default';
  try {
    const m = localStorage.getItem('pref:themeMode');
    if (m) mode = JSON.parse(m);
    const a = localStorage.getItem('pref:accentColor');
    if (a) accent = JSON.parse(a);
    const s = localStorage.getItem('pref:accentSaturation');
    if (s) saturation = JSON.parse(s);
  } catch { /* use defaults */ }
  applyTheme(mode, accent, false, saturation);
}
