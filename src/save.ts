/**
 * BLOOM DIVE — persistent save (settings + hi-scores per mode) in localStorage.
 * File v1 stays readable both ways: `hiScore` keeps the NORMAL record (older builds read it),
 * `hiScores` holds one record per mode. An old file's `hiScore` migrates to NORMAL.
 * Every storage access is guarded: private mode / disabled storage / quota errors
 * degrade to an in-memory store and never throw.
 */
import type { GameMode, SaveStore, Settings } from './core/types';

const KEY = 'bloomdive.v1';
const MAX_SCORE = 999_999_999;

type HiScores = Record<GameMode, number>;

interface SaveFile {
  v: 1;
  settings: Settings;
  /** NORMAL record (kept for older builds). */
  hiScore: number;
  hiScores: HiScores;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  muted: false,
  slowMode: false,
  sensitivity: 1,
  quality: 'auto',
  mode: 'normal',
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
    mode: o.mode === 'hard' || o.mode === 'normal' ? o.mode : DEFAULT_SETTINGS.mode,
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
  const fallback: SaveFile = { v: 1, settings: { ...DEFAULT_SETTINGS }, hiScore: 0, hiScores: { normal: 0, hard: 0 } };
  try {
    const raw = getStorage()?.getItem(KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return fallback;
    const score = (v: unknown) => Math.floor(clampNum(v, 0, MAX_SCORE, 0));
    const hs = (o.hiScores && typeof o.hiScores === 'object' ? o.hiScores : {}) as Record<string, unknown>;
    // Migration: the single pre-mode hi-score is the NORMAL record.
    const normal = Math.max(score(o.hiScore), score(hs.normal));
    return {
      v: 1,
      settings: sanitizeSettings(o.settings),
      hiScore: normal,
      hiScores: { normal, hard: score(hs.hard) },
    };
  } catch {
    return fallback;
  }
}

export function createSaveStore(): SaveStore {
  const data = load();
  // Keep a single mutable settings object: callers mutate it, then call saveSettings().
  const settings: Settings = data.settings;
  const hi: HiScores = { ...data.hiScores };

  const persist = () => {
    try {
      const file: SaveFile = { v: 1, settings: sanitizeSettings(settings), hiScore: hi.normal, hiScores: { ...hi } };
      getStorage()?.setItem(KEY, JSON.stringify(file));
    } catch {
      /* storage unavailable or full: keep running in memory */
    }
  };

  return {
    settings,
    get hiScore() {
      return hi[settings.mode] ?? 0;
    },
    hiScoreFor(mode: GameMode): number {
      return hi[mode] ?? 0;
    },
    submitScore(score: number, mode: GameMode = settings.mode): boolean {
      const s = Math.floor(clampNum(score, 0, MAX_SCORE, 0));
      if (s > (hi[mode] ?? 0)) {
        hi[mode] = s;
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
