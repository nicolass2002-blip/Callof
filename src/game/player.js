// The local player: movement, camera, weapon handling, health.
import * as THREE from 'three';
import { clamp, smooth, gauss } from '../core/util.js';
import { WeaponState, WEAPONS, ViewModel, Recoil } from './weapons.js';
import { hitscan, damageAt } from './combat.js';
import { CHEATS, aimbotStep } from './cheats.js';

const WALK = 4.6, SPRINT = 6.8, CROUCH_SPEED = 2.3, ADS_SPEED = 3.1;
const ACCEL = 13, AIR_ACCEL = 2.2, FRICTION = 11, GRAVITY = 21, JUMP = 7.0;
const STAND_H = 1.8, CROUCH_H = 1.25;
const EYE_STAND = 1.64, EYE_CROUCH = 1.02;

export class Player {
  constructor(camera, scene, sfx, effects, opts = {}) {
    this.camera = camera;
    this.scene = scene;
    this.sfx = sfx;
    this.effects = effects;

    this.name = opts.name || 'VOUS';
    this.team = 'A';
    this.isPlayer = true;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.height = STAND_H;
    this.crouch = false;
    this.grounded = true;
    this.health = 100;
    this.alive = true;
    this.kills = 0; this.deaths = 0; this.streak = 0; this.bestStreak = 0;
    this.shotsFired = 0; this.shotsHit = 0;
    this.ping = 12;

    this.vm = new ViewModel(camera);
    this.recoil = new Recoil();
    this.loadout = { primary: opts.primary || 'm4', secondary: 'm1911' };
    this.weapons = {
      primary: new WeaponState(this.loadout.primary),
      secondary: new WeaponState(this.loadout.secondary),
    };
    this.slot = 'primary';
    this.grenades = 2;
    this.ads = false;
    this.adsBlend = 0;
    this.sprinting = false;
    this.baseFov = opts.fov || 85;
    this.fov = this.baseFov;
    this.bobT = 0;
    this.bobAmp = 0;
    this.landDip = 0;
    this.lastDamage = -99;
    this.stepAcc = 0;
    this.swapT = 0;
    this.throwT = 0;
    this.deadTime = 0;
    this.shakeT = 0; this.shakeAmp = 0;
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.lastHitDirs = [];
    this.scoped = false;
  }

  get weapon() { return this.weapons[this.slot]; }
  get eyeY() { return this.crouch ? EYE_CROUCH : EYE_STAND; }
  get eye() { return { x: this.pos.x, y: this.pos.y + this.eyeY, z: this.pos.z }; }

  setLoadout(primary) {
    this.loadout.primary = primary;
    this.weapons.primary = new WeaponState(primary);
    if (this.slot === 'primary') this.vm.equip(primary);
  }

  spawn(at, yaw) {
    this.pos.x = at.x; this.pos.y = at.y + 0.05; this.pos.z = at.z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = yaw; this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.crouch = false;
    this.height = STAND_H;
    this.grenades = 2;
    this.slot = 'primary';
    this.weapons.primary.set(this.loadout.primary);
    this.weapons.secondary.set(this.loadout.secondary);
    this.vm.equip(this.loadout.primary);
    this.vm.group.visible = true;
    this.recoil.pitch = this.recoil.yaw = 0;
    this.deadTime = 0;
    this.lastDamage = -99;
  }

  die() {
    this.alive = false;
    this.deaths++;
    this.streak = 0;
    this.deadTime = 0;
    this.ads = false;
  }

  hurt(dmg, from, W) {
    if (!this.alive) return;
    if (CHEATS.enabled && CHEATS.god) return;         // admin: invincible
    this.health -= dmg;
    this.lastDamage = W.time;
    this.sfx.pain();
    this.shake(0.22, Math.min(0.06, dmg * 0.0022));
    if (from) {
      const ang = Math.atan2(-(from.x - this.pos.x), -(from.z - this.pos.z));
      this.lastHitDirs.push({ ang, t: 0.9 });
    }
  }

