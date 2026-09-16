// ============================================================================
//  Killstreaks: spy plane, mortar barrage, attack helicopter.
//  Earned by the player, queued, and fired with [4].
// ============================================================================
import * as THREE from 'three';
import { clamp, rand } from '../core/util.js';
import { hitscan, Grenades } from './combat.js';

export const STREAKS = {
  uav: { id: 'uav', at: 3, name: 'AVION ESPION', hint: 'radar 30 s', dur: 30 },
  mortar: { id: 'mortar', at: 5, name: 'FRAPPE MORTIER', hint: 'visez une zone', dur: 8 },
  heli: { id: 'heli', at: 7, name: 'HÉLICOPTÈRE', hint: 'soutien aérien 34 s', dur: 34 },
};

/** kills -> streak reward (repeats at the top of the ladder) */
export function rewardFor(kills) {
  if (kills === 3 || kills === 12) return STREAKS.uav;
  if (kills === 5 || kills === 15) return STREAKS.mortar;
  if (kills === 7 || kills === 10 || kills === 20) return STREAKS.heli;
  return null;
}

/* ------------------------------ helicopter ------------------------------ */

function buildHeli() {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x2f3a33 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x223038, shininess: 70 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.9, 5.4), dark);
  body.position.y = 0.2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 1.4), glass);
  nose.position.set(0, 0.3, -3.0);
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), dark);
  tail.position.set(0, 0.5, 4.4);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.9), dark);
  fin.position.set(0, 1.2, 6.2);
  g.add(fin);
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 4), dark);
    skid.position.set(sx * 0.95, -1.1, 0);
    g.add(skid);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), dark);
    strut.position.set(sx * 0.9, -0.6, 0.6);
    g.add(strut);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.3), dark);
    gun.position.set(sx * 1.25, -0.4, -1.2);
    g.add(gun);
  }
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), dark);
  mast.position.y = 1.3;
  g.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.6;
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 9.5), dark);
    blade.rotation.y = (i * Math.PI) / 4;
    rotor.add(blade);
  }
  g.add(rotor);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.35, 1.2, 6.2);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.22), dark);
    blade.rotation.z = (i * Math.PI) / 2;
    tailRotor.add(blade);
  }
  g.add(tailRotor);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { rotor, tailRotor };
  return g;
}

/* ------------------------------- system --------------------------------- */

export class Streaks {
  constructor(scene, match) {
    this.scene = scene;
    this.match = match;
    this.queue = [];            // earned, not yet used
    this.uavUntil = -1;
    this.mortar = null;
    this.heli = null;
    this.heliMesh = null;
    this.rotorSound = null;
  }

  /** Called when the player's kill count changes. */
  onKill(kills) {
    const r = rewardFor(kills);
    if (!r) return null;
    if (this.queue.length < 3) this.queue.push(r.id);
    return r;
  }

  get next() { return this.queue[0] ? STREAKS[this.queue[0]] : null; }
  get uavActive() { return this.match.time < this.uavUntil; }

  /** Spend the oldest reward. @returns the streak used, or null. */
  use(player) {
    const id = this.queue[0];
    if (!id) return null;
    if (id === 'heli' && this.heli) return null;         // one bird at a time
    this.queue.shift();
    const S = STREAKS[id];
    if (id === 'uav') this.uavUntil = this.match.time + S.dur;
    else if (id === 'mortar') this._callMortar(player);
    else if (id === 'heli') this._callHeli(player);
    return S;
  }

