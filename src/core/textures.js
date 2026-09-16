// Procedural canvas textures — keeps the whole game asset-free while still
// giving Nuketown its asphalt / siding / shingle / chain-link look.
import * as THREE from 'three';

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, g: c.getContext('2d') };
}

function tex(c, repeat = [1, 1], aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grain(g, size, amount, alpha = 0.06) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    const s = 1 + Math.random() * 2.5;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

function noiseBlobs(g, size, colors, count, min, max) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.beginPath();
    g.ellipse(Math.random() * size, Math.random() * size,
      min + Math.random() * (max - min), min + Math.random() * (max - min),
      Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
}

/* ------------------------------ surfaces ------------------------------ */

function asphalt(size = 256) {
  const { c, g } = canvas(size);
  g.fillStyle = '#31343a'; g.fillRect(0, 0, size, size);
  noiseBlobs(g, size, ['#3a3e44', '#2b2e33', '#43464c', '#26282c'], 260, 2, 9);
  grain(g, size, 4000, 0.05);
  // tar-patched cracks
  g.strokeStyle = 'rgba(20,21,24,.75)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    g.moveTo(x, y);
    for (let s = 0; s < 7; s++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
}

function roadLine(size = 256) {
  const c = asphalt(size);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(226,206,120,.82)';
  for (let y = 10; y < size; y += 64) g.fillRect(size / 2 - 5, y, 10, 40);
  g.globalAlpha = 0.25;
  grain(g, size, 900, 0.15);
  g.globalAlpha = 1;
  return c;
}

function grass(size = 256) {
  const { c, g } = canvas(size);
  g.fillStyle = '#5c6a34'; g.fillRect(0, 0, size, size);
  noiseBlobs(g, size, ['#6c7a3c', '#4d5a2c', '#7b8646', '#57612f', '#8a8f4a'], 420, 3, 14);
  // dry patches — Nevada desert lawn
  noiseBlobs(g, size, ['#8a7f45', '#9a8d4e'], 40, 6, 20);
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = `rgba(${90 + Math.random() * 60 | 0},${100 + Math.random() * 60 | 0},50,.4)`;
    g.lineWidth = 1;
    const x = Math.random() * size, y = Math.random() * size;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 3); g.stroke();
  }
  return c;
}

function dirt(size = 256) {
  const { c, g } = canvas(size);
  g.fillStyle = '#9c8763'; g.fillRect(0, 0, size, size);
  noiseBlobs(g, size, ['#a8946f', '#8e7a57', '#b5a17a', '#82704f'], 300, 4, 16);
  grain(g, size, 5000, 0.07);
  return c;
}

function concrete(size = 256, base = '#9a9a94') {
  const { c, g } = canvas(size);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  noiseBlobs(g, size, ['#9f9f9a', '#94948e', '#a6a6a0'], 120, 3, 9);
  grain(g, size, 6000, 0.035);
  g.strokeStyle = 'rgba(70,70,66,.45)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, size / 2); g.lineTo(size, size / 2); g.stroke();
  return c;
}

