#!/usr/bin/env node
/*
 * BLOOM DIVE audio build: renders the song / SFX JSON in audio-src/ with the
 * かなでる engine (mp4mp3/daw, pure JS) and writes compressed files to public/audio/
 * plus the typed manifest src/audio/manifest.ts.
 *
 *   npm run audio                       # everything
 *   node audio-src/build.mjs --only stage,shot --report --sheet
 *
 *   MP4MP3_DIR   path of the mp4mp3 checkout (default ../cadmium2525/mp4mp3, then /home/user/cadmium2525/mp4mp3)
 *   --only a,b   only these tracks / sfx (manifest keeps the other entries)
 *   --no-gen     do not re-run bgm/*.gen.mjs (render the committed JSON as is)
 *   --report     print the かなでる analysis report
 *   --sheet      write analysis sheets (PNG) to audio-src/.out/
 *   --wav        also keep the rendered loop WAVs in audio-src/.out/
 *
 * Needs node >= 18 and ffmpeg on PATH (MP3 encoding / decode check).
 *
 * BGM loops: each song's `bars` is the exact loop length. The song is rendered with
 * its reverb/delay tail, the tail is folded back onto the loop start (what you hear
 * at the wrap point), then the loop is padded on both sides with PAD seconds of its
 * own periodic continuation. The game loops between loopStart/loopEnd, so a constant
 * decoder offset (MP3 encoder delay) cannot cause a gap or click.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'public', 'audio');
const SCRATCH = join(HERE, '.out');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const only = val('--only')?.split(',').map((s) => s.trim());
const want = (id) => !only || only.includes(id);

const candidates = [process.env.MP4MP3_DIR, resolve(ROOT, '../cadmium2525/mp4mp3'), '/home/user/cadmium2525/mp4mp3'].filter(Boolean);
const DAW = candidates.find((p) => existsSync(join(p, 'daw/js/engine/mix.js')));
if (!DAW) {
  console.error(`かなでる (mp4mp3/daw) not found. Set MP4MP3_DIR. Tried:\n  ${candidates.join('\n  ')}`);
  process.exit(1);
}
const eng = (f) => import(pathToFileURL(join(DAW, 'daw/js/engine', f)).href);
const { renderSong, autoMix } = await eng('mix.js');
const { renderAnySfx } = await eng('sfx.js');
const { applyChain } = await eng('fx.js');
const { analyzeAudio, reportText, loudness, truePeak } = await eng('analyze.js');
const { encodeWav } = await eng('wav.js');
const { validateSong } = await eng('validate.js');
const { drawSheet, sheetHeight, Raster, waveColumns, sfxStats } = await eng('viz.js');
const { encodePng, decodeAudio } = await import(pathToFileURL(join(DAW, 'daw/tools/common.mjs')).href);

const SR = 48000;          // engine render rate
const OUT_SR = 44100;      // encoded rate
const PAD = 0.25;          // seconds of periodic padding around the BGM loop
const BGM_KBPS = 128;
const SFX_KBPS = 96;

mkdirSync(join(OUT, 'bgm'), { recursive: true });
mkdirSync(join(OUT, 'sfx'), { recursive: true });
if (has('--sheet') || has('--wav')) mkdirSync(SCRATCH, { recursive: true });

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** JSON with short arrays (notes) kept on one line */
function pretty(v, ind = '') {
  const flat = (x) => Array.isArray(x) && x.every((y) => y === null || typeof y !== 'object');
  if (Array.isArray(v)) {
    if (flat(v)) return JSON.stringify(v);
    if (v.every(flat) && v.length) {
      const rows = [];
      for (let i = 0; i < v.length; i += 4) rows.push(v.slice(i, i + 4).map((x) => JSON.stringify(x)).join(', '));
      return `[\n${ind}  ${rows.join(`,\n${ind}  `)}\n${ind}]`;
    }
    return `[\n${v.map((x) => ind + '  ' + pretty(x, ind + '  ')).join(',\n')}\n${ind}]`;
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v).filter((k) => v[k] !== undefined);
    if (!ks.length) return '{}';
    const one = JSON.stringify(v);
    if (one.length < 100 && !one.includes('[[')) return one;
    return `{\n${ks.map((k) => `${ind}  ${JSON.stringify(k)}: ${pretty(v[k], ind + '  ')}`).join(',\n')}\n${ind}}`;
  }
  return JSON.stringify(v);
}

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...argv], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${argv.join(' ')}`);
}

function encodeMp3(L, R, file, kbps, mono) {
  const tmp = file + '.tmp.wav';
  writeFileSync(tmp, encodeWav(L, R, SR, 24));
  ffmpeg(['-i', tmp, '-ar', String(OUT_SR), ...(mono ? ['-ac', '1'] : []), '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-map_metadata', '-1', file]);
  unlinkSync(tmp);
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const peakOf = (L, R) => { let p = 0; for (let i = 0; i < L.length; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i])); return p; };
const rms = (x, s, n) => { let a = 0; for (let i = 0; i < n; i++) { const v = x[(s + i + x.length) % x.length]; a += v * v; } return Math.sqrt(a / n); };
const hash = (file) => createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8);
const fixed = (x, n = 3) => Number(x.toFixed(n));

function sheet(L, R, a, song, title, file) {
  const W = song ? 1600 : 1200;
  const P = new Raster(W, sheetHeight(a, song));
  a._wave = waveColumns(L, R, W - 90);
  drawSheet(P, a, { song, title, targetLufs: song?.master?.loudness ?? -14 });
  writeFileSync(file, encodePng(P.w, P.h, P.px));
}

/* ------------------------------------------------------------------ */
/* manifest (kept across --only runs)                                  */
/* ------------------------------------------------------------------ */
const manifestJson = join(OUT, 'manifest.json');
const manifest = existsSync(manifestJson) ? JSON.parse(readFileSync(manifestJson, 'utf8')) : { bgm: {}, sfx: {} };

/* ------------------------------------------------------------------ */
/* BGM                                                                 */
/* ------------------------------------------------------------------ */
const bgmDir = join(HERE, 'bgm');
const bgmIds = [...new Set(readdirSync(bgmDir).filter((f) => /\.(gen\.mjs|json)$/.test(f)).map((f) => f.replace(/\.(gen\.mjs|json)$/, '')))].sort();

for (const id of bgmIds.filter(want)) {
  const gen = join(bgmDir, `${id}.gen.mjs`);
  const jsonPath = join(bgmDir, `${id}.json`);
  if (existsSync(gen) && !has('--no-gen')) {
    const song = (await import(pathToFileURL(gen).href + `?t=${Date.now()}`)).default();
    // かなでる auto mix: measure each track and set its fader for its role, then apply the per-track trim.
    const auto = autoMix(song);
    for (const tr of song.tracks) {
      const k = tr.id;
      if (auto[k] != null) tr.volume = Math.max(-30, Math.min(6, Math.round((auto[k] + (tr.trim ?? 0)) * 2) / 2));
      delete tr.trim;
    }
    writeFileSync(jsonPath, pretty(song) + '\n');
  }
  const song = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const chk = validateSong(song);
  for (const w of chk.warnings) console.warn(`  △ ${id}: ${w}`);
  if (chk.errors.length) { for (const e of chk.errors) console.error(`  ✗ ${id}: ${e}`); process.exit(1); }

  const t0 = Date.now();
  const out = renderSong(song, { sr: SR });
  const bpb = (song.sig?.[0] ?? 4) * 4 / (song.sig?.[1] ?? 4);
  const loopBeats = song.bars * bpb;
  const loopSec = loopBeats * 60 / song.bpm;
  const n = Math.round(loopSec * SR);
  // fold the tail onto the loop start
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < out.L.length; i++) { L[i % n] += out.L[i]; R[i % n] += out.R[i]; }
  const ceiling = 10 ** ((song.master?.ceiling ?? -1) / 20);
  const tp = truePeak(L, R);
  if (tp > ceiling) { const g = ceiling / tp * 0.995; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } }

  // seam check: sample jump at the wrap vs. typical neighbour difference, and RMS either side
  let typ = 0;
  for (let i = 1; i < n; i++) typ = Math.max(typ, Math.abs(L[i] - L[i - 1]));
  const jump = Math.max(Math.abs(L[0] - L[n - 1]), Math.abs(R[0] - R[n - 1]));
  const w = Math.round(0.02 * SR);
  const rmsBefore = db(rms(L, n - w, w)), rmsAfter = db(rms(L, 0, w));

  // padded, periodic file
  const p = Math.round(PAD * SR), m = n + 2 * p;
  const EL = new Float32Array(m), ER = new Float32Array(m);
  for (let i = 0; i < m; i++) { const k = ((i - p) % n + n) % n; EL[i] = L[k]; ER[i] = R[k]; }
  const file = join(OUT, 'bgm', `${id}.mp3`);
  encodeMp3(EL, ER, file, BGM_KBPS, false);

  // decode the MP3 back and check the loop region really wraps seamlessly
  const [DL] = decodeAudio(file, SR);
  // wrap step (end -> start) compared with the largest natural sample step around both points
  const wrapStep = Math.abs(DL[p] - DL[p + n - 1]);
  let localStep = 0;
  for (let k = -200; k < 200; k++) localStep = Math.max(localStep, Math.abs(DL[p + k] - DL[p + k - 1]), Math.abs(DL[p + n + k] - DL[p + n + k - 1]));

  const lu = loudness(L, R, SR);
  const entry = {
    file: `bgm/${id}.mp3?v=${hash(file)}`,
    bpm: song.bpm,
    beatsPerBar: bpb,
    bars: song.bars,
    loopStart: fixed(PAD, 6),
    loopEnd: fixed(PAD + loopSec, 6),
    duration: fixed(m / SR, 4),
    lufs: fixed(lu, 1),
    truePeak: fixed(db(truePeak(L, R)), 2),
    bytes: statSync(file).size,
  };
  manifest.bgm[id] = entry;
  console.log(`♪ ${id.padEnd(8)} ${song.bpm} bpm ${song.bars} bars loop ${loopSec.toFixed(3)}s  ${entry.lufs} LUFS  TP ${entry.truePeak} dBTP  ` +
    `seam jump ${jump.toFixed(4)} (max step ${typ.toFixed(3)}) rms ${rmsBefore.toFixed(1)}/${rmsAfter.toFixed(1)} dB  mp3 wrap step ${wrapStep.toFixed(4)} (local max ${localStep.toFixed(4)})  ` +
    `${(entry.bytes / 1024).toFixed(0)} KB  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (has('--report') || has('--sheet')) {
    const a = analyzeAudio(L, R, SR, { bpm: song.bpm, beatsPerBar: bpb, targetLufs: song.master?.loudness ?? -14 });
    if (has('--report')) console.log(reportText(a).split('\n').map((s) => '    ' + s).join('\n'));
    if (has('--sheet')) sheet(L, R, a, song, id, join(SCRATCH, `${id}.png`));
  }
  if (has('--wav')) writeFileSync(join(SCRATCH, `${id}.wav`), encodeWav(L, R, SR, 16));
}

