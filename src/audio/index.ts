// STUB — replaced by the UI/audio/save module owner.
import type { AudioEngine } from '../core/types';

export function createAudio(): AudioEngine {
  return {
    unlock() {}, setMuted() {}, playBgm() {}, stopBgm() {}, sfx() {}, setPaused() {},
    beat: 0, bpm: 120,
  };
}