function siding(size = 256, light = '#d9c45f', dark = '#b9a445') {
  const { c, g } = canvas(size);
  g.fillStyle = light; g.fillRect(0, 0, size, size);
  const rows = 8, h = size / rows;
  for (let i = 0; i < rows; i++) {
    const grd = g.createLinearGradient(0, i * h, 0, (i + 1) * h);
    grd.addColorStop(0, light);
    grd.addColorStop(0.72, light);
    grd.addColorStop(1, dark);
    g.fillStyle = grd;
    g.fillRect(0, i * h, size, h);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(0, (i + 1) * h - 2, size, 2);
  }
  grain(g, size, 2200, 0.045);
  // weathering streaks
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(90,80,50,${0.03 + Math.random() * 0.05})`;
    g.fillRect(Math.random() * size, 0, 2 + Math.random() * 7, size);
  }
  return c;
}

function brick(size = 256) {
  const { c, g } = canvas(size);
  g.fillStyle = '#8d8478'; g.fillRect(0, 0, size, size);
  const bh = 16, bw = 34;
  for (let y = 0, r = 0; y < size; y += bh, r++) {
    for (let x = (r % 2 ? -bw / 2 : 0); x < size; x += bw) {
      const v = 150 + Math.random() * 45;
      g.fillStyle = `rgb(${v * 0.78 | 0},${v * 0.48 | 0},${v * 0.38 | 0})`;
      g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  }
  grain(g, size, 3200, 0.06);
  return c;
}

function shingle(size = 256) {
  const { c, g } = canvas(size);
  g.fillStyle = '#4a4137'; g.fillRect(0, 0, size, size);
  const rows = 10, h = size / rows, w = size / 6;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 7; i++) {
      const v = 58 + Math.random() * 30;
      g.fillStyle = `rgb(${v | 0},${v * 0.9 | 0},${v * 0.78 | 0})`;
      g.fillRect(i * w + (r % 2 ? w / 2 : 0) - w / 2 + 1, r * h + 1, w - 2, h - 2);
    }
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(0, (r + 1) * h - 2, size, 2);
  }
  grain(g, size, 3000, 0.07);
  return c;
}

function wood(size = 256, base = [150, 108, 66]) {
  const { c, g } = canvas(size);
  const [r, gg, b] = base;
  g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * size;
    g.strokeStyle = `rgba(${r * 0.7 | 0},${gg * 0.7 | 0},${b * 0.66 | 0},${0.1 + Math.random() * 0.3})`;
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
    g.stroke();
  }
  grain(g, size, 2400, 0.05);
  return c;
}

function plank(size = 256) {
  const c = wood(size, [156, 116, 74]);
  const g = c.getContext('2d');
  for (let x = 0; x < size; x += size / 8) {
    g.fillStyle = 'rgba(48,32,18,.55)';
    g.fillRect(x, 0, 2.5, size);
  }
  return c;
}

function plaster(size = 256, base = '#cdc6ba') {
  const { c, g } = canvas(size);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  // fine roller texture: soft vertical streaks plus grain, no big blotches
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.03})`;
    g.fillRect(Math.random() * size, 0, 1 + Math.random() * 6, size);
    g.fillStyle = `rgba(90,82,70,${0.01 + Math.random() * 0.025})`;
    g.fillRect(Math.random() * size, 0, 1 + Math.random() * 4, size);
  }
  grain(g, size, 5200, 0.028);
  // a couple of faint damp patches near the floor line
  for (let i = 0; i < 2; i++) {
    const x = Math.random() * size, y = size * (0.72 + Math.random() * 0.25);
    const grd = g.createRadialGradient(x, y, 2, x, y, 26 + Math.random() * 22);
    grd.addColorStop(0, 'rgba(126,110,82,.10)');
    grd.addColorStop(1, 'rgba(126,110,82,0)');
    g.fillStyle = grd;
    g.fillRect(x - 60, y - 60, 120, 120);
  }
  return c;
}

function carpet(size = 128) {
  const { c, g } = canvas(size);
  g.fillStyle = '#6d4436'; g.fillRect(0, 0, size, size);
  noiseBlobs(g, size, ['#74493a', '#653f32'], 60, 6, 18);
  grain(g, size, 7000, 0.07);
  return c;
}

function tiles(size = 256) {
  const { c, g } = canvas(size);
  g.fillStyle = '#b9b3a4'; g.fillRect(0, 0, size, size);
  const n = 4, s = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? '#c9c3b2' : '#8e8a7c';
    g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
  }
  grain(g, size, 2400, 0.05);
  return c;
}

function metal(size = 128, base = '#8f959b') {
  const { c, g } = canvas(size);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) {
    g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    g.beginPath();
    const y = Math.random() * size;
    g.moveTo(0, y); g.lineTo(size, y + (Math.random() - 0.5) * 3);
    g.stroke();
  }
  // rust
  noiseBlobs(g, size, ['rgba(140,74,34,.3)', 'rgba(108,56,26,.26)'], 14, 1.5, 4.5);
  return c;
}