/* ------------------------------------------------------------------ */
/* SFX                                                                 */
/* ------------------------------------------------------------------ */
/*
 * An SFX JSON is a かなでる effect (preset or layers) or a layered mix of them:
 *   { "mix": [ { "preset": "laser", "at": 0, "gain": -3 }, { "layers": [...] } ],
 *     "post": [ { "type": "gain", "db": 6 }, { "type": "limiter", "ceiling": -1 } ],
 *     "peak": -1, "maxLen": 2 }
 * post = かなでる effect chain applied to the layered result; peak = final peak (dBFS),
 * which sets the relative level of the effects in the game.
 */
const sfxDir = join(HERE, 'sfx');
for (const f of readdirSync(sfxDir).filter((f) => f.endsWith('.json')).sort()) {
  const id = basename(f, '.json');
  if (!want(id)) continue;
  const spec = JSON.parse(readFileSync(join(sfxDir, f), 'utf8'));
  const parts = spec.mix || [spec];
  let L = new Float32Array(0), R = new Float32Array(0);
  for (const part of parts) {
    const { at = 0, gain = 0, ...def } = part;
    const [pl, pr] = renderAnySfx(def, SR);
    const s0 = Math.round(at * SR), need = s0 + pl.length;
    if (need > L.length) { const nl = new Float32Array(need), nr = new Float32Array(need); nl.set(L); nr.set(R); L = nl; R = nr; }
    const g = 10 ** (gain / 20);
    for (let i = 0; i < pl.length; i++) { L[s0 + i] += pl[i] * g; R[s0 + i] += pr[i] * g; }
  }
  // optional post chain on the layered result (e.g. gain + limiter for more weight)
  if (spec.post) applyChain(spec.post, L, R, { sr: SR, bpm: 120, timeAt: (i) => i / SR, start: 0 });
  // mono, trim, peak
  let len = L.length;
  const truncated = spec.maxLen && spec.maxLen * SR < len;
  if (truncated) len = Math.round(spec.maxLen * SR);
  const M = new Float32Array(len);
  for (let i = 0; i < len; i++) M[i] = (L[i] + R[i]) * 0.5;
  let pk = 0;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(M[i]));
  const target = 10 ** ((spec.peak ?? -1) / 20);
  if (pk > 0) for (let i = 0; i < len; i++) M[i] *= target / pk;
  let last = len - 1;
  while (last > 0 && Math.abs(M[last]) < target * 10 ** (-54 / 20)) last--;
  len = Math.min(len, last + Math.round(0.01 * SR));
  const fade = Math.min(len, Math.round((truncated && last >= len - 2 ? 0.2 : 0.012) * SR));
  for (let i = 0; i < fade; i++) M[len - 1 - i] *= i / fade;
  const Mo = M.subarray(0, len);
  const file = join(OUT, 'sfx', `${id}.mp3`);
  encodeMp3(Mo, Mo, file, SFX_KBPS, true);
  const lu = loudness(Mo, Mo, SR);
  const st = sfxStats(Mo, Mo, SR);
  manifest.sfx[id] = { file: `sfx/${id}.mp3?v=${hash(file)}`, duration: fixed(len / SR, 3), peak: spec.peak ?? -1, lufs: Number.isFinite(lu) ? fixed(lu, 1) : null, bytes: statSync(file).size };
  console.log(`♫ ${id.padEnd(12)} ${(len / SR).toFixed(3)}s  peak ${(spec.peak ?? -1)} dB  ${Number.isFinite(lu) ? lu.toFixed(1) : '-'} LUFS  ${JSON.stringify(st)}  ${(manifest.sfx[id].bytes / 1024).toFixed(1)} KB`);
  if (has('--report') || has('--sheet')) {
    const a = analyzeAudio(Mo, Mo, SR, {});
    if (has('--report')) console.log(reportText(a).split('\n').slice(0, 3).map((s) => '    ' + s).join('\n'));
    if (has('--sheet')) sheet(Mo, Mo, a, null, id, join(SCRATCH, `sfx-${id}.png`));
  }
  if (has('--wav')) writeFileSync(join(SCRATCH, `sfx-${id}.wav`), encodeWav(Mo, Mo, SR, 16));
}

