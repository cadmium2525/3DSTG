/**
 * Tiny shared state between the stage-2 boss and the stage-2 background layers: the boss writes
 * it every frame it animates (`fresh = true`), the dusk layer reads it and relaxes it back to the
 * road look when nobody has written it for a frame (boss gone, other stage, title…).
 */
export const DUSK_STATE = {
  /** How far the moon covers the far setting sun, 0..1 (road: a first bite). */
  eclipse: 0.12,
  /** Screen dim 0..1 (皆既日蝕). Dims background, enemies, boss — not bullets / shots / items. */
  dim: 0,
  /** Warm flash 0..1 (corona burst, the sun flaring back on the boss's death). */
  flare: 0,
  /** Set by the writer each frame; cleared by the reader. */
  fresh: false,
};

/** Road values the layer relaxes to. */
export const DUSK_DEFAULT = { eclipse: 0.12, dim: 0, flare: 0 } as const;
