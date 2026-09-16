// Hitscan resolution, bullet impact FX, and frag grenades.
import * as THREE from 'three';
import { clamp, Pool, rand } from '../core/util.js';

/* ------------------------------- hitboxes ------------------------------- */

/** Ray vs one actor. Returns {t, zone, mult} of the closest box, or null. */
export function rayActor(a, ox, oy, oz, dx, dy, dz, maxDist, W) {
  if (!a.alive) return null;
  const h = a.height;
  const boxes = [
    { cy: h - 0.15, hx: 0.17, hy: 0.16, hz: 0.17, zone: 'head', mult: W ? W.headMult : 1.5 },
    { cy: h * 0.72, hx: 0.27, hy: h * 0.2, hz: 0.2, zone: 'chest', mult: 1 },
    { cy: h * 0.32, hx: 0.24, hy: h * 0.22, hz: 0.2, zone: 'legs', mult: W ? W.limbMult : 0.9 },
  ];
  let best = null;
  for (const b of boxes) {
    const minX = a.pos.x - b.hx, maxX = a.pos.x + b.hx;
    const minY = a.pos.y + b.cy - b.hy, maxY = a.pos.y + b.cy + b.hy;
    const minZ = a.pos.z - b.hz, maxZ = a.pos.z + b.hz;
    let t0 = 0, t1 = maxDist;
    let ok = true;
    for (const [o, d, lo, hi] of [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]]) {
      if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) { ok = false; break; }
    }
    if (!ok || t0 < 0) continue;
    if (!best || t0 < best.t) best = { t: t0, zone: b.zone, mult: b.mult, actor: a };
  }
  return best;
}

/**
 * Fire one ray. Returns a resolution object describing what it struck.
 * `actors` excludes the shooter.
 */
export function hitscan(collider, actors, origin, dir, range, W) {
  const world = collider.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
  let closest = world ? { kind: 'world', t: world.dist, normal: world.normal, mat: world.mat } : null;
  for (const a of actors) {
    const r = rayActor(a, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range, W);
    if (!r) continue;
    if (!closest || r.t < closest.t) {
      closest = { kind: 'actor', t: r.t, actor: r.actor, zone: r.zone, mult: r.mult, mat: 'flesh' };
    }
  }
  if (!closest) return { kind: 'miss', t: range, point: {
    x: origin.x + dir.x * range, y: origin.y + dir.y * range, z: origin.z + dir.z * range } };
  closest.point = {
    x: origin.x + dir.x * closest.t,
    y: origin.y + dir.y * closest.t,
    z: origin.z + dir.z * closest.t,
  };
  return closest;
}

/** Distance-based damage falloff. */
export function damageAt(W, dist) {
  if (dist <= W.near) return W.dmg;
  if (dist >= W.far) return W.dmgFar;
  const t = (dist - W.near) / (W.far - W.near);
  return W.dmg + (W.dmgFar - W.dmg) * t;
}

/* -------------------------------- sprites ------------------------------- */

