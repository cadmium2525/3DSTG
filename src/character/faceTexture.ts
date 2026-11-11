import * as THREE from 'three';

/**
 * Face decal drawn on a canvas. It is planar-projected onto the front of the
 * head: canvas centre = centre of the head, canvas edges = head silhouette.
 * Transparent everywhere except eyes, brows, mouth and blush.
 */
export function createFaceTexture(): THREE.Texture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, S, S);

  // Head-normalised coords (-1..1, y up) -> canvas pixels.
  const X = (x: number) => (x * 0.5 + 0.5) * S;
  const Y = (y: number) => (0.5 - y * 0.5) * S;
  const L = (v: number) => v * 0.5 * S;

  // Blush
  for (const sx of [-1, 1]) {
    const cx = X(sx * 0.5);
    const cy = Y(-0.36);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, L(0.2));
    grad.addColorStop(0, 'rgba(255,128,128,0.42)');
    grad.addColorStop(1, 'rgba(255,128,128,0)');
    g.fillStyle = grad;
    g.fillRect(cx - L(0.25), cy - L(0.25), L(0.5), L(0.5));
  }

  for (const sx of [-1, 1]) {
    const cx = X(sx * 0.37);
    const cy = Y(-0.13);
    const rw = L(0.15);
    const rh = L(0.2);

    g.save();
    g.translate(cx, cy);

    // Sclera
    g.beginPath();
    g.ellipse(0, 0, rw * 1.04, rh, 0, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.save();
    g.clip();

    // Soft shadow under the upper lid
    const lid = g.createLinearGradient(0, -rh, 0, -rh * 0.3);
    lid.addColorStop(0, 'rgba(120,130,170,0.55)');
    lid.addColorStop(1, 'rgba(120,130,170,0)');
    g.fillStyle = lid;
    g.fillRect(-rw * 1.2, -rh, rw * 2.4, rh);

    // Iris
    const ix = -sx * rw * 0.06;
    const irw = rw * 0.82;
    const irh = rh * 0.9;
    const iris = g.createLinearGradient(0, -irh, 0, irh);
    iris.addColorStop(0, '#12307f');
    iris.addColorStop(0.45, '#2f6fe0');
    iris.addColorStop(1, '#8fd6ff');
    g.beginPath();
    g.ellipse(ix, rh * 0.06, irw, irh, 0, 0, Math.PI * 2);
    g.fillStyle = iris;
    g.fill();
    g.lineWidth = L(0.012);
    g.strokeStyle = '#0d2466';
    g.stroke();

    // Pupil
    g.beginPath();
    g.ellipse(ix, rh * 0.02, irw * 0.42, irh * 0.5, 0, 0, Math.PI * 2);
    g.fillStyle = '#0a1c55';
    g.fill();

    // Lower glow
    g.beginPath();
    g.ellipse(ix, rh * 0.62, irw * 0.55, irh * 0.24, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(200,245,255,0.55)';
    g.fill();

    // Highlights
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(ix - rw * 0.3, -rh * 0.42, rw * 0.25, rh * 0.2, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(ix + rw * 0.34, rh * 0.36, rw * 0.1, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // Upper lash line (thick, flicks outward)
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#4a2c22';
    g.lineWidth = L(0.042);
    g.beginPath();
    g.moveTo(-sx * rw * 1.02, -rh * 0.52);
    g.quadraticCurveTo(-sx * rw * 0.2, -rh * 1.22, sx * rw * 0.72, -rh * 0.86);
    g.quadraticCurveTo(sx * rw * 1.12, -rh * 0.62, sx * rw * 1.3, -rh * 0.2);
    g.stroke();
    g.lineWidth = L(0.022);
    g.beginPath();
    g.moveTo(sx * rw * 1.12, -rh * 0.58);
    g.lineTo(sx * rw * 1.46, -rh * 0.78);
    g.stroke();

    // Lower lash hint
    g.lineWidth = L(0.012);
    g.strokeStyle = 'rgba(110,70,60,0.8)';
    g.beginPath();
    g.moveTo(-sx * rw * 0.5, rh * 1.02);
    g.quadraticCurveTo(sx * rw * 0.2, rh * 1.1, sx * rw * 0.8, rh * 0.86);
    g.stroke();

    // Eyebrow
    g.lineWidth = L(0.018);
    g.strokeStyle = 'rgba(176,128,70,0.9)';
    g.beginPath();
    g.moveTo(-sx * rw * 0.9, -rh * 1.62);
    g.quadraticCurveTo(sx * rw * 0.1, -rh * 1.86, sx * rw * 1.1, -rh * 1.56);
    g.stroke();

    g.restore();
  }

  // Nose hint
  g.fillStyle = 'rgba(214,140,120,0.55)';
  g.beginPath();
  g.ellipse(X(0), Y(-0.4), L(0.012), L(0.016), 0, 0, Math.PI * 2);
  g.fill();

  // Gentle closed smile
  g.strokeStyle = '#b85c5c';
  g.lineWidth = L(0.016);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(X(-0.085), Y(-0.565));
  g.quadraticCurveTo(X(0), Y(-0.64), X(0.085), Y(-0.565));
  g.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
