/**
 * Title heroine + "turn-around transformation".
 *
 * On the title screen the heroine is shown as the original 2D illustration
 * (public/title/heroine_front.webp) on a camera-facing card. When the game
 * starts she turns around: the card spins edge-on while flashing white, then
 * the 3D model takes over mid-turn (white-hot, sparkles + shockwave hide the
 * swap) and finishes the turn so her back faces the gameplay camera.
 */
import * as THREE from 'three';
import { PALETTE, PLAYER } from '../core/config';
import { CHEST_Y } from '../character/heroineGeometry';
import type { Player } from './Player';
import type { Effects } from './Effects';

const CARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uWhite;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  // Light sweep across the card while it turns.
  float sweep = smoothstep(0.18, 0.0, abs(vUv.x + vUv.y * 0.35 - uTime)) * uWhite;
  vec3 c = mix(t.rgb, vec3(1.0, 0.98, 0.94), clamp(uWhite + sweep, 0.0, 1.0));
  float a = t.a * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  p.y *= 0.62;
  float r = length(p);
  float g = exp(-r * r * 4.5) * (0.85 + 0.15 * sin(uTime * 1.3));
  vec3 c = mix(uC1, uC2, smoothstep(-0.6, 0.6, p.y + 0.2 * sin(uTime * 0.7)));
  gl_FragColor = vec4(c * g * uAlpha * 0.55, 1.0);
}`;

const CIRCLE_FRAG = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
float band(float x, float c, float w) { return 1.0 - smoothstep(0.0, w, abs(x - c)); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float rings = band(r, 0.95, 0.02) + band(r, 0.82, 0.012) * 0.8 + band(r, 0.5, 0.012) * 0.6;
  float ticks = step(0.86, r) * step(r, 0.92) * smoothstep(0.3, 0.45, abs(fract((a + uTime * 0.25) * 24.0 / 6.28318) - 0.5));
  float a3 = a - uTime * 0.18;
  float tri = band(r * cos(mod(a3, 2.0944) - 1.0472), 0.41, 0.012) * step(r, 0.83);
  float tri2 = band(r * cos(mod(a3 + 1.0472, 2.0944) - 1.0472), 0.41, 0.012) * step(r, 0.83);
  float fill = exp(-r * 2.5) * 0.25;
  vec3 c = uC1 * (rings + ticks * 0.6 + fill) + uC2 * (tri + tri2) * 0.8;
  gl_FragColor = vec4(c * uAlpha, 1.0);
}`;

type Phase = 'hidden' | 'card' | 'turnCard' | 'turnModel' | 'enter';

/** Seconds: card spins to edge-on, then the model finishes the turn. */
const T_CARD = 0.42;
const T_MODEL = 0.85;
const T_ENTER = 0.5;
/** Card turn angle at which the 3D model takes over (before edge-on, so it never vanishes). */
const SWAP_ANGLE = 1.15;

const easeInOut = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

export class TitleIntro {
  readonly group = new THREE.Group();
  private card: THREE.Mesh;
  private cardMat: THREE.ShaderMaterial;
  private glow: THREE.Mesh;
  private glowMat: THREE.ShaderMaterial;
  private circle: THREE.Mesh;
  private circleMat: THREE.ShaderMaterial;
  private ready = false;
  private phase: Phase = 'hidden';
  private t = 0;
  private time = 0;
  private fxAlpha = 0;
  private cardH = PLAYER.modelHeight * 1.04;

  /** True while the turn is playing; the game should hold player input. */
  get busy(): boolean {
    return this.phase === 'turnCard' || this.phase === 'turnModel';
  }

  /** True once the camera may swoop to the gameplay framing. */
  get releaseCamera(): boolean {
    return this.phase === 'hidden' || (this.phase === 'turnModel' && this.t > T_MODEL * 0.45);
  }

