// Weapon data, ammo/fire-rate state machine, and the procedural view model.
import * as THREE from 'three';
import { clamp, gauss } from '../core/util.js';

export const WEAPONS = {
  m4: {
    id: 'm4', name: 'XM4 CARBINE', kind: 'rifle', slot: 'primary', sound: 'rifle',
    dmg: 34, dmgFar: 23, near: 24, far: 62, rpm: 740, mag: 30, reserve: 180,
    modes: ['auto', 'burst'], pellets: 1, headMult: 1.6, limbMult: 0.9,
    spreadHip: 0.030, spreadAds: 0.0045, spreadMove: 0.022, spreadPerShot: 0.0035, spreadMax: 0.075,
    recoil: { v: 0.0082, h: 0.0032, kick: 0.055, roll: 0.02 },
    reload: 2.15, adsTime: 0.22, adsFov: 52, weight: 1.0, desc: 'Polyvalent',
  },
  mp5: {
    id: 'mp5', name: 'MP5K', kind: 'smg', slot: 'primary', sound: 'smg',
    dmg: 26, dmgFar: 15, near: 14, far: 40, rpm: 900, mag: 32, reserve: 192,
    modes: ['auto'], pellets: 1, headMult: 1.5, limbMult: 0.9,
    spreadHip: 0.026, spreadAds: 0.0065, spreadMove: 0.014, spreadPerShot: 0.0030, spreadMax: 0.07,
    recoil: { v: 0.0058, h: 0.0034, kick: 0.04, roll: 0.018 },
    reload: 1.85, adsTime: 0.17, adsFov: 58, weight: 1.12, desc: 'Cadence élevée',
  },
  ak: {
    id: 'ak', name: 'AK-74u', kind: 'smg', slot: 'primary', sound: 'rifle',
    dmg: 31, dmgFar: 19, near: 18, far: 46, rpm: 800, mag: 30, reserve: 180,
    modes: ['auto'], pellets: 1, headMult: 1.5, limbMult: 0.9,
    spreadHip: 0.032, spreadAds: 0.006, spreadMove: 0.02, spreadPerShot: 0.004, spreadMax: 0.08,
    recoil: { v: 0.0095, h: 0.0042, kick: 0.06, roll: 0.024 },
    reload: 2.0, adsTime: 0.2, adsFov: 55, weight: 1.05, desc: 'Frappe fort',
  },
  shotgun: {
    id: 'shotgun', name: 'OLYMPIA 12', kind: 'shotgun', slot: 'primary', sound: 'shotgun',
    dmg: 19, dmgFar: 6, near: 7, far: 20, rpm: 78, mag: 6, reserve: 36,
    modes: ['pump'], pellets: 9, headMult: 1.3, limbMult: 1.0,
    spreadHip: 0.075, spreadAds: 0.05, spreadMove: 0.01, spreadPerShot: 0, spreadMax: 0.09,
    recoil: { v: 0.026, h: 0.006, kick: 0.16, roll: 0.05 },
    reload: 3.1, adsTime: 0.24, adsFov: 62, weight: 0.95, desc: 'Combat rapproché',
  },
  svd: {
    id: 'svd', name: 'DRAGUNOV', kind: 'sniper', slot: 'primary', sound: 'sniper',
    dmg: 96, dmgFar: 72, near: 40, far: 120, rpm: 58, mag: 10, reserve: 40,
    modes: ['semi'], pellets: 1, headMult: 2.0, limbMult: 0.85,
    spreadHip: 0.11, spreadAds: 0.0006, spreadMove: 0.04, spreadPerShot: 0.01, spreadMax: 0.14,
    recoil: { v: 0.032, h: 0.008, kick: 0.2, roll: 0.05 },
    reload: 2.8, adsTime: 0.34, adsFov: 20, weight: 0.86, scope: true, desc: 'Un coup, un mort',
  },
  m1911: {
    id: 'm1911', name: 'M1911', kind: 'pistol', slot: 'secondary', sound: 'pistol',
    dmg: 29, dmgFar: 18, near: 16, far: 42, rpm: 420, mag: 8, reserve: 48,
    modes: ['semi'], pellets: 1, headMult: 1.7, limbMult: 0.9,
    spreadHip: 0.028, spreadAds: 0.007, spreadMove: 0.016, spreadPerShot: 0.006, spreadMax: 0.07,
    recoil: { v: 0.014, h: 0.005, kick: 0.09, roll: 0.03 },
    reload: 1.65, adsTime: 0.16, adsFov: 60, weight: 1.2, desc: 'Secours',
  },
};