function busPaint(size = 128) {
  const c = metal(size, '#e5b52a');
  const g = c.getContext('2d');
  noiseBlobs(g, size, ['rgba(150,112,28,.16)', 'rgba(224,182,60,.2)'], 16, 2, 6);
  return c;
}

function chainlink(size = 128) {
  const { c, g } = canvas(size);
  g.clearRect(0, 0, size, size);
  g.strokeStyle = 'rgba(196,201,206,.92)';
  g.lineWidth = 2.5;
  const step = size / 8;
  for (let i = -size; i < size * 2; i += step) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + size, size); g.stroke();
    g.beginPath(); g.moveTo(i + size, 0); g.lineTo(i, size); g.stroke();
  }
  return c;
}

function window_(size = 128) {
  // Mostly transparent: you can see (and shoot) through Nuketown's windows.
  const { c, g } = canvas(size);
  g.clearRect(0, 0, size, size);
  // faint blue wash + a diagonal sheen so the pane still catches the light
  g.fillStyle = 'rgba(150,190,210,.13)';
  g.fillRect(0, 0, size, size);
  const sheen = g.createLinearGradient(0, size, size, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,.16)');
  sheen.addColorStop(0.55, 'rgba(255,255,255,.05)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, size, size);
  // frame + mullions are solid
  g.fillStyle = '#d9d3c6';
  g.fillRect(0, 0, size, 5); g.fillRect(0, size - 5, size, 5);
  g.fillRect(0, 0, 5, size); g.fillRect(size - 5, 0, 5, size);
  g.fillRect(size / 2 - 3, 0, 6, size);
  g.fillRect(0, size / 2 - 3, size, 6);
  g.fillStyle = 'rgba(120,114,102,.55)';
  g.fillRect(size / 2 + 3, 0, 2, size);
  g.fillRect(0, size / 2 + 3, size, 2);
  return c;
}

function garageDoor(size = 256) {
  const { c, g } = canvas(size);
  g.fillStyle = '#cfd3d6'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 6; i++) {
    const y = i * (size / 6);
    g.fillStyle = i % 2 ? '#c3c7cb' : '#d6dade';
    g.fillRect(0, y, size, size / 6);
    g.strokeStyle = 'rgba(80,84,88,.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke();
    for (let p = 0; p < 3; p++) {
      g.strokeStyle = 'rgba(90,94,98,.4)'; g.lineWidth = 3;
      g.strokeRect(10 + p * (size - 20) / 3, y + 8, (size - 20) / 3 - 10, size / 6 - 16);
    }
  }
  grain(g, size, 1600, 0.05);
  return c;
}

function door(size = 256) {
  const c = wood(size, [122, 74, 48]);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(40,22,10,.6)'; g.lineWidth = 5;
  g.strokeRect(20, 18, size - 40, size * 0.42);
  g.strokeRect(20, size * 0.54, size - 40, size * 0.4);
  g.fillStyle = '#d8c070';
  g.beginPath(); g.arc(size - 34, size / 2, 6, 0, Math.PI * 2); g.fill();
  return c;
}