function radialTexture(inner, outer, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.55, outer);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function holeTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(10,9,8,.95)');
  grd.addColorStop(0.35, 'rgba(30,26,22,.75)');
  grd.addColorStop(0.7, 'rgba(90,82,70,.35)');
  grd.addColorStop(1, 'rgba(120,110,95,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 12; i++) {
    g.fillStyle = 'rgba(20,18,16,.5)';
    const a = Math.random() * Math.PI * 2, r = size * (0.2 + Math.random() * 0.25);
    g.fillRect(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* -------------------------------- effects ------------------------------- */

export class Effects {
  constructor(scene, sfx) {
    this.scene = scene;
    this.sfx = sfx;
    this.time = 0;
    this.live = [];

    // tracers: thin stretched boxes, additive
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.tracerMat = tracerMat;
    this.tracers = new Pool(() => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 1), tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      return { m, life: 0 };
    }, 36);

    // sparks
    const sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46a, blending: THREE.AdditiveBlending, transparent: true });
    this.sparks = new Pool(() => {
      const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
      m.visible = false;
      scene.add(m);
      return { m, life: 0, v: new THREE.Vector3() };
    }, 90);

    // dust / smoke / blood puffs
    this.puffTex = radialTexture('rgba(220,205,180,.85)', 'rgba(180,165,140,.35)');
    this.bloodTex = radialTexture('rgba(190,20,16,.9)', 'rgba(120,10,8,.35)');
    this.smokeTex = radialTexture('rgba(60,56,52,.85)', 'rgba(30,28,26,.4)');
    this.puffs = new Pool(() => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return { m, life: 0, max: 1, grow: 1, rise: 0 };
    }, 60);

    // bullet holes
    this.holeTex = holeTexture();
    this.decals = new Pool(() => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.16),
        new THREE.MeshBasicMaterial({
          map: this.holeTex, transparent: true, depthWrite: false, opacity: 0,
          polygonOffset: true, polygonOffsetFactor: -4,
        }),
      );
      m.visible = false;
      scene.add(m);
      return { m, life: 0 };
    }, 64);

    // explosion flash light
    this.flashLight = new THREE.PointLight(0xffb060, 0, 26, 2);
    this.flashLight.visible = false;
    scene.add(this.flashLight);
    this.flashTime = 0;

    // muzzle light
    this.muzzleLight = new THREE.PointLight(0xffd090, 0, 9, 2);
    this.muzzleLight.visible = false;
    scene.add(this.muzzleLight);
    this.muzzleTime = 0;
  }

  tracer(from, to, bright = 1) {
    const t = this.tracers.next();
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.2) return;
    t.m.visible = true;
    t.m.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    t.m.lookAt(to.x, to.y, to.z);
    t.m.scale.set(1, 1, len);
    t.m.material.opacity = 0.75 * bright;
    t.life = 0.055;
  }

  muzzleFlash(pos) {
    this.muzzleLight.position.set(pos.x, pos.y, pos.z);
    this.muzzleLight.intensity = 6;
    this.muzzleLight.visible = true;
    this.muzzleTime = 0.05;
  }

  impact(point, normal, material = 'concrete', heavy = false) {
    // sparks
    const n = heavy ? 10 : material === 'metal' ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const s = this.sparks.next();
      s.m.visible = true;
      s.m.position.set(point.x, point.y, point.z);
      const spd = 1.6 + Math.random() * 3.6;
      s.v.set(normal.x + rand(0.8, -0.8), normal.y + rand(1.0, -0.2), normal.z + rand(0.8, -0.8))
        .normalize().multiplyScalar(spd);
      s.m.material.color.setHex(material === 'flesh' ? 0x7a1010 : material === 'metal' ? 0xffd08a : 0xffb560);
      s.m.material.opacity = 1;
      s.life = 0.22 + Math.random() * 0.25;
    }
    // dust puff
    const p = this.puffs.next();
    p.m.visible = true;
    p.m.material.map = material === 'flesh' ? this.bloodTex : this.puffTex;
    p.m.material.opacity = material === 'flesh' ? 0.75 : 0.5;
    p.m.position.set(point.x + normal.x * 0.05, point.y + normal.y * 0.05, point.z + normal.z * 0.05);
    p.m.scale.setScalar(0.18);
    p.life = p.max = material === 'flesh' ? 0.3 : 0.45;
    p.grow = material === 'flesh' ? 0.9 : 1.5;
    p.rise = material === 'flesh' ? 0.2 : 0.55;

    // decal (not on people)
    if (material !== 'flesh') {
      const d = this.decals.next();
      d.m.visible = true;
      d.m.position.set(point.x + normal.x * 0.012, point.y + normal.y * 0.012, point.z + normal.z * 0.012);
      d.m.lookAt(
        point.x + normal.x * 2, point.y + normal.y * 2, point.z + normal.z * 2,
      );
      const sc = 0.7 + Math.random() * 0.7;
      d.m.scale.set(sc, sc, sc);
      d.m.material.opacity = 0.95;
      d.life = 14;
    }
    this.sfx?.impact(point, material);
  }

  blood(point, dir) {
    const p = this.puffs.next();
    p.m.visible = true;
    p.m.material.map = this.bloodTex;
    p.m.material.opacity = 0.8;
    p.m.position.set(point.x, point.y, point.z);
    p.m.scale.setScalar(0.25);
    p.life = p.max = 0.35;
    p.grow = 1.2;
    p.rise = 0.1;
    for (let i = 0; i < 6; i++) {
      const s = this.sparks.next();
      s.m.visible = true;
      s.m.position.set(point.x, point.y, point.z);
      s.v.set(dir.x + rand(0.7, -0.7), rand(1.2, -0.2), dir.z + rand(0.7, -0.7)).multiplyScalar(2.2);
      s.m.material.color.setHex(0x8a1212);
      s.m.material.opacity = 1;
      s.life = 0.3;
    }
  }

  explosion(point) {
    this.flashLight.position.set(point.x, point.y + 0.4, point.z);
    this.flashLight.intensity = 60;
    this.flashLight.visible = true;
    this.flashTime = 0.35;
    for (let i = 0; i < 16; i++) {
      const p = this.puffs.next();
      p.m.visible = true;
      p.m.material.map = i < 6 ? this.puffTex : this.smokeTex;
      p.m.material.opacity = 0.85;
      p.m.position.set(point.x + rand(1.4, -1.4), point.y + rand(1.8, 0.1), point.z + rand(1.4, -1.4));
      p.m.scale.setScalar(0.6 + Math.random() * 1.2);
      p.life = p.max = 0.9 + Math.random() * 0.8;
      p.grow = 3.4;
      p.rise = 1.1;
    }
    for (let i = 0; i < 34; i++) {
      const s = this.sparks.next();
      s.m.visible = true;
      s.m.position.set(point.x, point.y + 0.3, point.z);
      s.v.set(rand(1, -1), rand(1, -0.1), rand(1, -1)).normalize().multiplyScalar(6 + Math.random() * 10);
      s.m.material.color.setHex(0xffc060);
      s.m.material.opacity = 1;
      s.life = 0.4 + Math.random() * 0.5;
    }
    this.sfx?.explosion(point);
  }

  update(dt) {
    this.time += dt;
    for (const t of this.tracers.items) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.m.material.opacity = Math.max(0, t.m.material.opacity - dt * 14);
      if (t.life <= 0) { t.m.visible = false; t.m.material.opacity = 0; }
    }
    for (const s of this.sparks.items) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 14 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.material.opacity = clamp(s.life * 4, 0, 1);
      if (s.life <= 0) s.m.visible = false;
    }
    for (const p of this.puffs.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = 1 - p.life / p.max;
      p.m.scale.setScalar(0.18 + k * p.grow);
      p.m.position.y += p.rise * dt;
      p.m.material.opacity = Math.max(0, (1 - k) * 0.7);
      if (p.life <= 0) p.m.visible = false;
    }
    for (const d of this.decals.items) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life < 2) d.m.material.opacity = Math.max(0, d.life / 2);
      if (d.life <= 0) d.m.visible = false;
    }
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 200);
      if (this.flashTime <= 0) { this.flashLight.visible = false; this.flashLight.intensity = 0; }
    }
    if (this.muzzleTime > 0) {
      this.muzzleTime -= dt;
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 120);
      if (this.muzzleTime <= 0) { this.muzzleLight.visible = false; this.muzzleLight.intensity = 0; }
    }
  }
}

