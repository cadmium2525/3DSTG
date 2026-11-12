/**
 * Danmaku dev page: /dev/danmaku.html
 *   ?pattern=spiralCorridor|petalBloom|rippleRing|constellationRain|aimedBurst|wingSweep|cometTrail|jellyRing|boss  (comma list = simultaneous)
 *   &intensity=0.5 &seed=1 &quality=2 &duration=15
 *   &auto=1 (dodge bot) | auto=0 (stationary / drag the dot)
 *   &t=6 &hold=1  (pre-simulate 6 s, then freeze — for screenshots)
 *   ?fairness=1   (headless fairness table for all patterns; &hard=1 = intensity × DIFFICULTY.hard.bullet)
 */
import * as THREE from 'three';
import { CAMERA, FIELD, PALETTE, PLAYER } from '../src/core/config';
import { PATTERN_NAMES, type PatternId } from '../src/core/types';
import { createDanmakuWithSim } from '../src/danmaku/index';
import { bossOrigin, DodgeBot, runFairness } from '../src/danmaku/bot';
import { STAGE2_PATTERNS } from '../src/danmaku/stage2';
import { DIFFICULTY } from '../src/game/stages/types';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const ALL: PatternId[] = ['spiralCorridor', 'petalBloom', 'rippleRing', 'constellationRain', 'aimedBurst', 'wingSweep', 'cometTrail', 'jellyRing', ...STAGE2_PATTERNS];

if (q.get('fairness') === '1') {
  const out = document.getElementById('out')!;
  out.style.display = 'block';
  const I = Math.min(1, num('intensity', 0.5) * (q.has('hard') ? DIFFICULTY.hard.bullet : 1));
  const lines = [`fairness${q.has('hard') ? ' HARD' : ''}  intensity=${I}  15 s  dt=1/30  10 seeds\n`];
  out.textContent = lines.join('\n');
  setTimeout(() => {
    for (const p of ALL) {
      const r = runFairness(p, { intensity: I, quality: num('quality', 2) as 0 | 1 | 2 });
      lines.push(
        `${p.padEnd(18)} bot survived ${r.botSurvived}/${r.seeds} (hits ${r.botHits})  ` +
          `stationary hit ${r.stationaryHitRuns}/${r.seeds} (first ${r.stationaryFirstHit.toFixed(1)}s)  peak ${r.peak}  avg ${r.avgAlive.toFixed(0)}`,
      );
      out.textContent = lines.join('\n');
    }
    (window as unknown as { __fairness: string }).__fairness = out.textContent;
  }, 50);
} else {
  runDemo();
}

