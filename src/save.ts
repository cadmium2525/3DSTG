// STUB — replaced by the UI/audio/save module owner.
import type { SaveStore, Settings } from './core/types';

export function createSaveStore(): SaveStore {
  const settings: Settings = { muted: false, slowMode: false, sensitivity: 1, quality: 'auto' };
  let hi = 0;
  return {
    settings,
    get hiScore() { return hi; },
    submitScore(s) { if (s > hi) { hi = s; return true; } return false; },
    saveSettings() {},
  };
}
