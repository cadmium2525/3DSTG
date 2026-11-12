/**
 * Mode fairness table built straight from the StageDefs: /dev/hard-fairness.html
 *   (default HARD)  ?mode=normal  ?seeds=10  ?quality=2  ?only=stage2  ?skipRoad=1  ?skipBoss=1  ?exclude=kind,…
 *
 * Uses exactly what the game uses — DIFFICULTY[mode], resolveBossConfig (phase timeouts and the
 * hard-only layers), eventsFor (hardOnly events, wave `hard` overrides), the enemy kinds' fire
 * scripts and the formations — so the table is the real hard mode, not a hand-copied list.
 *
 *  - every mid-boss / boss phase: all its patterns in parallel at their scaled intensities, from a
 *    boss-like swaying origin, for the whole (scaled) timeout;
 *  - every road segment (start → mid-boss, mid-boss → boss): each wave member fires its kind's
 *    pattern from its formation station every fireEvery × fireRate while it hovers, intros run
 *    their pattern. Nobody is shot down, so this is harsher than the game (where most enemies
 *    die within a volley or two at Lv3–4).
 * Bot = DodgeBot (speed 6, horizon 1.1). A row passes with bot ≥ 9/seeds and peak < 850.
 */
import * as THREE from 'three';
import { PLAYER } from '../src/core/config';
import type { PatternId } from '../src/core/types';
import { bossOrigin, DodgeBot } from '../src/danmaku/bot';
import { DanmakuSim } from '../src/danmaku/sim';
import { resolveBossConfig, type BossConfig } from '../src/game/bosses/BossLike';
import { getEnemyKind, getFormation } from '../src/game/enemies/registry';
import { Rng } from '../src/game/Rng';
import { STAGES } from '../src/game/stages';
import { DIFFICULTY, eventsFor, scaleIntensity, type Difficulty, type StageDef, type WaveEvent } from '../src/game/stages/types';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const mode = q.get('mode') === 'normal' ? 'normal' : 'hard';
const D: Difficulty = DIFFICULTY[mode];
const SEEDS = num('seeds', 10);
const QUALITY = num('quality', 2) as 0 | 1 | 2;
const ENTER_SEC = 1.7; // Enemies.ts
/** ?exclude=shadowFlower,shadowHand — leave kinds out of the road runs (to see who makes the bullets). */
const EXCLUDE = (q.get('exclude') ?? '').split(',').filter(Boolean);

interface Shot { at: number; id: PatternId; I: number; dur: number; origin: (t: number) => { x: number; y: number; z: number } }
interface Case { label: string; shots: Shot[]; duration: number }
interface Res { label: string; survived: number; hits: number; statRuns: number; peak: number; avg: number; duration: number }

function run(c: Case): Res {
  const dt = 1 / 30;
  let survived = 0, hitsAll = 0, statRuns = 0, peak = 0, aliveSum = 0, aliveN = 0;
  for (let s = 1; s <= SEEDS; s++) {
    for (let m = 0; m < 2; m++) {
      const sim = new DanmakuSim();
      sim.quality = QUALITY;
      const bot = new DodgeBot(6, 1.1);
      let t = 0;
      const p = { x: 0, y: 0, z: 0 };
      const shots = c.shots.slice().sort((a, b) => a.at - b.at);
      let k = 0;
      let hits = 0, inv = 0;
      while (t < c.duration + 4.5) {
        while (k < shots.length && shots[k].at <= t) {
          const sh = shots[k++];
          const o = { x: 0, y: 0, z: 0 };
          sim.startPattern(sh.id, { origin: () => Object.assign(o, sh.origin(t)), duration: sh.dur, intensity: sh.I, seed: s * 7919 + k * 101 + 3 });
        }
        if (m === 0) { bot.update(dt, sim.pool); p.x = bot.x; p.y = bot.y; }
        const r = sim.update(dt, p, inv <= 0);
        t += dt; inv -= dt;
        if (r.hit) { hits++; inv = PLAYER.invincibleSec; }
        if (m === 0 && t > 3 && t < c.duration) { aliveSum += sim.pool.n; aliveN++; }
      }
      if (m === 0) { hitsAll += hits; if (hits === 0) survived++; peak = Math.max(peak, sim.peak); }
      else if (hits > 0) statRuns++;
    }
  }
  return { label: c.label, survived, hits: hitsAll, statRuns, peak, avg: aliveSum / Math.max(1, aliveN), duration: c.duration };
}

/* ---- boss / mid-boss phases ---- */
function bossCases(def: StageDef): Case[] {
  const out: Case[] = [];
  const add = (role: string, cfg0: BossConfig) => {
    const cfg = resolveBossConfig(cfg0, D);
    cfg.phases.forEach((ph, i) => {
      const o = { x: 0, y: 0, z: 0 };
      const origin = (t: number) => {
        bossOrigin(t, o);
        o.z = cfg.position.z;
        return o;
      };
      const pats = ph.patterns.map((x) => `${x.id} ${scaleIntensity(x.intensity, D).toFixed(2)}`).join(' + ');
      out.push({
        label: `S${def.number} ${role} P${i + 1} ${ph.name ?? ''} [${pats}] ${ph.timeout.toFixed(1)}s`,
        duration: ph.timeout,
        shots: ph.patterns.map((x) => ({ at: 0, id: x.id, I: scaleIntensity(x.intensity, D), dur: ph.timeout, origin })),
      });
    });
  };
  if (def.midBoss) add('mid', def.midBoss.config);
  add('boss', def.boss.config);
  return out;
}

