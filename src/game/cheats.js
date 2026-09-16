// ============================================================================
//  ADMIN MOD — debug / cheat layer for the offline match.
//  Pure state + logic; the panel (src/ui/admin.js) and the overlay
//  (src/ui/esp.js) only read and write this object.
// ============================================================================
import { clamp } from '../core/util.js';

export const CHEATS = {
  enabled: true,          // master switch for the whole mod
  used: false,            // set as soon as anything is actually toggled on

  /* player */
  god: false,
  noclip: false,
  infiniteAmmo: false,
  oneShot: false,
  noRecoil: false,
  noSpread: false,
  speed: 1,
  jump: 1,

  /* aimbot */
  aimbot: {
    on: false,
    target: 'head',       // head | chest
    fov: 35,              // degrees of capture cone
    smooth: 12,           // 1 = syrupy, 100 = instant snap
    autoFire: false,
    throughWalls: false,
    keepOnTarget: true,   // stay locked until the target dies or leaves the cone
  },

  /* esp */
  esp: {
    on: false,
    boxes: true,
    names: true,
    health: true,
    distance: true,
    tracers: false,
    skeleton: false,
    allies: false,
    radar: false,         // reveal every enemy on the minimap
    maxDist: 120,
  },

  /* world */
  freezeBots: false,
  slowMotion: 1,

  /* runtime only (not persisted) */
  _lock: null,
  _lockAngle: 999,
  _lastLock: null,
};

const SAVE_KEY = 'nuketown.admin';
const SKIP = new Set(['used', '_lock', '_lockAngle', '_lastLock']);

export function loadCheats() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    for (const [k, v] of Object.entries(raw)) {
      if (SKIP.has(k)) continue;
      if (v && typeof v === 'object' && CHEATS[k] && typeof CHEATS[k] === 'object') Object.assign(CHEATS[k], v);
      else if (k in CHEATS) CHEATS[k] = v;
    }
  } catch { /* no storage, keep defaults */ }
  return CHEATS;
}

export function saveCheats() {
  try {
    const out = {};
    for (const [k, v] of Object.entries(CHEATS)) {
      if (SKIP.has(k) || k.startsWith('_')) continue;
      out[k] = v && typeof v === 'object' ? { ...v } : v;
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(out));
  } catch { /* private mode */ }
}

/** True when any cheat is currently doing something. */
export function anyActive() {
  const c = CHEATS;
  if (!c.enabled) return false;
  return c.god || c.noclip || c.infiniteAmmo || c.oneShot || c.noRecoil || c.noSpread
    || c.aimbot.on || c.esp.on || c.freezeBots
    || Math.abs(c.speed - 1) > 0.01 || Math.abs(c.jump - 1) > 0.01;
}

/** Short labels for the on-screen status block. */
export function activeLabels() {
  const c = CHEATS;
  const out = [];
  if (!c.enabled) return out;
  if (c.god) out.push('GOD');
  if (c.noclip) out.push('NOCLIP');
  if (c.aimbot.on) out.push(`AIMBOT${c.aimbot.autoFire ? '+AUTO' : ''}`);
  if (c.esp.on) out.push('ESP');
  if (c.infiniteAmmo) out.push('MUNITIONS ∞');
  if (c.oneShot) out.push('ONE SHOT');
  if (c.noRecoil) out.push('SANS RECUL');
  if (c.noSpread) out.push('SANS DISPERSION');
  if (c.freezeBots) out.push('BOTS GELÉS');
  if (Math.abs(c.speed - 1) > 0.01) out.push(`VITESSE ${c.speed.toFixed(1)}×`);
  if (Math.abs(c.jump - 1) > 0.01) out.push(`SAUT ${c.jump.toFixed(1)}×`);
  return out;
}

export function markUsed() {
  if (anyActive()) CHEATS.used = true;
}

/* --------------------------------- aimbot -------------------------------- */

export function aimPoint(actor, mode) {
  const h = actor.height;
  return {
    x: actor.pos.x,
    y: actor.pos.y + (mode === 'chest' ? h * 0.72 : h - 0.15),
    z: actor.pos.z,
  };
}

