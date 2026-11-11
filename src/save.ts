/**
 * BLOOM DIVE — persistent save (settings + hi-score) in localStorage.
 * Every storage access is guarded: private mode / disabled storage / quota errors
 * degrade to an in-memory store and never throw.
 */
import type { SaveStore, Settings } from './core/types';

const KEY = 'bloomdive.v1';
const MAX_SCORE = 999_999_999;

interface SaveFile {
  v: 1;
  settings: Settings;
  hiScore: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  muted: false,
  slowMode: false,
  sensitivity: 1,
  quality: 'auto',
});

function clampNum(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Coerce anything into a valid Settings object (unknown/invalid fields fall back to defaults). */
export function sanitizeSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const q = o.quality;
  return {
    muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_SETTINGS.muted,
    slowMode: typeof o.slowMode === 'boolean' ? o.slowMode : DEFAULT_SETTINGS.slowMode,
    sensitivity: Math.round(clampNum(o.sensitivity, 0.5, 2, 1) * 100) / 100,
    quality: q === 'low' || q === 'high' || q === 'auto' ? q : DEFAULT_SETTINGS.quality,
  };
}

function getStorage(): Storage | null {
  try {
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function load(): SaveFile {
  const fallback: SaveFile = { v: 1, settings: { ...DEFAULT_SETTINGS }, hiScore: 0 };
  try {
    const raw = getStorage()?.getItem(KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return fallback;
    return {
      v: 1,
      settings: sanitizeSettings(o.settings),
      hiScore: Math.floor(clampNum(o.hiScore, 0, MAX_SCORE, 0)),
    };
  } catch {
    return fallback;
  }
}

export function createSaveStore(): SaveStore {
  const data = load();
  // Keep a single mutable settings object: callers mutate it, then call saveSettings().
  const settings: Settings = data.settings;
  let hiScore = data.hiScore;

  const persist = () => {
    try {
      const file: SaveFile = { v: 1, settings: sanitizeSettings(settings), hiScore };
      getStorage()?.setItem(KEY, JSON.stringify(file));
    } catch {
      /* storage unavailable or full: keep running in memory */
    }
  };

  return {
    settings,
    get hiScore() {
      return hiScore;
    },
    submitScore(score: number): boolean {
      const s = Math.floor(clampNum(score, 0, MAX_SCORE, 0));
      if (s > hiScore) {
        hiScore = s;
        persist();
        return true;
      }
      return false;
    },
    saveSettings() {
      // Re-validate in place so a bad mutation can't persist garbage.
      Object.assign(settings, sanitizeSettings(settings));
      persist();
    },
  };
}