export const PRIMARIES = ['m4', 'mp5', 'ak', 'shotgun', 'svd'];

/* ------------------------------ ammo state ------------------------------ */

export class WeaponState {
  constructor(id) {
    this.set(id);
  }
  set(id) {
    const w = WEAPONS[id];
    this.w = w;
    this.id = id;
    this.mag = w.mag;
    this.reserve = w.reserve;
    this.mode = w.modes[0];
    this.cool = 0;
    this.reloading = 0;
    this.burstLeft = 0;
    this.bloom = 0;
    this.pumping = 0;
  }
  get interval() { return 60 / this.w.rpm; }
  get empty() { return this.mag <= 0; }
  get canReload() { return this.mag < this.w.mag && this.reserve > 0 && !this.reloading; }

  cycleMode() {
    const m = this.w.modes;
    if (m.length < 2) return this.mode;
    this.mode = m[(m.indexOf(this.mode) + 1) % m.length];
    return this.mode;
  }

  startReload() {
    if (!this.canReload) return false;
    this.reloading = this.w.reload;
    return true;
  }

  finishReload() {
    const need = this.w.mag - this.mag;
    const take = Math.min(need, this.reserve);
    this.mag += take;
    this.reserve -= take;
    this.reloading = 0;
  }

  tick(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.pumping = Math.max(0, this.pumping - dt);
    this.bloom = Math.max(0, this.bloom - dt * 0.085);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload();
    }
  }

  /** Can we send a round right now for this trigger state? */
  ready(triggerHeld, triggerPressed) {
    if (this.reloading > 0 || this.cool > 0 || this.pumping > 0) return false;
    if (this.mag <= 0) return false;
    switch (this.mode) {
      case 'auto': return triggerHeld;
      case 'burst': return triggerPressed || this.burstLeft > 0;
      case 'semi': case 'pump': return triggerPressed;
      default: return triggerHeld;
    }
  }

  consume() {
    this.mag--;
    this.cool = this.interval;
    this.bloom = Math.min(this.w.spreadMax, this.bloom + this.w.spreadPerShot);
    if (this.mode === 'burst') {
      if (this.burstLeft === 0) this.burstLeft = 2;
      else this.burstLeft--;
      if (this.burstLeft === 0) this.cool = Math.max(this.cool, 0.3);
    }
    if (this.mode === 'pump') this.pumping = 0.62;
  }

  spread(ads, moving, crouched, airborne) {
    const w = this.w;
    let s = ads ? w.spreadAds : w.spreadHip;
    if (moving) s += w.spreadMove * (ads ? 0.45 : 1);
    if (crouched) s *= 0.72;
    if (airborne) s *= 2.4;
    return s + this.bloom * (ads ? 0.5 : 1);
  }
}

/* ------------------------------ view model ------------------------------ */

const MATS = {};
function mat(color, shiny = 0) {
  const key = color + '|' + shiny;
  if (!MATS[key]) {
    MATS[key] = shiny
      ? new THREE.MeshPhongMaterial({ color, shininess: shiny, specular: 0x555555 })
      : new THREE.MeshLambertMaterial({ color });
  }
  return MATS[key];
}

function part(group, color, w, h, d, x, y, z, shiny = 0, rot = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, shiny));
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = false;
  m.receiveShadow = false;
  group.add(m);
  return m;
}

/**
 * Builds a low-poly first-person weapon. Local space: -Z is forward (muzzle),
 * +X right, +Y up. The whole group is parented to the camera.
 */
