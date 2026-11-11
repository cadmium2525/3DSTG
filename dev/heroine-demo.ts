// Dev page: 4-view turnaround of the heroine (front / left / right / back).
// Params: ?bg=hex  ?vx=0.8 (simulate lateral motion)  ?spin=1  ?zoom=head
import * as THREE from 'three';
import { Heroine } from '../src/character/Heroine';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
const bg = new THREE.Color(q.get('bg') ? Number('0x' + q.get('bg')) : 0x8a8f9c);
const heroine = new Heroine();
scene.add(heroine.group);
const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 50);
const vx = Number(q.get('vx') ?? 0);
const vy = Number(q.get('vy') ?? 0);
const head = q.get('zoom') === 'head';
const angles = [Math.PI, Math.PI / 2, -Math.PI / 2, 0]; // heroine faces -Z

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  heroine.update(dt, { vx, vy });
  renderer.setScissorTest(true);
  const spin = q.get('spin') ? now / 1500 : 0;
  for (let i = 0; i < 4; i++) {
    const w = W / 4;
    renderer.setViewport(i * w, 0, w, H);
    renderer.setScissor(i * w, 0, w, H);
    renderer.setClearColor(bg);
    renderer.clear();
    cam.aspect = w / H;
    cam.fov = head ? 7 : 22;
    cam.updateProjectionMatrix();
    const a = angles[i] + spin;
    const ty = head ? 0.27 : -0.1;
    cam.position.set(Math.sin(a) * 4.2, ty + 0.15, Math.cos(a) * 4.2);
    cam.lookAt(0, ty, 0);
    renderer.render(scene, cam);
  }
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
