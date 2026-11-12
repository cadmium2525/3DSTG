// Dev page: heroine and shadow girl side by side, front and back. ?zoom=head
import * as THREE from 'three';
import { Heroine } from '../src/character/Heroine';
import { ShadowGirl } from '../src/character/ShadowGirl';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') ? Number('0x' + q.get('bg')) : 0x14102a);
const hero = new Heroine();
hero.group.position.x = -0.5;
hero.group.rotation.y = Math.PI; // face camera
const shadow = new ShadowGirl();
shadow.group.position.x = 0.5;
scene.add(hero.group, shadow.group);
const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
const head = q.get('zoom') === 'head';
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  hero.update(dt, { vx: 0, vy: 0 });
  shadow.update(dt, 0);
  renderer.setScissorTest(true);
  for (let i = 0; i < 2; i++) {
    const w = W / 2;
    renderer.setViewport(i * w, 0, w, H);
    renderer.setScissor(i * w, 0, w, H);
    cam.aspect = w / H;
    cam.fov = head ? 9 : 26;
    cam.updateProjectionMatrix();
    const a = i === 0 ? 0 : Math.PI;
    const ty = head ? 0.27 : -0.12;
    // Head mode: viewport 0 = heroine (front), viewport 1 = shadow girl (front).
    const tx = head ? (i === 0 ? -0.5 : 0.5) : 0;
    const ha = head ? (i === 0 ? Math.PI : 0) : a;
    cam.position.set(tx + Math.sin(ha) * 4.5, ty + 0.1, Math.cos(ha) * 4.5);
    cam.lookAt(tx, ty, 0);
    renderer.render(scene, cam);
  }
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