export function buildViewModel(id) {
  const g = new THREE.Group();
  const W = WEAPONS[id];
  const black = '#202225', gun = '#34383c', poly = '#2b2e31', woodC = '#6b4a2a', steel = '#8b9096';
  const muzzle = new THREE.Object3D();

  if (W.kind === 'rifle' || W.kind === 'smg') {
    const long = W.kind === 'rifle';
    part(g, gun, 0.075, 0.09, long ? 0.46 : 0.34, 0, 0, -0.06, 20);           // receiver
    part(g, poly, 0.062, 0.055, long ? 0.34 : 0.22, 0, -0.01, long ? -0.42 : -0.3); // handguard
    part(g, black, 0.03, 0.03, long ? 0.3 : 0.2, 0, 0.005, long ? -0.66 : -0.46, 30); // barrel
    part(g, black, 0.042, 0.042, 0.06, 0, 0.005, long ? -0.82 : -0.57, 30);    // muzzle brake
    part(g, black, 0.05, 0.17, 0.08, 0, -0.12, 0.02);                          // grip
    part(g, poly, 0.05, 0.16, 0.1, 0, -0.14, -0.2, 0, [0.22, 0, 0]);           // magazine
    if (id === 'ak') part(g, woodC, 0.055, 0.075, 0.26, 0, -0.005, 0.2);       // wood stock
    else part(g, poly, 0.05, 0.07, 0.26, 0, 0.0, 0.2);
    part(g, black, 0.02, 0.05, 0.02, 0, 0.07, -0.2);                           // front sight
    part(g, black, 0.05, 0.035, 0.07, 0, 0.075, 0.02);                         // rear sight block
    part(g, '#111', 0.036, 0.024, 0.06, 0, 0.09, -0.02);
    muzzle.position.set(0, 0.005, long ? -0.88 : -0.62);
  } else if (W.kind === 'shotgun') {
    part(g, steel, 0.09, 0.075, 0.6, 0, 0.01, -0.3, 40);                       // double barrel
    part(g, black, 0.1, 0.04, 0.12, 0, -0.02, 0.06);
    part(g, woodC, 0.07, 0.085, 0.3, 0, -0.03, 0.18);                          // stock
    part(g, woodC, 0.075, 0.05, 0.18, 0, -0.05, -0.22);                        // forend
    part(g, black, 0.045, 0.14, 0.07, 0, -0.11, 0.04);
    muzzle.position.set(0, 0.01, -0.62);
  } else if (W.kind === 'sniper') {
    part(g, woodC, 0.07, 0.1, 0.62, 0, -0.01, 0.06);                           // stock/receiver
    part(g, black, 0.032, 0.032, 0.66, 0, 0.02, -0.5, 30);                     // long barrel
    part(g, black, 0.05, 0.05, 0.1, 0, 0.02, -0.86, 30);
    part(g, black, 0.05, 0.16, 0.08, 0, -0.13, 0.0);
    part(g, poly, 0.05, 0.13, 0.09, 0, -0.12, -0.16, 0, [0.15, 0, 0]);
    part(g, '#15171a', 0.055, 0.055, 0.34, 0, 0.1, -0.1, 50);                  // scope tube
    part(g, '#0b0c0e', 0.07, 0.07, 0.04, 0, 0.1, -0.28, 50);
    part(g, '#0b0c0e', 0.075, 0.075, 0.04, 0, 0.1, 0.06, 50);
    muzzle.position.set(0, 0.02, -0.92);
  } else {
    part(g, gun, 0.055, 0.1, 0.26, 0, 0, -0.08, 30);                           // slide
    part(g, black, 0.03, 0.028, 0.1, 0, 0.005, -0.24, 30);                     // barrel
    part(g, '#3a3d40', 0.05, 0.16, 0.07, 0, -0.12, 0.02, 0, [0.25, 0, 0]);     // grip
    part(g, black, 0.02, 0.04, 0.02, 0, 0.065, -0.18);
    muzzle.position.set(0, 0.005, -0.3);
  }

  // hands
  const skin = '#b3835c';
  part(g, skin, 0.075, 0.1, 0.11, 0.005, -0.15, 0.03);                          // trigger hand
  const fore = W.kind === 'sniper' ? -0.34 : W.kind === 'shotgun' ? -0.24 : -0.36;
  part(g, skin, 0.085, 0.1, 0.13, -0.005, -0.09, fore);                         // support hand

  // muzzle flash (hidden until fired)
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  flash.position.copy(muzzle.position);
  flash.position.z -= 0.04;
  g.add(flash);
  const flash2 = flash.clone();
  flash2.material = flashMat;
  flash2.rotation.z = Math.PI / 2;
  g.add(flash2);

  g.add(muzzle);
  g.userData = { muzzle, flash: [flash, flash2], flashMat };
  return g;
}

