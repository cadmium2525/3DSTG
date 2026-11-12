/**
 * Stage 2 fairness table: every stage-2 pattern alone, plus the mid-boss / boss phase combos at
 * their real intensities (and ×DIFFICULTY.hard.bullet = 1.3 with ?hard=1, plus the hard-only layers).
 * /dev/stage2-fairness.html
 *   ?seeds=10 &quality=2 &only=coronaRays,totalEclipse+coronaRays
 */
import type { PatternId } from '../src/core/types';
import { PLAYER } from '../src/core/config';
import { bossOrigin, DodgeBot, type FairnessRow } from '../src/danmaku/bot';
import { DanmakuSim } from '../src/danmaku/sim';
import '../src/danmaku/stage2';
import { DIFFICULTY } from '../src/game/stages/types';

/** runFairness (src/danmaku/bot.ts) with a per-pattern intensity. */
function runFairnessMix(pats: { id: PatternId; I: number }[], seeds: number, duration: number, quality: 0 | 1 | 2): FairnessRow {
  const dt = 1 / 30;
  const row: FairnessRow = { pattern: pats.map((p) => p.id).join('+'), seeds, botSurvived: 0, botHits: 0, stationaryHitRuns: 0, stationaryFirstHit: 0, peak: 0, avgAlive: 0 };
  let firstSum = 0, aliveSum = 0, aliveN = 0;
  for (let s = 1; s <= seeds; s++) {
    for (let mode = 0; mode < 2; mode++) {
      const sim = new DanmakuSim();
      sim.quality = quality;
      const bot = new DodgeBot(6, 1.1);
      let t = 0;
      const o = { x: 0, y: 0, z: 0 };
      pats.forEach((p, k) => sim.startPattern(p.id, { origin: () => bossOrigin(t, o), duration, intensity: p.I, seed: s * 7 + 3 + k * 101 }));
      const pl = { x: 0, y: 0, z: 0 };
      let hits = 0, inv = 0, first = -1;
      while (t < duration + 4.5) {
        if (mode === 0) { bot.update(dt, sim.pool); pl.x = bot.x; pl.y = bot.y; }
        const r = sim.update(dt, pl, inv <= 0);
        t += dt;
        inv -= dt;
        if (r.hit) { hits++; inv = PLAYER.invincibleSec; if (first < 0) first = t; }
        if (mode === 0 && t > 5 && t < duration) { aliveSum += sim.pool.n; aliveN++; }
      }
      if (mode === 0) {
        row.botHits += hits;
        if (hits === 0) row.botSurvived++;
        row.peak = Math.max(row.peak, sim.peak);
      } else if (hits > 0) { row.stationaryHitRuns++; firstSum += first; }
    }
  }
  row.stationaryFirstHit = row.stationaryHitRuns ? firstSum / row.stationaryHitRuns : -1;
  row.avgAlive = aliveSum / Math.max(1, aliveN);
  return row;
}