/* ---- road segments ---- */
function roadCases(def: StageDef): Case[] {
  const evs = eventsFor(def.events, D);
  const mid = evs.findIndex((e) => e.type === 'midboss');
  const warn = evs.findIndex((e) => e.type === 'warning');
  const segs: [string, number, number][] = mid >= 0 ? [['road A', 0, mid], ['road B', mid + 1, warn]] : [['road', 0, warn]];
  const rng = new Rng(12345);
  return segs.map(([name, a, b]) => {
    const list = evs.slice(a, b);
    const t0 = a > 0 ? evs[a - 1].t : 0;
    const shots: Shot[] = [];
    let end = 0;
    let waves = 0, members = 0;
    for (const e of list) {
      const at = e.t - t0;
      if (e.type === 'intro') {
        const o = { x: 0, y: 1.6, z: -50 };
        shots.push({ at: at + ENTER_SEC, id: e.pattern, I: scaleIntensity(e.intensity, D), dur: e.duration, origin: () => o });
        end = Math.max(end, at + ENTER_SEC + e.duration);
        continue;
      }
      if (e.type !== 'wave') continue;
      const w = e as WaveEvent;
      const kind = getEnemyKind(w.kind);
      waves++;
      if (w.quiet || kind.fire === null || EXCLUDE.includes(w.kind)) continue;
      const form = getFormation(w.formation);
      const fire = kind.fire;
      const I = scaleIntensity(w.intensity * (fire?.intensityMul ?? 1), D);
      const every = w.fireEvery * D.fireRate;
      const motion = kind.motion?.type ?? 'station';
      for (let i = 0; i < w.count; i++) {
        members++;
        const slot = { station: new THREE.Vector3(), start: new THREE.Vector3(), exit: new THREE.Vector3() };
        form(i, w.count, w, slot, rng);
        const born = at + i * (w.delayStep ?? 0.14);
        const st = slot.station.clone();
        const wob = rng.next() * 6.28;
        const o = { x: 0, y: 0, z: 0 };
        let origin = (t: number) => { o.x = st.x + Math.sin(t * 1.3 + wob) * 0.7; o.y = st.y + Math.cos(t * 1.1 + wob) * 0.4; o.z = st.z; return o; };
        let fireFrom = born + ENTER_SEC, fireTo = fireFrom + w.stay;
        if (motion === 'path') {
          const s0 = slot.start.clone(), s1 = slot.exit.clone(), dur = Math.max(0.1, w.stay);
          origin = (t: number) => { const u = Math.min(1, Math.max(0, (t - born) / dur)); o.x = s0.x + (s1.x - s0.x) * u; o.y = s0.y + (s1.y - s0.y) * u; o.z = s0.z + (s1.z - s0.z) * u; return o; };
          fireFrom = born; fireTo = born + dur;
        } else if (motion === 'custom') {
          fireFrom = born; fireTo = born + ENTER_SEC + w.stay + 1.6;
        }
        if (fire?.continuous) {
          const s = fireFrom + (fire.firstDelay ?? 0.3);
          if (s < fireTo - 0.2) shots.push({ at: s, id: fire.pattern, I, dur: fireTo - s, origin });
        } else {
          for (let ft = fireFrom + (fire?.firstDelay ?? 0.1 + rng.next() * 0.4); ft < fireTo; ft += every) {
            shots.push({ at: ft, id: fire?.pattern ?? 'aimedBurst', I, dur: fire?.duration ?? 0.5, origin });
            if (motion === 'custom' && every > 5) break;
          }
        }
        end = Math.max(end, fireTo);
      }
    }
    return { label: `S${def.number} ${name} (${waves} waves, ${members} members, ${shots.length} volleys)`, shots, duration: Math.ceil(end) };
  });
}

const out = document.getElementById('out')!;
const lines = [`${mode.toUpperCase()} fairness  bullet ×${D.bullet}  fireEvery ×${D.fireRate}  timeout ×${D.timeout}  seeds ${SEEDS}  q=${QUALITY}\n`];
out.textContent = lines.join('\n');
const results: (Res & { pass: boolean })[] = [];
const only = q.get('only');
const cases: Case[] = [];
for (const def of STAGES) {
  if (only && !def.id.includes(only)) continue;
  if (!q.has('skipBoss')) cases.push(...bossCases(def));
  if (!q.has('skipRoad')) cases.push(...roadCases(def));
}
let ci = 0;
const step = () => {
  if (ci >= cases.length) {
    lines.push(`\n${results.filter((r) => r.pass).length}/${results.length} rows pass (bot ≥ ${SEEDS - 1}/${SEEDS}, peak < 850)`);
    out.textContent = lines.join('\n');
    (window as unknown as { __hardFair: unknown }).__hardFair = results;
    (window as unknown as { __hardFairText: string }).__hardFairText = lines.join('\n');
    return;
  }
  const r = run(cases[ci++]);
  const pass = r.survived >= SEEDS - 1 && r.peak < 850;
  results.push({ ...r, pass });
  lines.push(`${pass ? 'ok  ' : 'FAIL'} ${r.label}\n       bot ${r.survived}/${SEEDS} (hits ${r.hits})  stationary hit ${r.statRuns}/${SEEDS}  peak ${r.peak}  avg ${r.avg.toFixed(0)}`);
  out.textContent = lines.join('\n');
  setTimeout(step, 0);
};
setTimeout(step, 50);