/** Drives view-model placement: hip/ADS, sway, bob, recoil, reload, sprint. */
export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    camera.add(this.group);
    this.model = null;
    this.hip = new THREE.Vector3(0.135, -0.125, -0.27);
    this.adsPos = new THREE.Vector3(0, -0.045, -0.19);
    this.scale = 0.46;
    this.kick = 0;
    this.kickRot = 0;
    this.bobT = 0;
    this.flashTime = 0;
    this.swayX = 0; this.swayY = 0;
    this.adsBlend = 0;
  }

  equip(id) {
    if (this.model) this.group.remove(this.model);
    this.model = buildViewModel(id);
    this.model.scale.setScalar(this.scale);
    this.group.add(this.model);
    this.swapTime = 0.45;
    return this.model;
  }

  fire(recoil) {
    this.kick = recoil.kick;
    this.kickRot = recoil.kick * 1.6;
    this.flashTime = 0.045;
  }

  update(dt, s) {
    if (!this.model) return;
    const m = this.model;
    const scoped = s.scoped;
    this.adsBlend += ((s.ads ? 1 : 0) - this.adsBlend) * Math.min(1, dt * (1 / Math.max(0.05, s.adsTime)));

    // procedural sway from mouse movement
    this.swayX += (clamp(-s.lookDx * 6, -0.05, 0.05) - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (clamp(-s.lookDy * 6, -0.05, 0.05) - this.swayY) * Math.min(1, dt * 9);

    // walk bob
    if (s.moving && s.grounded) this.bobT += dt * (s.sprinting ? 13 : 8.5);
    const bobAmt = (s.sprinting ? 0.028 : 0.014) * (1 - this.adsBlend * 0.8);
    const bx = Math.cos(this.bobT) * bobAmt;
    const by = Math.abs(Math.sin(this.bobT)) * bobAmt * 0.9;

    this.kick += (0 - this.kick) * Math.min(1, dt * 14);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 12);

    const a = this.adsBlend;
    const tx = this.hip.x * (1 - a) + this.adsPos.x * a;
    const ty = this.hip.y * (1 - a) + this.adsPos.y * a;
    const tz = this.hip.z * (1 - a) + this.adsPos.z * a;

    let rx = 0, ry = 0, rz = 0, ox = 0, oy = 0, oz = 0;

    // reload animation: dip and roll the weapon out of view
    if (s.reloadFrac > 0) {
      const p = s.reloadFrac;                  // 1 → 0 over the reload
      const e = Math.sin(Math.min(1, (1 - p) * 3.1)) * Math.sin(Math.min(1, p * 3.1));
      oy -= 0.16 * e; oz += 0.06 * e; rx += 0.75 * e; rz += 0.45 * e;
    }
    // knife swing: whip the weapon across the screen and back
    if (s.meleeFrac > 0) {
      const p = 1 - s.meleeFrac;                 // 0 -> 1 over the swing
      const e = Math.sin(Math.min(1, p * 2.4) * Math.PI);
      ox -= 0.16 * e; oy += 0.05 * e; oz -= 0.14 * e;
      rz -= 1.15 * e; ry += 0.5 * e; rx -= 0.25 * e;
    }
    // sprint: tilt the weapon across the body
    if (s.sprinting && s.moving && !s.ads) { rz += 0.42; ry += 0.22; ox += 0.04; oy -= 0.05; }
    // weapon swap
    if (this.swapTime > 0) {
      this.swapTime -= dt;
      const e = clamp(this.swapTime / 0.45, 0, 1);
      oy -= 0.35 * e * e; rx += 0.9 * e * e;
    }

    m.position.set(
      tx + bx + this.swayX * (1 - a * 0.7) + ox,
      ty + by + this.swayY * (1 - a * 0.7) + oy - this.kick * 0.1,
      tz + this.kick * 0.42 + oz,
    );
    m.rotation.set(
      rx + this.kickRot * 0.55 + this.swayY * 0.8,
      ry + this.swayX * 1.1,
      rz + (1 - a) * 0.02,
    );
    m.visible = !scoped;

    // muzzle flash
    this.flashTime = Math.max(0, this.flashTime - dt);
    const f = this.model.userData.flashMat;
    f.opacity = this.flashTime > 0 ? 0.55 + Math.random() * 0.45 : 0;
    const sc = 0.7 + Math.random() * 0.8;
    for (const fm of this.model.userData.flash) fm.scale.setScalar(sc);
  }

  muzzleWorld(out) {
    if (!this.model) return out.set(0, 0, 0);
    return this.model.userData.muzzle.getWorldPosition(out);
  }
}

/** Camera recoil accumulator (view kick that the player must fight). */
export class Recoil {
  constructor() { this.pitch = 0; this.yaw = 0; this.vp = 0; this.vy = 0; }
  punch(r, adsFactor = 1) {
    this.vp += r.v * (30 + Math.random() * 12) * adsFactor;
    this.vy += r.h * (30 + Math.random() * 20) * gauss() * 2 * adsFactor;
  }
  update(dt) {
    this.pitch += this.vp * dt;
    this.yaw += this.vy * dt;
    this.vp *= Math.exp(-9 * dt);
    this.vy *= Math.exp(-9 * dt);
    this.pitch *= Math.exp(-7 * dt);
    this.yaw *= Math.exp(-7 * dt);
  }
}
