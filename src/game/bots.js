// Bot combatants: perception → decision → navigation → aim → trigger.
import { clamp, rand, gauss, choice } from '../core/util.js';
import { WeaponState, WEAPONS } from './weapons.js';
import { Soldier } from './soldier.js';

export const DIFFICULTY = {
  recruit: { label: 'Recrue', react: 0.70, aimErr: 0.060, aimSpeed: 3.0, burst: [0.16, 0.38], pause: [0.55, 1.20], view: 46, hear: 12, grenade: 0.00, speed: 0.82, cover: 0.3 },
  regular: { label: 'Régulier', react: 0.44, aimErr: 0.032, aimSpeed: 5.0, burst: [0.20, 0.55], pause: [0.35, 0.80], view: 62, hear: 20, grenade: 0.12, speed: 0.94, cover: 0.5 },
  veteran: { label: 'Vétéran', react: 0.26, aimErr: 0.017, aimSpeed: 7.6, burst: [0.26, 0.70], pause: [0.22, 0.50], view: 80, hear: 30, grenade: 0.28, speed: 1.00, cover: 0.7 },
  realism: { label: 'Réalisme', react: 0.15, aimErr: 0.009, aimSpeed: 10.5, burst: [0.30, 0.90], pause: [0.15, 0.34], view: 95, hear: 42, grenade: 0.42, speed: 1.04, cover: 0.85 },
};

const WALK = 4.15, SPRINT = 6.1, ACCEL = 22, GRAVITY = 21;

let NEXT_ID = 1;

export class Bot {
  constructor(name, team, weaponId, difficulty, scene) {
    this.id = NEXT_ID++;
    this.name = name;
    this.team = team;
    this.isPlayer = false;
    this.D = DIFFICULTY[difficulty] || DIFFICULTY.regular;
    this.weapon = new WeaponState(weaponId);
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.aimYaw = 0; this.aimPitch = 0;
    this.height = 1.8;
    this.crouch = false;
    this.health = 100;
    this.alive = true;
    this.kills = 0; this.deaths = 0;
    this.ping = 18 + ((Math.random() * 60) | 0);

    this.state = 'roam';
    this.target = null;
    this.lastSeenAt = null;
    this.lastSeenTime = -99;
    this.seenFor = 0;
    this.reactT = 0;
    this.burstT = 0;
    this.pauseT = rand(0.6, 0.1);
    this.errX = 0; this.errY = 0; this.errT = 0;
    this.think = 0;
    this.goal = -1;
    this.nextNode = -1;
    this.stuckT = 0;
    this.lastPos = { x: 0, z: 0 };
    this.grenadeCd = rand(22, 8);
    this.grenades = 2;
    this.deadTime = 0;
    this.strafe = 0;
    this.strafeT = 0;
    this.jumpCd = 0;
    // a little personality: who pushes the street, who flanks, who holds a window
    this.style = choice(['pusher', 'pusher', 'flanker', 'camper']);
    this.post = -1;

    this.model = new Soldier(team, name, WEAPONS[weaponId].kind);
    scene.add(this.model.group);
  }

  get eye() { return { x: this.pos.x, y: this.pos.y + (this.crouch ? 0.95 : 1.62), z: this.pos.z }; }

  spawn(at, yaw) {
    this.pos.x = at.x; this.pos.y = at.y + 0.05; this.pos.z = at.z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = this.aimYaw = yaw;
    this.pitch = this.aimPitch = 0;
    this.health = 100;
    this.alive = true;
    this.crouch = false;
    this.height = 1.8;
    this.weapon.set(this.weapon.id);
    this.target = null;
    this.state = 'roam';
    this.goal = -1;
    this.post = -1;
    this.grenades = 2;
    this.model.dead = false;
    this.model.body.rotation.set(0, yaw, 0);
    this.model.body.position.y = 0;
    this.model.gun.visible = true;
    this.model.group.visible = true;
    this.deadTime = 0;
  }

  die() {
    this.alive = false;
    this.deaths++;
    this.deadTime = 0;
    this.vel.x = this.vel.z = 0;
    this.target = null;
  }

  /* ------------------------------ perception ----------------------------- */