  _callMortar(player) {
    // land the barrage wherever the player is looking
    const eye = player.eye;
    const cp = Math.cos(player.pitch);
    const dir = {
      x: -Math.sin(player.yaw) * cp,
      y: Math.sin(player.pitch),
      z: -Math.cos(player.yaw) * cp,
    };
    const hit = this.match.collider.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 200);
    const at = hit
      ? { x: eye.x + dir.x * hit.dist, y: eye.y + dir.y * hit.dist, z: eye.z + dir.z * hit.dist }
      : { x: player.pos.x - Math.sin(player.yaw) * 22, y: 0.1, z: player.pos.z - Math.cos(player.yaw) * 22 };
    const shells = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 9;
      shells.push({
        t: 0.7 + i * 0.62 + rand(0.25, 0),
        whistled: false,
        x: at.x + Math.cos(a) * r,
        z: at.z + Math.sin(a) * r,
      });
    }
    this.mortar = { owner: player, shells, t: 0 };
  }

  _callHeli(player) {
    const mesh = buildHeli();
    const side = player.team === 'A' ? -1 : 1;
    mesh.position.set(side * 70, 26, -46);
    this.scene.add(mesh);
    this.heliMesh = mesh;
    this.heli = {
      owner: player,
      t: 0,
      life: STREAKS.heli.dur,
      angle: Math.atan2(-46, side * 70),
      radius: 30,
      cool: 0,
      leaving: false,
      target: null,
      retarget: 0,
    };
    this.rotorSound = this.match.sfx.startLoop('rotor');
  }

  /* -------------------------------- update ------------------------------ */

  update(dt) {
    const M = this.match;
    if (this.mortar) this._updateMortar(dt);
    if (this.heli) this._updateHeli(dt);
    if (this.rotorSound && this.heliMesh) this.rotorSound.setPosition(this.heliMesh.position, 150);
    void M;
  }

  _updateMortar(dt) {
    const m = this.mortar;
    m.t += dt;
    const M = this.match;
    for (const s of m.shells) {
      if (s.done) continue;
      if (!s.whistled && m.t > s.t - 1.15) {
        s.whistled = true;
        M.sfx.whistle({ x: s.x, y: 12, z: s.z }, 1.15);
      }
      if (m.t < s.t) continue;
      s.done = true;
      // find the ground under the shell
      const hit = M.collider.raycast(s.x, 30, s.z, 0, -1, 0, 60);
      const p = { x: s.x, y: hit ? 30 - hit.dist + 0.2 : 0.2, z: s.z };
      M.effects.explosion(p);
      for (const v of Grenades.blastDamage(M.collider, M.actors, p)) {
        M.damage(v.actor, v.dmg * 1.35, m.owner, 'chest', 'FRAPPE MORTIER');
      }
      const d = Math.hypot(p.x - M.player.pos.x, p.z - M.player.pos.z);
      if (d < 22) M.player.shake(0.6, clamp(0.14 * (1 - d / 22), 0, 0.14));
    }
    if (m.shells.every((s) => s.done)) this.mortar = null;
  }

  _updateHeli(dt) {
    const h = this.heli;
    const M = this.match;
    const mesh = this.heliMesh;
    h.t += dt;
    mesh.userData.rotor.rotation.y += dt * 26;
    mesh.userData.tailRotor.rotation.x += dt * 34;

    if (h.t > h.life && !h.leaving) h.leaving = true;

    if (h.leaving) {
      // climb out toward the horizon, then despawn
      mesh.position.y += dt * 5;
      mesh.position.z -= dt * 22;
      mesh.position.x += dt * 8;
      if (mesh.position.y > 60 || h.t > h.life + 8) this._removeHeli();
      return;
    }

    // slow orbit over the street
    h.angle += dt * 0.22;
    h.radius = 26 + Math.sin(h.t * 0.3) * 5;
    const want = {
      x: Math.cos(h.angle) * h.radius,
      y: 20 + Math.sin(h.t * 0.6) * 1.2,
      z: Math.sin(h.angle) * h.radius * 0.55,
    };
    mesh.position.lerp(new THREE.Vector3(want.x, want.y, want.z), Math.min(1, dt * 0.9));

    // pick a target
    h.retarget -= dt;
    if (h.retarget <= 0 || !h.target || !h.target.alive) {
      h.retarget = 0.8;
      let best = null, bestD = Infinity;
      for (const a of M.actors) {
        if (!a.alive || a.team === h.owner.team) continue;
        const p = { x: a.pos.x, y: a.pos.y + a.height * 0.7, z: a.pos.z };
        const d = Math.hypot(p.x - mesh.position.x, p.y - mesh.position.y, p.z - mesh.position.z);
        if (d > 80 || d > bestD) continue;
        if (!M.collider.los(mesh.position.x, mesh.position.y - 1, mesh.position.z, p.x, p.y, p.z)) continue;
        bestD = d; best = a;
      }
      h.target = best;
    }

    // face the target (or the direction of travel)
    const look = h.target
      ? new THREE.Vector3(h.target.pos.x, mesh.position.y, h.target.pos.z)
      : new THREE.Vector3(0, mesh.position.y, 0);
    const wantYaw = Math.atan2(look.x - mesh.position.x, look.z - mesh.position.z) + Math.PI;
    let dy = wantYaw - mesh.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    mesh.rotation.y += dy * Math.min(1, dt * 2.2);
    mesh.rotation.z = clamp(-dy * 0.35, -0.3, 0.3);

    // minigun
    h.cool -= dt;
    if (h.target && h.cool <= 0) {
      h.cool = 0.11;
      const origin = { x: mesh.position.x, y: mesh.position.y - 0.6, z: mesh.position.z };
      const tp = { x: h.target.pos.x, y: h.target.pos.y + h.target.height * 0.6, z: h.target.pos.z };
      const dir = { x: tp.x - origin.x, y: tp.y - origin.y, z: tp.z - origin.z };
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const sp = 0.026;
      dir.x = dir.x / len + rand(sp, -sp);
      dir.y = dir.y / len + rand(sp, -sp);
      dir.z = dir.z / len + rand(sp, -sp);
      const l2 = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= l2; dir.y /= l2; dir.z /= l2;
      const W = { dmg: 30, dmgFar: 22, near: 30, far: 90, headMult: 1.4, limbMult: 1, far2: 0 };
      const targets = M.actors.filter((a) => a.alive && a.team !== h.owner.team);
      const res = hitscan(M.collider, targets, origin, dir, 140, W);
      if (res.kind === 'actor') {
        M.effects.blood(res.point, dir);
        M.damage(res.actor, 30 * res.mult, h.owner, res.zone, 'HÉLICOPTÈRE');
      } else if (res.kind === 'world') {
        M.effects.impact(res.point, res.normal, res.mat, true);
      }
      M.effects.tracer(origin, res.point, 1.2);
      M.sfx.shot('smg', origin);
    }
  }

  _removeHeli() {
    if (this.heliMesh) this.scene.remove(this.heliMesh);
    this.heliMesh = null;
    this.heli = null;
    this.rotorSound?.stop();
    this.rotorSound = null;
  }

  dispose() {
    this._removeHeli();
    this.mortar = null;
    this.queue.length = 0;
  }
}
