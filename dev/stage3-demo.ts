/**
 * Stage 3 danmaku dev page: /dev/stage3.html
 *   ?pattern=shadowMimic&auto=1 …   same viewer as dev/danmaku.html (stage-3 emitters registered)
 *   ?fair3=1                         headless fairness table for every stage-3 pattern + the boss combos
 *                                    (&intensity=… overrides; &quality=0..2; &seeds=10)
 */
import { FIELD, PLAYER } from '../src/core/config';
import type { PatternId } from '../src/core/types';
import { bossOrigin, DodgeBot } from '../src/danmaku/bot';
import { DanmakuSim } from '../src/danmaku/sim';
import '../src/danmaku/stage3';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

interface Spec { id: PatternId; intensity: number; every?: number; dur?: number; origin?: 'boss' | 'side' | 'enemy' }
interface Case { name: string; specs: Spec[]; duration: number }

/** Enemy volleys re-armed every `every` s (as the enemy fire script does), bosses continuous. */
const CASES: Case[] = [
  { name: 'shadowShot (enemy)', specs: [{ id: 'shadowShot', intensity: 0.45, every: 1.6, dur: 0.5, origin: 'enemy' }], duration: 15 },
  { name: 'shadowShot ×3 enemies', specs: [0, 1, 2].map(() => ({ id: 'shadowShot' as PatternId, intensity: 0.5, every: 1.7, dur: 0.5, origin: 'enemy' as const })), duration: 15 },
  { name: 'shadowGrasp (hand)', specs: [{ id: 'shadowGrasp', intensity: 0.5, every: 2.4, dur: 0.6, origin: 'side' }], duration: 15 },
  { name: 'shadowGrasp ×2 hands', specs: [{ id: 'shadowGrasp', intensity: 0.5, every: 2.6, dur: 0.6, origin: 'side' }, { id: 'shadowGrasp', intensity: 0.5, every: 2.6, dur: 0.6, origin: 'side' }], duration: 15 },
  { name: 'shadowBloom (flower)', specs: [{ id: 'shadowBloom', intensity: 0.5, every: 2.2, dur: 0.6, origin: 'enemy' }], duration: 15 },
  { name: 'bloom×2 + shot', specs: [{ id: 'shadowBloom', intensity: 0.5, every: 2.4, dur: 0.6, origin: 'enemy' }, { id: 'shadowBloom', intensity: 0.5, every: 2.4, dur: 0.6, origin: 'enemy' }, { id: 'shadowShot', intensity: 0.5, every: 1.6, dur: 0.5, origin: 'enemy' }], duration: 15 },
  // mid-boss ノクス
  { name: 'shadowSlash 0.4 (Nox P1)', specs: [{ id: 'shadowSlash', intensity: 0.4 }], duration: 15 },
  { name: 'P1: slash .4 + shot .3', specs: [{ id: 'shadowSlash', intensity: 0.4 }, { id: 'shadowShot', intensity: 0.3 }], duration: 15 },
  { name: 'blackShield 0.5', specs: [{ id: 'blackShield', intensity: 0.5 }], duration: 15 },
  { name: 'P2: shield .55 + slash .6', specs: [{ id: 'blackShield', intensity: 0.55 }, { id: 'shadowSlash', intensity: 0.6 }], duration: 15 },
  // boss 影の少女
  { name: 'shadowMimic 0.5', specs: [{ id: 'shadowMimic', intensity: 0.5 }], duration: 15 },
  { name: 'B1: mimic .55 + shot .35', specs: [{ id: 'shadowMimic', intensity: 0.55 }, { id: 'shadowShot', intensity: 0.35 }], duration: 15 },
  { name: 'shadowEcho 0.55', specs: [{ id: 'shadowEcho', intensity: 0.55 }], duration: 26 },
  { name: 'shadowBarrier 0.5', specs: [{ id: 'shadowBarrier', intensity: 0.5 }], duration: 15 },
  { name: 'B3: barrier .6', specs: [{ id: 'shadowBarrier', intensity: 0.6 }], duration: 18 },
  { name: 'lightEater 0.5', specs: [{ id: 'lightEater', intensity: 0.5 }], duration: 15 },
  { name: 'B4: eater .55 + shot .3', specs: [{ id: 'lightEater', intensity: 0.55 }, { id: 'shadowShot', intensity: 0.3 }], duration: 15 },
  { name: 'lightShadowHelix 0.5', specs: [{ id: 'lightShadowHelix', intensity: 0.5 }], duration: 15 },
  { name: 'B5: helix .62', specs: [{ id: 'lightShadowHelix', intensity: 0.62 }], duration: 20 },
];