  constructor(private player: Player, private effects: Effects) {
    this.cardMat = new THREE.ShaderMaterial({
      vertexShader: CARD_VERT,
      fragmentShader: CARD_FRAG,
      uniforms: {
        uMap: { value: null },
        uWhite: { value: 0 },
        uAlpha: { value: 1 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.cardMat);
    this.card.renderOrder = 5;
    this.card.frustumCulled = false;
    this.card.visible = false;

    const glowUniforms = () => ({
      uC1: { value: new THREE.Color(PALETTE.purple) },
      uC2: { value: new THREE.Color(PALETTE.cyan) },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
    });
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: CARD_VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: glowUniforms(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), this.glowMat);
    this.glow.renderOrder = 4;
    this.glow.frustumCulled = false;

    this.circleMat = new THREE.ShaderMaterial({
      vertexShader: CARD_VERT,
      fragmentShader: CIRCLE_FRAG,
      uniforms: { ...glowUniforms(), uC1: { value: new THREE.Color(PALETTE.cyan) }, uC2: { value: new THREE.Color(PALETTE.gold) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.circle = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), this.circleMat);
    this.circle.rotation.x = -Math.PI / 2;
    this.circle.renderOrder = 3;
    this.circle.frustumCulled = false;

    this.group.add(this.glow, this.circle, this.card);

    new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}title/heroine_front.webp`,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const img = tex.image as { width: number; height: number };
        this.card.scale.set((this.cardH * img.width) / img.height, this.cardH, 1);
        this.cardMat.uniforms.uMap.value = tex;
        this.ready = true;
      },
      undefined,
      () => {
        // No illustration: the 3D model simply stays on the title screen.
        this.ready = false;
      },
    );
  }

  /** Title screen: show the illustration (with a flash-out of the 3D model unless instant). */
  showTitle(instant: boolean): void {
    this.phase = instant ? 'card' : 'enter';
    this.t = 0;
  }

  /** Game start. Returns false when there is no illustration to transform from. */
  beginTurn(): boolean {
    if (!this.ready || (this.phase !== 'card' && this.phase !== 'enter')) {
      this.phase = 'hidden';
      return false;
    }
    this.phase = 'turnCard';
    this.t = 0;
    return true;
  }

  /** Hide immediately (result screen keeps the 3D model). */
  hide(): void {
    this.phase = 'hidden';
    this.player.heroine.flash = 0;
  }

  /** Call after Player.update each frame. */
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    this.t += dt;
    const p = this.player.position;
    const heroine = this.player.heroine;
    const feetY = p.y - CHEST_Y * PLAYER.modelHeight;

    // Billboard the card around Y toward the camera.
    const face = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    let spin = 0;
    let white = 0;
    let cardOn = false;
    let modelOn = true;
    let fxTarget = 0;

    switch (this.phase) {
      case 'card':
        cardOn = this.ready;
        modelOn = !this.ready;
        fxTarget = 1;
        break;
      case 'enter': {
        // Model flashes white, then the illustration fades in from white.
        const u = this.t / T_ENTER;
        if (!this.ready) {
          this.phase = 'card';
          break;
        }
        if (u < 0.4) {
          heroine.flash = u / 0.4;
        } else {
          heroine.flash = 0;
          modelOn = false;
          cardOn = true;
          white = 1 - easeOut((u - 0.4) / 0.6);
          if (u >= 1) this.phase = 'card';
        }
        fxTarget = 1;
        break;
      }
      case 'turnCard': {
        const u = Math.min(1, this.t / T_CARD);
        spin = easeInOut(u) * SWAP_ANGLE;
        white = easeInOut(u);
        cardOn = true;
        modelOn = false;
        fxTarget = 1 - u * 0.5;
        if (u >= 1) {
          this.phase = 'turnModel';
          this.t = 0;
          // Hide the swap: sparkles and a shockwave at the chest.
          this.effects.burst(p.x, p.y, p.z, PALETTE.gold, 40, 3.2, 0.07, 0.9);
          this.effects.burst(p.x, p.y, p.z, PALETTE.cyan, 30, 4, 0.06, 0.7);
          this.effects.burst(p.x, p.y + 0.3, p.z, PALETTE.white, 14, 2, 0.09, 0.5);
          this.effects.ring(p.x, p.y, p.z, PALETTE.white, 1.1, 0.4);
        }
        break;
      }
      case 'turnModel': {
        const u = Math.min(1, this.t / T_MODEL);
        // The card was turned SWAP_ANGLE from facing the camera; the model continues
        // from that angle (yaw π + SWAP_ANGLE) to its back facing the camera (2π ≡ 0).
        this.player.setYaw(Math.PI + SWAP_ANGLE + easeOut(u) * (Math.PI - SWAP_ANGLE));
        heroine.flash = 1 - easeOut(Math.min(1, u * 1.3));
        fxTarget = 0;
        if (u >= 1) {
          this.player.setYaw(0);
          heroine.flash = 0;
          this.phase = 'hidden';
        }
        break;
      }
      case 'hidden':
        break;
    }

    this.card.visible = cardOn;
    heroine.group.visible = modelOn;
    if (cardOn) {
      const breathe = 1 + Math.sin(this.time * 1.7) * 0.004;
      this.card.position.set(p.x, feetY + (this.cardH * breathe) / 2 - 0.01, p.z);
      this.card.rotation.set(0, face + spin, 0);
      this.card.scale.y = this.cardH * breathe;
      this.cardMat.uniforms.uWhite.value = white;
      this.cardMat.uniforms.uTime.value = -0.3 + Math.min(1, this.t / T_CARD) * 1.8;
    }

    this.fxAlpha += (fxTarget - this.fxAlpha) * (1 - Math.exp(-dt * 5));
    const showFx = this.fxAlpha > 0.01;
    this.glow.visible = this.circle.visible = showFx;
    if (showFx) {
      this.glow.position.set(p.x, p.y + 0.05, p.z - 0.25);
      this.glow.rotation.set(0, face, 0);
      this.circle.position.set(p.x, feetY + 0.005, p.z);
      for (const m of [this.glowMat, this.circleMat]) {
        m.uniforms.uAlpha.value = this.fxAlpha;
        m.uniforms.uTime.value = this.time;
      }
    }
  }
}
