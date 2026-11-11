/**
 * BLOOM DIVE — shared world constants. Everything is in world units.
 *
 * Coordinate system (three.js, right-handed):
 *   X = left/right, Y = up/down, Z = depth.
 *   The player lives on the "play plane" z = 0 and faces -Z (into the screen).
 *   Enemies sit far away at negative Z; enemy bullets travel toward +Z.
 *   The camera is behind the player (positive Z) looking toward -Z.
 */
export const FIELD = {
  /** Player movement bounds on the play plane (centre 0,0). */
  halfW: 2.7,
  halfH: 3.7,
  /** Z of the play plane. */
  planeZ: 0,
  /** Typical Z where enemies / emitters sit. */
  enemyZ: -60,
  /** Bullets past this Z (behind the player) are recycled. */
  despawnZ: 5,
  /** Bullets farther than this are recycled too. */
  farZ: -130,
} as const;

export const PLAYER = {
  /** Lethal radius: much smaller than the visible character. */
  hitRadius: 0.085,
  /** Graze detection radius. */
  grazeRadius: 0.6,
  /** Heroine model height in world units (origin = chest = hitbox centre). */
  modelHeight: 1.3,
  lives: 3,
  invincibleSec: 2.2,
  /** World units moved per CSS pixel dragged = dragScale / viewportHeightPx * sensitivity. */
  dragScale: 11,
  slowFactor: 0.45,
} as const;

export const CAMERA = {
  fov: 62,
  /** Camera offset from the play plane and how strongly it follows the player. */
  distance: 8.6,
  height: 0.9,
  followX: 0.55,
  followY: 0.5,
} as const;

export const BULLET = {
  /** Hard cap for simultaneously alive enemy bullets (pool size). */
  max: 900,
  /** Typical approach speed range, units/sec. */
  speedMin: 11,
  speedMax: 22,
  /** Typical visual radius. Collision radius = visual * hitScale. */
  radius: 0.2,
  hitScale: 0.55,
} as const;

/** Palette from the design doc: cyan, purple, pink, gold on dark space. */
export const PALETTE = {
  bg: 0x05030f,
  cyan: 0x4fe8ff,
  purple: 0x9d6bff,
  pink: 0xff6fb5,
  gold: 0xffd166,
  white: 0xf4f6ff,
  heroineBlue: 0x2f5fd0,
} as const;