const q = new URLSearchParams(location.search);
const seeds = Number(q.get('seeds') ?? 10);
const quality = Number(q.get('quality') ?? 2) as 0 | 1 | 2;
type Row = { label: string; ids: PatternId[]; I: number; Is?: number[]; duration?: number; hardOnly?: boolean };
const rows: Row[] = [
  // enemies (an enemy volley runs ~0.5 s but repeats every fireEvery; test as a continuous stream)
  { label: 'mothDust', ids: ['mothDust'], I: 0.48 },
  { label: 'wispSpread', ids: ['wispSpread'], I: 0.48 },
  { label: 'shardRing', ids: ['shardRing'], I: 0.5 },
  // intros
  { label: 'coronaRays intro', ids: ['coronaRays'], I: 0.28 },
  { label: 'twilightLattice intro', ids: ['twilightLattice'], I: 0.3 },
  { label: 'crescentSweep intro', ids: ['crescentSweep'], I: 0.3 },
  // mid-boss
  { label: 'lanternDrift', ids: ['lanternDrift'], I: 0.45 },
  { label: 'flickerCurtain', ids: ['flickerCurtain'], I: 0.5 },
  { label: 'M1 lanternDrift+aimed', ids: ['lanternDrift', 'aimedBurst'], I: 0.45, Is: [0.45, 0.32] },
  { label: 'M2 flicker+lantern', ids: ['flickerCurtain', 'lanternDrift'], I: 0.5, Is: [0.5, 0.3] },
  // boss
  { label: 'B1 coronaRays', ids: ['coronaRays'], I: 0.5 },
  { label: 'twilightLattice', ids: ['twilightLattice'], I: 0.55 },
  { label: 'B2 lattice+aimed', ids: ['twilightLattice', 'aimedBurst'], I: 0.55, Is: [0.55, 0.35] },
  { label: 'crescentSweep', ids: ['crescentSweep'], I: 0.5 },
  { label: 'B3 crescent+corona', ids: ['crescentSweep', 'coronaRays'], I: 0.5, Is: [0.5, 0.22] },
  { label: 'totalEclipse', ids: ['totalEclipse'], I: 0.55, duration: 20 },
  { label: 'B4 eclipse+corona', ids: ['totalEclipse', 'coronaRays'], I: 0.55, Is: [0.55, 0.28], duration: 20 },
  { label: 'aimed+wisp+moth (road mix)', ids: ['aimedBurst', 'wispSpread', 'mothDust'], I: 0.46 },
];
// Hard-only layers (stage2/index.ts `hard`), run at the hard multiplier only.
const HARD_ROWS: Row[] = [
  { label: 'M2+ flicker+lantern+aimed', ids: ['flickerCurtain', 'lanternDrift', 'aimedBurst'], I: 0.5, Is: [0.5, 0.3, 0.3] },
  { label: 'B1+ corona+aimed', ids: ['coronaRays', 'aimedBurst'], I: 0.5, Is: [0.5, 0.3] },
  { label: 'B3+ crescent+corona+shard', ids: ['crescentSweep', 'coronaRays', 'shardRing'], I: 0.5, Is: [0.5, 0.22, 0.3] },
];
if (q.has('hard')) rows.push(...HARD_ROWS.map((r) => ({ ...r, hardOnly: true })));
const only = q.get('only')?.split(',');
const out = document.getElementById('out')!;
const lines = [`stage 2 fairness  ${seeds} seeds  quality ${quality}  (combos at their per-pattern intensities)\n`];
out.textContent = lines.join('\n');
const results: Record<string, unknown>[] = [];
setTimeout(() => {
  for (const r of rows) {
    if (only && !only.includes(r.label) && !only.includes(r.ids.join('+'))) continue;
    const H = DIFFICULTY.hard.bullet;
    for (const mul of r.hardOnly ? [H] : q.has('hard') ? [1, H] : [1]) {
      const I = Math.min(1, r.I * mul);
      const f = runFairnessMix(r.ids.map((id, k) => ({ id, I: Math.min(1, (r.Is?.[k] ?? r.I) * mul) })), seeds, r.duration ?? 15, quality);
      results.push({ ...f, label: r.label, I });
      lines.push(
        `${(r.label + (mul !== 1 ? ' x' + mul : '')).padEnd(26)} I=${I.toFixed(2)}  bot ${f.botSurvived}/${f.seeds} (hits ${f.botHits})  ` +
          `stationary hit ${f.stationaryHitRuns}/${f.seeds} (first ${f.stationaryFirstHit.toFixed(1)}s)  peak ${f.peak}  avg ${f.avgAlive.toFixed(0)}`,
      );
      out.textContent = lines.join('\n');
    }
  }
  (window as unknown as { __fairness: unknown }).__fairness = results;
  (window as unknown as { __fairnessText: string }).__fairnessText = out.textContent ?? '';
}, 50);