function sky(size = 512) {
  const { c, g } = canvas(size);
  const grd = g.createLinearGradient(0, 0, 0, size);
  grd.addColorStop(0.00, '#2a4a75');
  grd.addColorStop(0.35, '#6d8fb0');
  grd.addColorStop(0.62, '#c9b490');
  grd.addColorStop(0.78, '#e6b06a');
  grd.addColorStop(1.00, '#d98c4a');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // hazy desert clouds
  for (let i = 0; i < 70; i++) {
    const y = size * (0.12 + Math.random() * 0.42);
    const x = Math.random() * size;
    const w = 40 + Math.random() * 190, h = 6 + Math.random() * 22;
    const cg = g.createRadialGradient(x, y, 1, x, y, w / 2);
    cg.addColorStop(0, `rgba(255,240,222,${0.05 + Math.random() * 0.13})`);
    cg.addColorStop(1, 'rgba(255,240,222,0)');
    g.fillStyle = cg;
    g.save(); g.translate(x, y); g.scale(1, h / (w / 2)); g.translate(-x, -y);
    g.beginPath(); g.arc(x, y, w / 2, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  return c;
}

/** Big "NUKETOWN" welcome billboard, painted straight onto a canvas. */
function nuketownSign(w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b8352a'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#b8352a';
  g.font = 'bold 44px Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('WELCOME TO', w / 2, 74);
  g.fillStyle = '#1f2833';
  g.font = 'bold 92px Impact, sans-serif';
  g.fillText('NUKETOWN', w / 2, 158);
  g.fillStyle = '#4a5560';
  g.font = 'bold 22px Impact, sans-serif';
  g.fillText('POP. 2 · NEVADA TEST SITE', w / 2, 196);
  g.fillStyle = '#b8352a';
  g.font = 'bold 17px Impact, sans-serif';
  g.fillText('★ SURVIVAL TOWN — DO NOT REMAIN ★', w / 2, 224);
  // sun-bleached wear
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${190 + Math.random() * 50 | 0},170,.05)`;
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
  return c;
}

function falloutSign(size = 256) {
  const { c, g } = canvas(size);
  g.fillStyle = '#e2c22c'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#1c1c1c';
  g.translate(size / 2, size / 2);
  for (let i = 0; i < 3; i++) {
    g.rotate((Math.PI * 2) / 3);
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, size * 0.36, -0.52, 0.52);
    g.closePath(); g.fill();
  }
  g.beginPath(); g.arc(0, 0, size * 0.09, 0, Math.PI * 2); g.fill();
  g.setTransform(1, 0, 0, 1, 0, 0);
  grain(g, size, 900, 0.07);
  return c;
}

/* --------------------------- public factory --------------------------- */

export function buildTextures() {
  const T = {
    asphalt: tex(asphalt(), [6, 6]),
    road: tex(roadLine(), [1, 10]),
    grass: tex(grass(), [10, 10]),
    dirt: tex(dirt(), [8, 8]),
    concrete: tex(concrete(), [3, 3]),
    concreteDark: tex(concrete(256, '#7d7d78'), [2, 2]),
    sidingYellow: tex(siding(256, '#dcc05c', '#b89f42'), [3, 2]),
    sidingGreen: tex(siding(256, '#8fae86', '#6f8e68'), [3, 2]),
    sidingBlue: tex(siding(256, '#93b3c4', '#6f8fa2'), [3, 2]),
    sidingCream: tex(siding(256, '#e3dcc4', '#c6bfa6'), [3, 2]),
    brick: tex(brick(), [3, 3]),
    shingle: tex(shingle(), [4, 4]),
    wood: tex(wood(), [2, 2]),
    plank: tex(plank(), [2, 2]),
    plaster: tex(plaster(), [2, 2]),
    plasterWarm: tex(plaster(256, '#d8c9a8'), [2, 2]),
    carpet: tex(carpet(), [4, 4]),
    tiles: tex(tiles(), [3, 3]),
    metal: tex(metal(), [2, 2]),
    busPaint: tex(busPaint(), [2, 1]),
    chainlink: tex(chainlink(), [8, 2]),
    window: tex(window_(), [1, 1]),
    garage: tex(garageDoor(), [1, 1]),
    door: tex(door(), [1, 1]),
    sky: tex(sky(), [1, 1]),
    sign: tex(nuketownSign(), [1, 1]),
    fallout: tex(falloutSign(), [1, 1]),
  };
  T.sky.wrapS = T.sky.wrapT = THREE.ClampToEdgeWrapping;
  T.sign.wrapS = T.sign.wrapT = THREE.ClampToEdgeWrapping;
  return T;
}