function runDemo(): void {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.bg);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 9 / 19.5, 0.1, 400);

  function resize(): void {
    const W = innerWidth, H = innerHeight;
    let w = W, h = (W * 19.5) / 9;
    if (h > H) { h = H; w = (H * 9) / 19.5; }
    renderer.setSize(Math.floor(w), Math.floor(h));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  // Backdrop: stars + field frame on the play plane.
  {
    const n = 700, pos = new Float32Array(n * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 220; pos[i * 3 + 1] = (r() - 0.5) * 300; pos[i * 3 + 2] = -90 - r() * 120;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8890c0, size: 0.6, sizeAttenuation: true })));
    const fw = FIELD.halfW, fh = FIELD.halfH;
    const frame = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-fw, -fh, 0), new THREE.Vector3(fw, -fh, 0), new THREE.Vector3(fw, fh, 0),
      new THREE.Vector3(-fw, fh, 0), new THREE.Vector3(-fw, -fh, 0),
    ]);
    scene.add(new THREE.Line(frame, new THREE.LineBasicMaterial({ color: 0x2a2450 })));
  }

  // Dummy player: hitbox dot + graze ring.
  const player = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(PLAYER.hitRadius * 1.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLAYER.grazeRadius * 0.95, PLAYER.grazeRadius, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.pink, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  const body = new THREE.Mesh(
    new THREE.CircleGeometry(0.32, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.heroineBlue, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  player.add(body, ring, dot);
  scene.add(player);

  // Boss stand-in.
  const boss = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0x3a2a70 }));
  scene.add(boss);

  const { danmaku: dm, sim } = createDanmakuWithSim();
  scene.add(dm.object3d);
  dm.setQuality(num('quality', 2) as 0 | 1 | 2);

  const intensity = num('intensity', 0.5);
  const seed = num('seed', 1);
  const duration = num('duration', 15);
  const auto = num('auto', 1);
  const patParam = q.get('pattern') ?? 'spiralCorridor';
  const bot = new DodgeBot();
  const P = { x: 0, y: 0, z: 0 };
  const O = { x: 0, y: 0, z: 0 };
  let simT = 0, patT = 0, hits = 0, grazes = 0, inv = 0, stage = 0;
  const origin = () => bossOrigin(simT, O);

  const BOSS: [PatternId[], number][] = [
    [['spiralCorridor'], 13], [['petalBloom'], 13], [['rippleRing', 'constellationRain'], 15],
  ];
  function startCurrent(): string {
    let ids: PatternId[];
    let dur = duration;
    let inten = intensity;
    if (patParam === 'boss') {
      const s = BOSS[stage % BOSS.length];
      ids = s[0]; dur = s[1];
      if (ids.length > 1) inten = intensity * 0.75;
    } else ids = patParam.split(',') as PatternId[];
    for (const id of ids) dm.startPattern(id, { origin, duration: dur, intensity: inten, seed: seed + stage * 31 });
    patT = dur + 3.5;
    return ids.map((i) => `${i} ${PATTERN_NAMES[i]}`).join(' + ');
  }
  let label = startCurrent();

  // Drag (relative, like the game).
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => (dragging = false));
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const k = PLAYER.dragScale / canvas.clientHeight;
    P.x = Math.max(-FIELD.halfW, Math.min(FIELD.halfW, P.x + (e.clientX - lx) * k));
    P.y = Math.max(-FIELD.halfH, Math.min(FIELD.halfH, P.y - (e.clientY - ly) * k));
    lx = e.clientX; ly = e.clientY;
    bot.reset(P.x, P.y);
  });

  function step(dt: number): void {
    if (auto === 1 && !dragging) {
      bot.update(dt, sim.pool);
      P.x = bot.x; P.y = bot.y;
    }
    const r = dm.update(dt, P, inv <= 0);
    simT += dt; patT -= dt; inv -= dt;
    if (r.hit) { hits++; inv = PLAYER.invincibleSec; }
    grazes += r.grazes;
    if (patT <= 0) { stage++; label = startCurrent(); }
  }

  function place(): void {
    player.position.set(P.x, P.y, 0);
    player.visible = true;
    dot.material.color.set(inv > 0 && Math.floor(inv * 10) % 2 ? 0xff4060 : 0xffffff);
    camera.position.set(P.x * CAMERA.followX, P.y * CAMERA.followY + CAMERA.height, CAMERA.distance);
    camera.lookAt(P.x * CAMERA.followX, P.y * CAMERA.followY, 0);
    const o = origin();
    boss.position.set(o.x, o.y, o.z - 2.5);
  }

  let frames = 0, fpsT = 0, fps = 0;
  function hudText(): void {
    hud.textContent =
      `${label}\nI=${intensity} q=${num('quality', 2)} t=${simT.toFixed(1)}  bullets ${dm.activeCount}\n` +
      `hits ${hits}  graze ${grazes}  fps ${fps.toFixed(0)}  ${auto ? 'bot' : 'manual'}`;
  }

  const pre = num('t', 0);
  const hold = q.get('hold') === '1';
  for (let t = 0; t < pre; t += 1 / 60) step(1 / 60);
  place();
  hudText();
  renderer.render(scene, camera);

  let last = performance.now();
  let paused = hold;
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) step(dt);
    frames++; fpsT += dt;
    if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    place();
    hudText();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('keydown', (e) => {
    if (e.key === ' ') paused = !paused;
    if (e.key === 'c') dm.clear(); // bomb-style clear test
  });

  (window as unknown as Record<string, unknown>).__dm = {
    advance(sec: number) { for (let t = 0; t < sec; t += 1 / 60) step(1 / 60); place(); hudText(); renderer.render(scene, camera); },
    stats: () => ({ t: simT, bullets: dm.activeCount, hits, grazes }),
    pause: (p: boolean) => (paused = p),
    clear: (r?: number) => (r === undefined ? dm.clear() : dm.clear(P, r)),
  };
}