  _visible(W, other) {
    if (!other.alive) return false;
    const e = this.eye;
    const t = { x: other.pos.x, y: other.pos.y + other.height * 0.72, z: other.pos.z };
    const dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > this.D.view) return false;
    if (dist > 2.2) {
      // field of view (generous, they are meant to be believable, not blind)
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot < (this.target === other ? -0.25 : 0.12)) return false;
    }
    return W.collider.los(e.x, e.y, e.z, t.x, t.y, t.z);
  }

  _perceive(W, dt) {
    this.think -= dt;
    if (this.think > 0) return;
    this.think = 0.12 + Math.random() * 0.1;

    let best = null, bestD = Infinity;
    for (const e of W.actors) {
      if (e.team === this.team || !e.alive) continue;
      if (!this._visible(W, e)) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }

    if (best) {
      if (this.target !== best) { this.reactT = this.D.react * rand(1.3, 0.75); this.seenFor = 0; }
      this.target = best;
      this.lastSeenAt = { x: best.pos.x, y: best.pos.y, z: best.pos.z };
      this.lastSeenTime = W.time;
      this.state = 'fight';
    } else if (this.target && W.time - this.lastSeenTime > 2.6) {
      this.target = null;
      this.state = this.lastSeenAt ? 'hunt' : 'roam';
    }
  }

  /** Someone fired nearby — turn toward the noise. */
  hear(pos, loud, W) {
    if (!this.alive) return;
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    if (d > this.D.hear * loud) return;
    if (this.target) return;
    this.lastSeenAt = { x: pos.x, y: pos.y, z: pos.z };
    this.lastSeenTime = W.time - 1.6;
    if (this.state === 'roam') { this.state = 'hunt'; this.goal = -1; }
  }

  /* ------------------------------ navigation ---------------------------- */

  _pickGoal(W) {
    const nav = W.nav;
    if (this.state === 'fight' && this.target) {
      const want = this._wantCover(W)
        ? this._coverNode(W)
        : nav.nearest(this.target.pos.x, this.target.pos.y, this.target.pos.z, false);
      this.goal = want >= 0 ? want : nav.randomNode();
    } else if (this.state === 'hunt' && this.lastSeenAt) {
      const n = nav.nearest(this.lastSeenAt.x, this.lastSeenAt.y, this.lastSeenAt.z, false);
      this.goal = n >= 0 ? n : nav.randomNode();
    } else {
      // roam toward the other half of the map, coloured by this bot's style
      let best = -1, bestScore = -Infinity;
      for (let i = 0; i < 8; i++) {
        const n = nav.randomNode();
        const node = nav.node(n);
        const toward = this.team === 'A' ? node.x : -node.x;
        let score = rand(9, 0);
        if (this.style === 'pusher') score += toward * 0.7 - Math.abs(node.z) * 0.22;
        else if (this.style === 'flanker') score += toward * 0.4 + Math.abs(node.z) * 0.4;
        else score += toward * 0.25 + (node.high ? 11 : 0) + (node.indoor ? 5 : 0);
        if (score > bestScore) { bestScore = score; best = n; }
      }
      this.goal = best;
    }
  }

  _wantCover(W) {
    if (this.weapon.reloading > 0) return true;
    if (this.health < 38 && Math.random() < this.D.cover) return true;
    return false;
  }

  _coverNode(W) {
    const nav = W.nav;
    const t = this.target;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < 14; i++) {
      const n = nav.randomNode();
      const node = nav.node(n);
      const d = Math.hypot(node.x - this.pos.x, node.z - this.pos.z);
      if (d > 16 || d < 2) continue;
      if (W.collider.los(node.x, node.y + 1.5, node.z, t.pos.x, t.pos.y + 1.4, t.pos.z)) continue;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  /** Claim a window or room to hold: high ground first, indoors second. */
  _pickPost(W) {
    const nav = W.nav;
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const n = nav.randomNode();
      const node = nav.node(n);
      const toward = this.team === 'A' ? node.x : -node.x;
      const score = (node.high ? 14 : 0) + (node.indoor ? 6 : 0) + toward * 0.3 + rand(5, 0);
      if (score > bestScore) { bestScore = score; best = n; }
    }
    this.post = best;
  }

  _atNode(W, i, r = 2.2) {
    if (i < 0) return true;
    const n = W.nav.node(i);
    return Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < r && Math.abs(n.y - this.pos.y) < 1.3;
  }

  _navigate(W, dt, desired, lock = false) {
    const nav = W.nav;
    if (this.goal < 0) this._pickGoal(W);
    const cur = nav.nearest(this.pos.x, this.pos.y, this.pos.z);
    if (cur < 0) return { x: 0, z: 0 };
    if (cur === this.goal && !lock) { this._pickGoal(W); }
    let step = nav.step(cur, this.goal);
    if (step < 0) { this._pickGoal(W); step = nav.step(cur, this.goal); }
    if (step < 0) return { x: 0, z: 0 };
    const node = nav.node(step);
    let dx = node.x - this.pos.x, dz = node.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    // shortcut: if the goal itself is walkable in a straight line, head there
    if (desired && desired.direct) {
      const gx = desired.x - this.pos.x, gz = desired.z - this.pos.z;
      const gd = Math.hypot(gx, gz) || 1;
      if (gd < 9 && W.collider.los(this.pos.x, this.pos.y + 0.7, this.pos.z, desired.x, this.pos.y + 0.7, desired.z)) {
        dx = gx / gd; dz = gz / gd;
      }
    }
    return { x: dx, z: dz };
  }

  /* -------------------------------- update ------------------------------ */

  update(dt, W) {
    if (!this.alive) {
      this.deadTime += dt;
      this.model.update({ x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: 0, speed: 0, crouch: false, dead: true }, dt);
      return;
    }

    this.weapon.tick(dt);
    this._perceive(W, dt);
    this.grenadeCd -= dt;
    this.jumpCd -= dt;
    if (this.style === 'camper') {
      this.postT = (this.postT || rand(26, 12)) - dt;
      if (this.postT <= 0) { this.postT = rand(30, 14); this.post = -1; }
    }
    this.reactT = Math.max(0, this.reactT - dt);

    const t = this.target;
    let moveDir = { x: 0, z: 0 };
    let sprint = false;
    let wantCrouch = false;

    if (t) {
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const ideal = this.weapon.w.kind === 'shotgun' ? 6 : this.weapon.w.kind === 'sniper' ? 26 : 13;
      this.seenFor += dt;

      // strafe pattern while trading fire
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = rand(1.6, 0.6); this.strafe = choice([-1, 0, 1]); }

      const towards = { x: dx / (dist || 1), z: dz / (dist || 1) };
      const side = { x: -towards.z, z: towards.x };
      let advance = 0;
      if (dist > ideal * 1.25) advance = 1;
      else if (dist < ideal * 0.55) advance = -0.8;
      if (this.style === 'camper' && dist > ideal * 0.7) advance = 0;   // hold the angle
      const holding = this.style === 'camper';
      if (holding && this.post < 0) this._pickPost(W);
      if (this._wantCover(W)) {
        moveDir = this._navigate(W, dt, null);
      } else if (holding && !this._atNode(W, this.post)) {
        // walk to the claimed vantage point, trading shots on the way
        this.goal = this.post;
        moveDir = this._navigate(W, dt, null, true);
      } else {
        moveDir.x = towards.x * advance + side.x * this.strafe * 0.85;
        moveDir.z = towards.z * advance + side.z * this.strafe * 0.85;
        // if the straight line is blocked, fall back to the nav graph
        const probe = 1.3;
        if (!W.collider.los(this.pos.x, this.pos.y + 0.55, this.pos.z,
          this.pos.x + moveDir.x * probe, this.pos.y + 0.55, this.pos.z + moveDir.z * probe)) {
          moveDir = this._navigate(W, dt, { x: t.pos.x, z: t.pos.z, direct: true });
        }
      }
      if (dist > 26 && this.weapon.w.kind === 'sniper') wantCrouch = Math.random() < 0.5;
      if (dist > 30) sprint = true;

      // grenades
      if (this.grenades > 0 && this.grenadeCd <= 0 && dist > 9 && dist < 26 &&
          Math.random() < this.D.grenade * dt * 3) {
        this.grenadeCd = rand(26, 14);
        this.grenades--;
        W.botGrenade(this, t.pos);
      }
    } else if (this.state === 'hunt' && this.lastSeenAt) {
      moveDir = this._navigate(W, dt, { x: this.lastSeenAt.x, z: this.lastSeenAt.z, direct: true });
      sprint = true;
      if (Math.hypot(this.lastSeenAt.x - this.pos.x, this.lastSeenAt.z - this.pos.z) < 2.2) {
        this.state = 'roam';
        this.lastSeenAt = null;
        this.goal = -1;
      }
    } else {
      moveDir = this._navigate(W, dt, null);
      sprint = true;
    }

    /* ---- aiming ---- */
    let desiredYaw = this.yaw, desiredPitch = this.pitch;
    if (t) {
      const aimAt = {
        x: t.pos.x + (t.vel ? t.vel.x * 0.06 : 0),
        y: t.pos.y + t.height * (this.D.aimErr < 0.02 ? 0.78 : 0.64),
        z: t.pos.z + (t.vel ? t.vel.z * 0.06 : 0),
      };
      const e = this.eye;
      const dx = aimAt.x - e.x, dy = aimAt.y - e.y, dz = aimAt.z - e.z;
      const flat = Math.hypot(dx, dz);
      desiredYaw = Math.atan2(-dx, -dz);
      desiredPitch = Math.atan2(dy, flat);
      this.errT -= dt;
      if (this.errT <= 0) {
        this.errT = rand(0.45, 0.18);
        const settle = clamp(1.25 - this.seenFor * 0.5, 0.35, 1.25);
        this.errX = gauss() * this.D.aimErr * 2.4 * settle;
        this.errY = gauss() * this.D.aimErr * 1.7 * settle;
      }
      desiredYaw += this.errX;
      desiredPitch += this.errY;
    } else if (moveDir.x || moveDir.z) {
      desiredYaw = Math.atan2(-moveDir.x, -moveDir.z);
      desiredPitch *= 0.8;
    }
    const turn = (t ? this.D.aimSpeed : 4.2) * dt;
    let dyaw = desiredYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += clamp(dyaw, -turn, turn);
    this.pitch += clamp(desiredPitch - this.pitch, -turn, turn);

    /* ---- trigger discipline ---- */
    let shooting = false;
    if (t && this.reactT <= 0 && this.weapon.reloading <= 0) {
      const e = this.eye;
      const dx = t.pos.x - e.x, dy = t.pos.y + t.height * 0.7 - e.y, dz = t.pos.z - e.z;
      const len = Math.hypot(dx, dy, dz);
      const fx = -Math.sin(this.yaw) * Math.cos(this.pitch);
      const fy = Math.sin(this.pitch);
      const fz = -Math.cos(this.yaw) * Math.cos(this.pitch);
      const dot = (dx * fx + dy * fy + dz * fz) / (len || 1);
      const onTarget = dot > (len > 25 ? 0.9985 : 0.985);
      if (onTarget) {
        if (this.burstT > 0) { shooting = true; this.burstT -= dt; }
        else if (this.pauseT > 0) this.pauseT -= dt;
        else { this.burstT = rand(this.D.burst[1], this.D.burst[0]); this.pauseT = rand(this.D.pause[1], this.D.pause[0]); }
      }
    }
    if (this.weapon.empty) {
      this.weapon.startReload();
      shooting = false;
    }
    if (shooting && this.weapon.ready(true, true)) {
      this.weapon.consume();
      W.botShoot(this);
    }

    /* ---- locomotion ---- */
    this.crouch = wantCrouch && !!t;
    this.height = this.crouch ? 1.25 : 1.8;
    const speed = (sprint && !t ? SPRINT : WALK) * this.D.speed * (this.crouch ? 0.55 : 1);
    const len = Math.hypot(moveDir.x, moveDir.z);
    const want = len > 0.01
      ? { x: (moveDir.x / len) * speed, z: (moveDir.z / len) * speed }
      : { x: 0, z: 0 };
    this.vel.x += (want.x - this.vel.x) * Math.min(1, ACCEL * dt / 6);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, ACCEL * dt / 6);
    this.vel.y -= GRAVITY * dt;

    const res = W.collider.move(this.pos, this.vel, dt, 0.32, this.height, 0.45);

    // unstick: hop or repath when we grind against geometry
    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    this.lastPos.x = this.pos.x; this.lastPos.z = this.pos.z;
    if (len > 0.1 && moved < 0.02 * (dt / 0.016)) {
      this.stuckT += dt;
      if (this.stuckT > 0.45) {
        this.goal = -1;
        this.stuckT = 0;
        if (res.grounded && this.jumpCd <= 0) { this.vel.y = 6.2; this.jumpCd = 1.2; }
      }
    } else this.stuckT = 0;

    if (this.pos.y < -3) W.rescue(this);       // squeezed through the floor somehow

    /* ---- footsteps ---- */
    this.stepAcc = (this.stepAcc || 0) + Math.hypot(this.vel.x, this.vel.z) * dt;
    if (this.stepAcc > 2.0 && res.grounded) {
      this.stepAcc = 0;
      W.sfx.step(this.pos, sprint);
    }

    this.model.update({
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      yaw: this.yaw, pitch: this.pitch,
      speed: Math.hypot(this.vel.x, this.vel.z),
      crouch: this.crouch, dead: false,
    }, dt);
  }
}