  shake(time, amp) {
    this.shakeT = Math.max(this.shakeT, time);
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  switchSlot(slot) {
    if (slot === this.slot || this.swapT > 0) return;
    this.slot = slot;
    this.weapon.reloading = 0;
    this.swapT = 0.5;
    this.vm.equip(this.weapon.id);
    this.sfx.click(1100, 0.22, 0.09);
  }

  /* --------------------------------- fire -------------------------------- */

  _shoot(W) {
    const st = this.weapon;
    const w = st.w;
    st.consume();
    this.shotsFired++;
    this.sprinting = false;

    const moving = Math.hypot(this.vel.x, this.vel.z) > 1.2;
    const admin = CHEATS.enabled;
    const spread = admin && CHEATS.noSpread
      ? 0
      : st.spread(this.ads, moving, this.crouch, !this.grounded);
    const origin = this.eye;
    const muzzle = this.vm.muzzleWorld(this._tmp).clone();
    const enemies = W.actors.filter((a) => a !== this && a.alive);

    let hitSomething = false, killed = false;
    for (let p = 0; p < w.pellets; p++) {
      // spread is applied in camera space: bell-shaped for single rounds,
      // flat across the cone for buckshot
      const s = spread;
      const rx = w.pellets > 1 ? (Math.random() - 0.5) * 2 : gauss();
      const ry = w.pellets > 1 ? (Math.random() - 0.5) * 2 : gauss();
      this._dir.set(rx * s, ry * s, -1).normalize().applyEuler(this.camera.rotation);
      const dir = { x: this._dir.x, y: this._dir.y, z: this._dir.z };
      const res = hitscan(W.collider, enemies, origin, dir, w.far * 2.2, w);

      if (res.kind === 'actor') {
        const dist = res.t;
        const dmg = admin && CHEATS.oneShot ? 9999 : damageAt(w, dist) * res.mult;
        hitSomething = true;
        this.effects.blood(res.point, dir);
        const dead = W.damage(res.actor, dmg, this, res.zone);
        killed = killed || dead;
      } else if (res.kind === 'world') {
        this.effects.impact(res.point, res.normal, res.mat, w.kind === 'sniper');
      }
      this.effects.tracer(muzzle, res.point, w.kind === 'shotgun' ? 0.5 : 1);
    }
    if (hitSomething) {
      this.shotsHit++;
      W.onHitmarker(killed);
    }

    this.effects.muzzleFlash(muzzle);
    this.vm.fire(w.recoil);
    if (!(admin && CHEATS.noRecoil)) this.recoil.punch(w.recoil, this.ads ? 0.6 : 1);
    this.shake(0.08, w.recoil.kick * 0.06);
    this.sfx.shot(w.sound, null);
    W.notifyShot(this.pos, this, w.kind === 'sniper' || w.kind === 'shotgun' ? 1.4 : 1);
  }

  _throwGrenade(W) {
    if (this.grenades <= 0 || this.throwT > 0) return;
    this.grenades--;
    this.throwT = 0.6;
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    const o = this.eye;
    W.throwGrenade(
      { x: o.x + dir.x * 0.5, y: o.y + dir.y * 0.5 - 0.1, z: o.z + dir.z * 0.5 },
      { x: dir.x, y: dir.y + 0.18, z: dir.z },
      this,
    );
    this.sfx.click(700, 0.2, 0.08);
  }

  /* -------------------------------- update ------------------------------- */

  update(dt, input, W) {
    const look = input.look();
    this._look = look;
    if (!this.alive) {
      this.deadTime += dt;
      this.vm.group.visible = false;
      // death cam: sag toward the ground and keep looking at the killer
      this.pitch = smooth(this.pitch, -0.35, 3, dt);
      const dropY = Math.max(0.35, this.eyeY - this.deadTime * 1.6);
      this.camera.position.set(this.pos.x, this.pos.y + dropY, this.pos.z);
      if (this.killerRef && this.killerRef.alive) {
        const dx = this.killerRef.pos.x - this.pos.x, dz = this.killerRef.pos.z - this.pos.z;
        const want = Math.atan2(-dx, -dz);
        let d = want - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, dt * 2.5);
      }
      this.camera.rotation.set(this.pitch, this.yaw, Math.min(0.5, this.deadTime * 0.6), 'YXZ');
      return;
    }

    const st = this.weapon;
    st.tick(dt);
    this.swapT = Math.max(0, this.swapT - dt);
    this.throwT = Math.max(0, this.throwT - dt);

    /* ---- look ---- */
    const adsScale = this.adsBlend > 0.5 ? (st.w.scope ? 0.35 : 0.72) : 1;
    this.yaw += look.yaw * adsScale;
    this.pitch = clamp(this.pitch + look.pitch * adsScale, -1.5, 1.5);
    this.recoil.update(dt);

    /* ---- admin mod ---- */
    const autoFire = aimbotStep(this, W, dt);
    if (CHEATS.enabled && CHEATS.infiniteAmmo) {
      st.mag = st.w.mag;
      st.reserve = st.w.reserve;
      st.reloading = 0;
      this.grenades = Math.max(this.grenades, 2);
    }
    // keep the camera in sync before firing: the shot must use this frame's aim
    this.camera.rotation.set(
      clamp(this.pitch + this.recoil.pitch, -1.55, 1.55),
      this.yaw + this.recoil.yaw,
      this.camera.rotation.z,
      'YXZ',
    );

    /* ---- intent ---- */
    const ax = input.moveAxis();
    const wantCrouch = input.any('ControlLeft', 'ControlRight', 'KeyC');
    const canSprint = ax.y > 0.4 && !wantCrouch && !this.ads && st.reloading <= 0;
    this.sprinting = canSprint && input.any('ShiftLeft', 'ShiftRight');

    // crouch (only stand up when there is headroom)
    if (wantCrouch !== this.crouch) {
      if (!wantCrouch) {
        const cand = W.collider.query(this.pos.x - 1, this.pos.z - 1, this.pos.x + 1, this.pos.z + 1);
        if (W.collider.free(this.pos.x, this.pos.y, this.pos.z, 0.33, STAND_H, cand)) {
          this.crouch = false;
          this.height = STAND_H;
        }
      } else {
        this.crouch = true;
        this.height = CROUCH_H;
      }
    }

    this.ads = input.buttons[2] && st.reloading <= 0 && this.throwT <= 0;
    this.adsBlend = smooth(this.adsBlend, this.ads ? 1 : 0, 1 / Math.max(0.04, st.w.adsTime) * 0.9, dt);

    if (input.anyHit('KeyR')) st.startReload();
    if (input.anyHit('Digit1')) this.switchSlot('primary');
    if (input.anyHit('Digit2')) this.switchSlot('secondary');
    if (input.mouse.wheel) this.switchSlot(this.slot === 'primary' ? 'secondary' : 'primary');
    if (input.anyHit('KeyB')) {
      const m = st.cycleMode();
      if (m) this.sfx.click(1400, 0.16, 0.05);
    }
    if (input.anyHit('KeyG')) this._throwGrenade(W);

    /* ---- shooting ---- */
    const trigger = input.buttons[0] || autoFire;
    const pressed = input.clicked[0] || autoFire;
    if (st.ready(trigger, pressed) && this.swapT <= 0 && this.throwT <= 0) {
      this._shoot(W);
    } else if (input.clicked[0] && st.empty && st.reloading <= 0) {
      this.sfx.click(900, 0.2, 0.05);
      st.startReload();
    }
    if (st.empty && st.reloading <= 0 && st.reserve > 0) st.startReload();

    /* ---- movement ---- */
    if (CHEATS.enabled && CHEATS.noclip) {
      // free flight: straight through the level, no gravity, no collisions
      const cp = Math.cos(this.pitch);
      const f = { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
      const r = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
      const spd = (this.sprinting ? 18 : 8.5) * CHEATS.speed;
      const lift = (input.any('Space') ? 1 : 0) - (wantCrouch ? 1 : 0);
      this.vel.x = (f.x * ax.y + r.x * ax.x) * spd;
      this.vel.z = (f.z * ax.y + r.z * ax.x) * spd;
      this.vel.y = f.y * ax.y * spd + lift * spd * 0.85;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      this.pos.z += this.vel.z * dt;
      this.grounded = false;
      this.crouch = false;
      this.height = STAND_H;
      this._postMove(dt, input, W, 0, true);
      return;
    }
    let speed = (this.crouch ? CROUCH_SPEED : this.ads ? ADS_SPEED : this.sprinting ? SPRINT : WALK)
      * (CHEATS.enabled ? CHEATS.speed : 1);
    if (st.reloading > 0) speed *= 0.92;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const fx = -sinY, fz = -cosY;          // forward
    const rx = cosY, rz = -sinY;           // right
    const wishX = fx * ax.y + rx * ax.x;
    const wishZ = fz * ax.y + rz * ax.x;
    const wl = Math.hypot(wishX, wishZ);
    const targetX = wl > 0.001 ? (wishX / wl) * speed : 0;
    const targetZ = wl > 0.001 ? (wishZ / wl) * speed : 0;

    const accel = this.grounded ? ACCEL : AIR_ACCEL;
    if (wl > 0.001) {
      this.vel.x += (targetX - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (targetZ - this.vel.z) * Math.min(1, accel * dt);
    } else if (this.grounded) {
      const f = Math.min(1, FRICTION * dt);
      this.vel.x -= this.vel.x * f;
      this.vel.z -= this.vel.z * f;
    }

    if (input.any('Space') && this.grounded && !this.crouch) {
      this.vel.y = JUMP * (CHEATS.enabled ? CHEATS.jump : 1);
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;

    const fallSpeed = this.vel.y;
    const res = W.collider.move(this.pos, this.vel, dt, 0.33, this.height, 0.45);
    if (res.grounded && !this.grounded) {
      this.landDip = clamp(-fallSpeed * 0.012, 0, 0.16);
      this.sfx.step(this.pos, true);
      if (fallSpeed < -14) this.hurt(Math.min(60, (-fallSpeed - 14) * 5), null, W);
    }
    this.grounded = res.grounded;

    // keep the player inside the test site
    if (!(CHEATS.enabled && CHEATS.noclip)) {
      const b = W.bounds;
      this.pos.x = clamp(this.pos.x, b.minX, b.maxX);
      this.pos.z = clamp(this.pos.z, b.minZ, b.maxZ);
    }

    this._postMove(dt, input, W, false);
  }

  /** Steps, regen, camera, FOV and view model — shared with noclip flight. */
  _postMove(dt, input, W, noclip) {
    const st = this.weapon;
    /* ---- footsteps ---- */
    const groundSpeed = noclip ? 0 : Math.hypot(this.vel.x, this.vel.z);
    this.stepAcc += groundSpeed * dt;
    const stride = this.sprinting ? 2.4 : this.crouch ? 3.2 : 1.9;
    if (this.stepAcc > stride && this.grounded && groundSpeed > 0.8) {
      this.stepAcc = 0;
      this.sfx.step(this.pos, this.sprinting);
      W.notifyShot(this.pos, this, 0.18);
    }

    /* ---- health regen ---- */
    if (W.time - this.lastDamage > 4.2 && this.health < 100) {
      this.health = Math.min(100, this.health + 24 * dt);
    }

    /* ---- camera ---- */
    this.bobT += groundSpeed * dt * (this.sprinting ? 2.1 : 1.7);
    this.bobAmp = smooth(this.bobAmp, this.grounded ? clamp(groundSpeed / SPRINT, 0, 1) : 0, 8, dt);
    const bobScale = (1 - this.adsBlend * 0.75) * this.bobAmp;
    const bobY = Math.abs(Math.sin(this.bobT)) * 0.045 * bobScale;
    const bobX = Math.cos(this.bobT) * 0.035 * bobScale;
    this.landDip = smooth(this.landDip, 0, 7, dt);

    this.shakeT = Math.max(0, this.shakeT - dt);
    const shake = this.shakeT > 0 ? this.shakeAmp * (this.shakeT / 0.25) : 0;
    if (this.shakeT <= 0) this.shakeAmp = 0;

    const eyeY = smooth(this.camera.position.y - this.pos.y, this.eyeY, 12, dt);
    this.camera.position.set(
      this.pos.x + bobX * 0.4 + (Math.random() - 0.5) * shake * 2,
      this.pos.y + eyeY + bobY - this.landDip + (Math.random() - 0.5) * shake * 2,
      this.pos.z + (Math.random() - 0.5) * shake * 2,
    );
    const roll = -bobX * 0.35 + (this.sprinting ? Math.sin(this.bobT) * 0.012 : 0);
    this.camera.rotation.set(
      clamp(this.pitch + this.recoil.pitch, -1.55, 1.55),
      this.yaw + this.recoil.yaw,
      roll,
      'YXZ',
    );

    /* ---- fov + view model ---- */
    const targetFov = this.ads ? st.w.adsFov : this.baseFov + (this.sprinting ? 4 : 0);
    this.fov = smooth(this.fov, targetFov, 10, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.vm.update(dt, {
      ads: this.ads,
      adsTime: st.w.adsTime,
      scoped: st.w.scope && this.adsBlend > 0.72,
      moving: groundSpeed > 0.6,
      grounded: this.grounded,
      sprinting: this.sprinting,
      reloadFrac: st.reloading > 0 ? st.reloading / st.w.reload : 0,
      lookDx: this._look.yaw,
      lookDy: this._look.pitch,
    });

    // reload sound cues
    if (st.reloading > 0) {
      const f = 1 - st.reloading / st.w.reload;
      this._reloadStep = this._reloadStep ?? 0;
      const stepIdx = f > 0.72 ? 2 : f > 0.34 ? 1 : 0;
      if (stepIdx !== this._reloadStep) { this._reloadStep = stepIdx; this.sfx.reload(stepIdx); }
    } else this._reloadStep = null;

    // hit-direction indicators decay
    for (let i = this.lastHitDirs.length - 1; i >= 0; i--) {
      this.lastHitDirs[i].t -= dt;
      if (this.lastHitDirs[i].t <= 0) this.lastHitDirs.splice(i, 1);
    }

    this.scoped = st.w.scope && this.adsBlend > 0.72;
  }
}