function run(c: Case, seeds: number, quality: 0 | 1 | 2, iOverride: number | null) {
  const dt = 1 / 30;
  let survived = 0, botHits = 0, statRuns = 0, firstSum = 0, peak = 0, aliveSum = 0, aliveN = 0;
  for (let s = 1; s <= seeds; s++) {
    for (let mode = 0; mode < 2; mode++) {
      const sim = new DanmakuSim();
      sim.quality = quality;
      const bot = new DodgeBot();
      let t = 0;
      const p = { x: 0, y: 0, z: 0 };
      const origins = c.specs.map((sp, k) => {
        const o = { x: 0, y: 0, z: 0 };
        const side = k % 2 === 0 ? -1 : 1;
        return () => {
          if (sp.origin === 'side') { o.x = side * 6.1; o.y = 1 + Math.sin(t * 0.7 + k) * 1.5; o.z = -27; }
          else if (sp.origin === 'enemy') { o.x = Math.sin(t * 0.3 + k * 2.1) * 6; o.y = 3 + Math.sin(t * 0.5 + k) * 1.5; o.z = -42; }
          else bossOrigin(t, o);
          return o;
        };
      });
      const next = c.specs.map((_, k) => 0.3 + k * 0.45);
      let hits = 0, inv = 0, first = -1;
      while (t < c.duration + 4.5) {
        for (let k = 0; k < c.specs.length; k++) {
          const sp = c.specs[k];
          const I = iOverride ?? sp.intensity;
          if (sp.every) {
            if (t >= next[k] && t < c.duration) {
              next[k] += sp.every;
              sim.startPattern(sp.id, { origin: origins[k], duration: sp.dur ?? 0.5, intensity: I, seed: s * 7 + 3 + k * 101 + Math.floor(t * 10) });
            }
          } else if (next[k] >= 0) {
            next[k] = -1;
            sim.startPattern(sp.id, { origin: origins[k], duration: c.duration, intensity: I, seed: s * 7 + 3 + k * 101 });
          }
        }
        if (mode === 0) { bot.update(dt, sim.pool); p.x = bot.x; p.y = bot.y; }
        const r = sim.update(dt, p, inv <= 0);
        t += dt; inv -= dt;
        if (r.hit) { hits++; inv = PLAYER.invincibleSec; if (first < 0) first = t; }
        if (mode === 0 && t > 5 && t < c.duration) { aliveSum += sim.pool.n; aliveN++; }
      }
      if (mode === 0) { botHits += hits; if (hits === 0) survived++; peak = Math.max(peak, sim.peak); }
      else if (hits > 0) { statRuns++; firstSum += first; }
    }
  }
  return { survived, botHits, statRuns, first: statRuns ? firstSum / statRuns : -1, peak, avg: aliveSum / Math.max(1, aliveN) };
}

if (q.get('fair3') === '1') {
  const out = document.getElementById('out')!;
  out.style.display = 'block';
  const seeds = num('seeds', 10);
  const quality = num('quality', 2) as 0 | 1 | 2;
  const iOv = q.has('intensity') ? num('intensity', 0.5) : null;
  const only = q.get('only');
  const lines = [`stage 3 fairness  q=${quality}  ${seeds} seeds  dt=1/30  field ${FIELD.halfW}x${FIELD.halfH}\n`];
  out.textContent = lines.join('\n');
  setTimeout(() => {
    for (const c of CASES) {
      if (only && !c.name.includes(only)) continue;
      const r = run(c, seeds, quality, iOv);
      lines.push(`${c.name.padEnd(28)} bot ${r.survived}/${seeds} (hits ${r.botHits})  stationary hit ${r.statRuns}/${seeds} (first ${r.first.toFixed(1)}s)  peak ${r.peak}  avg ${r.avg.toFixed(0)}`);
      out.textContent = lines.join('\n');
    }
    (window as unknown as { __fair3: string }).__fair3 = lines.join('\n');
  }, 50);
} else {
  import('./danmaku-demo');
}