/* ------------------------------- grenades ------------------------------- */

export const GRENADE = { fuse: 3.2, radius: 7.0, maxDmg: 135, throwSpeed: 17 };

export class Grenades {
  constructor(scene, collider, effects) {
    this.collider = collider;
    this.effects = effects;
    this.items = [];
    const geo = new THREE.SphereGeometry(0.11, 10, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x3f4a35 });
    this.pool = new Pool(() => {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      return m;
    }, 14);
  }

  throw_(origin, dir, owner, power = 1) {
    const m = this.pool.next();
    m.visible = true;
    m.position.set(origin.x, origin.y, origin.z);
    const g = {
      mesh: m, owner,
      p: { x: origin.x, y: origin.y, z: origin.z },
      v: {
        x: dir.x * GRENADE.throwSpeed * power,
        y: dir.y * GRENADE.throwSpeed * power + 3.2,
        z: dir.z * GRENADE.throwSpeed * power,
      },
      fuse: GRENADE.fuse,
      spin: { x: rand(8, -8), y: rand(8, -8) },
    };
    this.items.push(g);
    return g;
  }

  update(dt, onExplode) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const g = this.items[i];
      g.fuse -= dt;
      g.v.y -= 21 * dt;
      // sub-step so fast grenades do not tunnel through thin walls
      const steps = 3;
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        const spd = Math.hypot(g.v.x, g.v.y, g.v.z);
        if (spd < 1e-4) continue;
        const dist = spd * h;
        const dx = g.v.x / spd, dy = g.v.y / spd, dz = g.v.z / spd;
        const hit = this.collider.raycast(g.p.x, g.p.y, g.p.z, dx, dy, dz, dist + 0.12);
        if (hit && hit.dist <= dist + 0.11) {
          const n = hit.normal;
          const back = Math.max(0, hit.dist - 0.1);
          g.p.x += dx * back; g.p.y += dy * back; g.p.z += dz * back;
          const vn = g.v.x * n.x + g.v.y * n.y + g.v.z * n.z;
          g.v.x = (g.v.x - 2 * vn * n.x) * 0.42;
          g.v.y = (g.v.y - 2 * vn * n.y) * 0.42;
          g.v.z = (g.v.z - 2 * vn * n.z) * 0.42;
          if (spd > 3) this.effects.sfx?.click(520, 0.14, 0.06, g.p);
        } else {
          g.p.x += g.v.x * h; g.p.y += g.v.y * h; g.p.z += g.v.z * h;
        }
      }
      g.mesh.position.set(g.p.x, g.p.y, g.p.z);
      g.mesh.rotation.x += g.spin.x * dt;
      g.mesh.rotation.y += g.spin.y * dt;

      if (g.fuse <= 0) {
        this.effects.explosion(g.p);
        onExplode?.(g);
        g.mesh.visible = false;
        this.items.splice(i, 1);
      }
    }
  }

  /** Radial damage with line-of-sight occlusion. */
  static blastDamage(collider, actors, point) {
    const out = [];
    for (const a of actors) {
      if (!a.alive) continue;
      const cx = a.pos.x, cy = a.pos.y + a.height * 0.55, cz = a.pos.z;
      const d = Math.hypot(cx - point.x, cy - point.y, cz - point.z);
      if (d > GRENADE.radius) continue;
      if (!collider.los(point.x, point.y + 0.15, point.z, cx, cy, cz)) continue;
      const f = 1 - d / GRENADE.radius;
      out.push({ actor: a, dmg: GRENADE.maxDmg * f * f });
    }
    return out;
  }
}