/**
 * Steers the player's view toward the best enemy.
 * @returns {boolean} true when the auto-trigger should pull this frame.
 */
export function aimbotStep(player, W, dt) {
  const c = CHEATS;
  c._lock = null;
  c._lockAngle = 999;
  if (!c.enabled || !c.aimbot.on || !player.alive) return false;

  const A = c.aimbot;
  const eye = player.eye;
  const yaw = player.yaw + player.recoil.yaw;
  const pitch = clamp(player.pitch + player.recoil.pitch, -1.5, 1.5);
  const cp = Math.cos(pitch);
  const fwd = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };

  let best = null, bestAng = Infinity;
  for (const a of W.actors) {
    if (a === player || !a.alive || a.team === player.team) continue;
    const p = aimPoint(a, A.target);
    const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.4 || dist > 160) continue;
    const dot = clamp((dx * fwd.x + dy * fwd.y + dz * fwd.z) / dist, -1, 1);
    const ang = (Math.acos(dot) * 180) / Math.PI;
    // an already-locked target keeps priority inside a widened cone
    const cone = A.keepOnTarget && c._lastLock === a ? A.fov * 1.6 : A.fov;
    if (ang > cone) continue;
    if (!A.throughWalls && !W.collider.los(eye.x, eye.y, eye.z, p.x, p.y, p.z)) continue;
    const score = A.keepOnTarget && c._lastLock === a ? ang * 0.55 : ang;
    if (score < bestAng) { bestAng = score; best = { actor: a, point: p, dist, ang }; }
  }

  c._lastLock = best ? best.actor : null;
  if (!best) return false;

  const dx = best.point.x - eye.x, dy = best.point.y - eye.y, dz = best.point.z - eye.z;
  const flat = Math.hypot(dx, dz);
  // subtract the current recoil so the crosshair lands on the target, not beside it
  const wantYaw = Math.atan2(-dx, -dz) - player.recoil.yaw;
  const wantPitch = Math.atan2(dy, flat) - player.recoil.pitch;

  const k = A.smooth >= 99 ? 1 : 1 - Math.exp(-A.smooth * 0.45 * dt);
  let d = wantYaw - player.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  player.yaw += d * k;
  player.pitch = clamp(player.pitch + (wantPitch - player.pitch) * k, -1.5, 1.5);

  c._lock = best;
  c._lockAngle = best.ang;
  return A.autoFire && best.ang < 4.5 && player.weapon.mag > 0;
}

/* --------------------------- one-off admin actions ----------------------- */

export const ACTIONS = {
  killAll: (ctx) => {
    const { match, player } = ctx;
    for (const a of [...match.actors]) {
      if (a.alive && a.team !== player.team) match.damage(a, 9999, player, 'head');
    }
  },
  killTeam: (ctx) => {
    const { match, player } = ctx;
    for (const a of [...match.actors]) {
      if (a.alive && a !== player && a.team === player.team) match.damage(a, 9999, a, 'chest');
    }
  },
  heal: (ctx) => { ctx.player.health = 100; },
  refill: (ctx) => {
    const p = ctx.player;
    for (const s of Object.values(p.weapons)) { s.mag = s.w.mag; s.reserve = s.w.reserve; s.reloading = 0; }
    p.grenades = 4;
  },
  teleport: (ctx) => {
    // jump to whatever the crosshair is pointing at
    const { player, match } = ctx;
    const eye = player.eye;
    const cp = Math.cos(player.pitch);
    const dir = {
      x: -Math.sin(player.yaw) * cp,
      y: Math.sin(player.pitch),
      z: -Math.cos(player.yaw) * cp,
    };
    const hit = match.collider.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 160);
    const t = hit ? Math.max(0.5, hit.dist - 1.2) : 40;
    player.pos.x = eye.x + dir.x * t;
    player.pos.y = Math.max(-1, eye.y + dir.y * t - 1.64);
    player.pos.z = eye.z + dir.z * t;
    player.vel.x = player.vel.y = player.vel.z = 0;
  },
  endMatch: (ctx) => { ctx.match.finish(); },
  resetScore: (ctx) => { ctx.match.score.A = 0; ctx.match.score.B = 0; },
};
