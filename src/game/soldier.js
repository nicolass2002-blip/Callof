// Low-poly soldier used for every AI combatant: animated legs/arms, team
// colours, a yaw'd torso, plus a ragdoll-lite death that just falls over.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

const CACHE = new Map();
function m(color, shiny = 0) {
  const k = color + shiny;
  if (!CACHE.has(k)) {
    CACHE.set(k, shiny
      ? new THREE.MeshPhongMaterial({ color, shininess: shiny })
      : new THREE.MeshLambertMaterial({ color }));
  }
  return CACHE.get(k);
}

function box(parent, color, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export const TEAM_COLORS = {
  A: { vest: '#3c4a5c', cloth: '#4e5a48', helmet: '#39452f', accent: '#5ea0ff' },
  B: { vest: '#5c3a32', cloth: '#5a4a34', helmet: '#4a3b26', accent: '#ff5340' },
};

function nameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(128, 8); g.lineTo(142, 26); g.lineTo(114, 26); g.closePath(); g.fill();
  g.font = 'bold 22px "Arial Narrow", Impact, sans-serif';
  g.textAlign = 'center';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,.8)';
  g.strokeText(name.toUpperCase(), 128, 52);
  g.fillStyle = '#eef3f7';
  g.fillText(name.toUpperCase(), 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(1.3, 0.33, 1);
  s.position.y = 2.15;
  s.renderOrder = 10;
  return s;
}

export class Soldier {
  constructor(team, name, weaponKind = 'rifle') {
    const C = TEAM_COLORS[team];
    this.group = new THREE.Group();
    this.body = new THREE.Group();          // yaw'd torso + limbs
    this.group.add(this.body);

    // legs (pivot at the hips)
    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.86, 0);
      box(pivot, C.cloth, 0.2, 0.86, 0.22, 0, -0.43, 0);
      box(pivot, '#2a2521', 0.22, 0.14, 0.3, 0, -0.84, 0.03);   // boot
      this.body.add(pivot);
      this.legs.push(pivot);
    }
    box(this.body, C.cloth, 0.42, 0.22, 0.26, 0, 0.94, 0);       // hips
    box(this.body, C.vest, 0.5, 0.62, 0.3, 0, 1.36, 0);          // chest rig
    box(this.body, C.cloth, 0.46, 0.1, 0.28, 0, 1.68, 0);        // shoulders
    box(this.body, '#8c6a4c', 0.22, 0.24, 0.23, 0, 1.79, 0);     // head
    const helm = box(this.body, C.helmet, 0.28, 0.14, 0.3, 0, 1.92, 0.01);
    helm.scale.set(1, 1, 1);
    box(this.body, C.accent, 0.1, 0.06, 0.02, 0.1, 1.42, 0.16);  // team patch

    // arms — the right one holds the weapon and points forward
    this.arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.32, 1.6, 0);
      box(pivot, C.cloth, 0.16, 0.56, 0.17, 0, -0.26, 0);
      box(pivot, '#8c6a4c', 0.15, 0.14, 0.16, 0, -0.56, 0.02);
      this.body.add(pivot);
      this.arms.push(pivot);
    }
    this.arms[0].rotation.set(-1.25, 0, 0.35);
    this.arms[1].rotation.set(-1.4, 0, -0.2);

    // weapon in hand
    this.gun = new THREE.Group();
    this.gun.position.set(0.2, 1.42, -0.3);
    const long = weaponKind === 'rifle' || weaponKind === 'sniper';
    box(this.gun, '#2c3033', 0.07, 0.1, long ? 0.5 : 0.36, 0, 0, 0);
    box(this.gun, '#1d2022', 0.04, 0.04, long ? 0.34 : 0.22, 0, 0.01, long ? -0.4 : -0.28);
    box(this.gun, '#24282b', 0.05, 0.16, 0.09, 0, -0.12, -0.04);
    if (weaponKind === 'sniper') box(this.gun, '#15171a', 0.05, 0.05, 0.22, 0, 0.1, -0.06);
    this.body.add(this.gun);

    this.tag = nameSprite(name, C.accent);
    this.group.add(this.tag);

    this.phase = Math.random() * 6;
    this.dead = false;
    this.deadTime = 0;
  }

  setVisibleTag(v) { this.tag.visible = v; }

  /** @param {object} s {x,y,z, yaw, pitch, speed, crouch, dead, dt} */
  update(s, dt) {
    const g = this.group;
    g.position.set(s.x, s.y, s.z);

    if (s.dead) {
      if (!this.dead) { this.dead = true; this.deadTime = 0; this.tag.visible = false; }
      this.deadTime += dt;
      const t = Math.min(1, this.deadTime / 0.55);
      const e = 1 - (1 - t) * (1 - t);
      this.body.rotation.x = e * (Math.PI / 2) * 0.92;
      this.body.position.y = -0.02 - e * 0.1;
      this.body.rotation.y = s.yaw;
      for (const l of this.legs) l.rotation.x = 0.25 * e;
      this.arms[0].rotation.set(-0.4 * e, 0, 0.9 * e);
      this.arms[1].rotation.set(-0.3 * e, 0, -0.9 * e);
      this.gun.visible = this.deadTime < 0.3;
      return;
    }

    this.body.rotation.y = s.yaw;
    this.body.rotation.x = 0;
    this.body.position.y = s.crouch ? -0.38 : 0;
    this.body.scale.y = s.crouch ? 0.78 : 1;

    const moving = s.speed > 0.4;
    if (moving) this.phase += dt * clamp(s.speed * 1.9, 3, 15);
    const amp = clamp(s.speed * 0.13, 0, 0.75);
    const sw = Math.sin(this.phase) * amp;
    this.legs[0].rotation.x = moving ? sw : 0;
    this.legs[1].rotation.x = moving ? -sw : 0;
    this.arms[0].rotation.x = -1.25 - (moving ? sw * 0.25 : 0);
    this.arms[1].rotation.x = -1.4 + (moving ? sw * 0.25 : 0);

    // the weapon (and the support arm) follow the aim pitch
    const pitch = clamp(s.pitch, -0.9, 0.9);
    this.gun.rotation.x = pitch;
    this.gun.position.set(0.2, 1.42 - pitch * 0.12, -0.3);
    this.tag.position.y = (s.crouch ? 1.55 : 2.15);
  }

  dispose(scene) { scene.remove(this.group); }
}