/* ------------------------------------------------------------------ */
/* write manifests                                                     */
/* ------------------------------------------------------------------ */
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
manifest.bgm = sortObj(manifest.bgm);
manifest.sfx = sortObj(manifest.sfx);
writeFileSync(manifestJson, JSON.stringify(manifest, null, 2) + '\n');

const ts = `/* Generated by audio-src/build.mjs — do not edit. Regenerate with \`npm run audio\`. */
export interface BgmFile {
  /** Path under \`\${BASE_URL}audio/\` */
  file: string;
  bpm: number;
  beatsPerBar: number;
  /** Loop region in seconds within the decoded file (playback starts at loopStart). */
  loopStart: number;
  loopEnd: number;
}
export interface SfxFile {
  file: string;
  duration: number;
}
export const BGM_FILES = {
${Object.entries(manifest.bgm).map(([k, e]) => `  ${k}: { file: '${e.file}', bpm: ${e.bpm}, beatsPerBar: ${e.beatsPerBar}, loopStart: ${e.loopStart}, loopEnd: ${e.loopEnd} },`).join('\n')}
} as const satisfies Record<string, BgmFile>;
export const SFX_FILES = {
${Object.entries(manifest.sfx).map(([k, e]) => `  ${k}: { file: '${e.file}', duration: ${e.duration} },`).join('\n')}
} as const satisfies Record<string, SfxFile>;
`;
writeFileSync(join(ROOT, 'src', 'audio', 'manifest.ts'), ts);

const total = [...Object.values(manifest.bgm), ...Object.values(manifest.sfx)].reduce((s, e) => s + e.bytes, 0);
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB → public/audio/, src/audio/manifest.ts`);
