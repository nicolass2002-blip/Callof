// Team-deathmatch director: rosters, spawning, damage routing, scoring.
// This object is also the "world context" (W) handed to the player and bots.
import { clamp, rand, choice, gauss, callsigns } from '../core/util.js';
import { hitscan, damageAt, Grenades } from './combat.js';
import { Bot, DIFFICULTY } from './bots.js';
import { WEAPONS, PRIMARIES } from './weapons.js';
import { CHEATS } from './cheats.js';
import { Streaks } from './streaks.js';
import { Domination, DOM } from './domination.js';

export const MATCH = { scoreLimit: 75, duration: 600, teamSize: 6 };

export const MODES = {
  tdm: { id: 'tdm', name: 'MATCH À MORT PAR ÉQUIPE', short: 'TDM', scoreLimit: MATCH.scoreLimit, duration: MATCH.duration,
    brief: 'Premier camp à 75 éliminations, ou meilleur score après 10 minutes.' },
  dom: { id: 'dom', name: 'DOMINATION', short: 'DOM', scoreLimit: DOM.scoreLimit, duration: DOM.duration,
    brief: 'Trois drapeaux : A au pavillon jaune, B au milieu de la rue, C au pavillon vert. '
      + 'Chaque drapeau tenu rapporte des points toutes les 5 secondes. Objectif : 200 points.' },
};

export class Match {
  constructor({ scene, collider, nav, spawns, bounds, sfx, effects, player, difficulty, onEvent, mode }) {
    this.scene = scene;
    this.collider = collider;
    this.nav = nav;
    this.spawns = spawns;
    this.bounds = bounds;
    this.sfx = sfx;
    this.effects = effects;
    this.player = player;
    this.onEvent = onEvent || (() => {});
    this.difficulty = difficulty;
    this.grenadeSys = new Grenades(scene, collider, effects);
    this.streaks = new Streaks(scene, this);

    this.mode = MODES[mode] ? mode : 'tdm';
    this.rules = MODES[this.mode];
    this.time = 0;
    this.warmup = 3.0;                 // "prepare for battle" freeze
    this.clock = this.rules.duration;
    this.score = { A: 0, B: 0 };
    this.over = false;
    this.bots = [];
    this.actors = [];
    this.respawns = [];
    this.recentFire = new Map();        // actor id → time last fired (for the minimap)

    const names = callsigns(MATCH.teamSize * 2 - 1);
    let n = 0;
    const pick = (team) => {
      const pool = team === 'A' ? ['m4', 'mp5', 'ak', 'shotgun'] : ['ak', 'mp5', 'm4', 'shotgun', 'svd'];
      return choice(pool);
    };
    for (let i = 0; i < MATCH.teamSize - 1; i++) {
      this.bots.push(new Bot(names[n++], 'A', pick('A'), difficulty, scene));
    }
    for (let i = 0; i < MATCH.teamSize; i++) {
      this.bots.push(new Bot(names[n++], 'B', pick('B'), difficulty, scene));
    }
    this.actors = [this.player, ...this.bots];

    // allied name tags only
    for (const b of this.bots) b.model.setVisibleTag(b.team === this.player.team);

    this.spawnActor(this.player, true);
    for (const b of this.bots) this.spawnActor(b, true);

    this.dom = this.mode === 'dom' ? new Domination(this, scene) : null;
  }

  /* ------------------------------- spawning ------------------------------ */

  pickSpawn(team) {
    const list = this.spawns[team];
    const enemies = this.actors.filter((a) => a.alive && a.team !== team);
    let scored = list.map((s) => {
      let score = 0;
      let nearest = 999;
      for (const e of enemies) {
        const d = Math.hypot(e.pos.x - s.x, e.pos.z - s.z);
        nearest = Math.min(nearest, d);
        if (d < 14 && this.collider.los(s.x, s.y + 1.5, s.z, e.pos.x, e.pos.y + 1.5, e.pos.z)) score -= 60;
      }
      score += clamp(nearest, 0, 40);
      // do not stack spawns
      for (const a of this.actors) {
        if (a.alive && a.team === team && Math.hypot(a.pos.x - s.x, a.pos.z - s.z) < 3) score -= 12;
      }
      return { s, score: score + rand(6, 0) };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].s;
  }

  /** Put an actor that ended up outside the world back into play, no scoring. */
  rescue(actor) {
    const s = this.pickSpawn(actor.team);
    const hp = actor.health;
    actor.spawn(s, s.yaw);
    actor.health = Math.max(1, hp);
  }

  spawnActor(actor, initial = false) {
    const s = this.pickSpawn(actor.team);
    actor.spawn(s, s.yaw + rand(0.3, -0.3));
    if (!initial && actor.isPlayer) this.onEvent({ type: 'spawned' });
  }

  /* -------------------------------- damage ------------------------------- */

  /** @returns true when the hit killed the target. */
  damage(target, dmg, attacker, zone = 'chest', srcName = null) {
    if (!target.alive || this.over) return false;
    if (target.isPlayer) {
      target.hurt(dmg, attacker ? attacker.pos : null, this);
    } else {
      target.health -= dmg;
      // getting shot makes a bot react even if it had not spotted you
      if (attacker && !target.target) {
        target.lastSeenAt = { x: attacker.pos.x, y: attacker.pos.y, z: attacker.pos.z };
        target.lastSeenTime = this.time - 0.6;
        target.state = 'hunt';
        target.goal = -1;
      }
    }
    if (target.health <= 0) {
      this.kill(target, attacker, zone, srcName);
      return true;
    }
    return false;
  }

  kill(victim, attacker, zone, srcName = null) {
    victim.die();
    if (victim.isPlayer) victim.killerRef = attacker;
    const w = attacker ? (attacker.isPlayer ? attacker.weapon.w : attacker.weapon.w) : null;

    if (attacker && attacker.team !== victim.team) {
      attacker.kills++;
      if (this.mode === 'tdm') this.score[attacker.team]++;
      if (attacker.isPlayer) {
        attacker.streak++;
        attacker.bestStreak = Math.max(attacker.bestStreak, attacker.streak);
        const reward = this.streaks.onKill(attacker.streak);
        if (reward) this.onEvent({ type: 'streak', n: attacker.streak, reward });
        else if ([4, 6, 8, 9, 11, 13].includes(attacker.streak)) {
          this.onEvent({ type: 'streak', n: attacker.streak });
        }
      }
    } else if ((attacker === victim || !attacker) && this.mode === 'tdm') {
      this.score[victim.team === 'A' ? 'B' : 'A']++;
    }

    this.onEvent({
      type: 'kill',
      killer: attacker ? attacker.name : 'LE SITE',
      killerTeam: attacker ? attacker.team : null,
      victim: victim.name,
      victimTeam: victim.team,
      weapon: srcName || (w ? w.name : 'EXPLOSION'),
      headshot: zone === 'head',
      mine: attacker === this.player,
      victimIsMe: victim === this.player,
    });

    this.respawns.push({ actor: victim, at: this.time + (victim.isPlayer ? 3.0 : rand(6.5, 3.5)) });

    if (this.score.A >= this.rules.scoreLimit || this.score.B >= this.rules.scoreLimit) this.finish();
  }

  /* ------------------------------ bot hooks ----------------------------- */

  botShoot(bot) {
    const w = bot.weapon.w;
    const eye = bot.eye;
    const fx = -Math.sin(bot.yaw) * Math.cos(bot.pitch);
    const fy = Math.sin(bot.pitch);
    const fz = -Math.cos(bot.yaw) * Math.cos(bot.pitch);
    const spread = bot.D.aimErr * 1.4 + (bot.weapon.bloom || 0) * 0.6;
    const targets = this.actors.filter((a) => a !== bot && a.alive);
    for (let p = 0; p < w.pellets; p++) {
      const dir = {
        x: fx + gauss() * spread,
        y: fy + gauss() * spread,
        z: fz + gauss() * spread,
      };
      const l = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= l; dir.y /= l; dir.z /= l;
      const res = hitscan(this.collider, targets, eye, dir, w.far * 2, w);
      if (res.kind === 'actor') {
        if (res.actor.team === bot.team) continue;          // no friendly fire
        const dmg = damageAt(w, res.t) * res.mult;
        this.effects.blood(res.point, dir);
        this.damage(res.actor, dmg, bot, res.zone);
        if (res.actor === this.player) this.sfx.whiz(this.player.pos);
      } else if (res.kind === 'world') {
        this.effects.impact(res.point, res.normal, res.mat, false);
      }
      // near-miss crack
      const toPlayer = {
        x: this.player.pos.x - eye.x,
        y: this.player.pos.y + 1.2 - eye.y,
        z: this.player.pos.z - eye.z,
      };
      const proj = toPlayer.x * dir.x + toPlayer.y * dir.y + toPlayer.z * dir.z;
      if (proj > 1 && proj < res.t) {
        const cx = eye.x + dir.x * proj, cy = eye.y + dir.y * proj, cz = eye.z + dir.z * proj;
        const miss = Math.hypot(cx - this.player.pos.x, cy - (this.player.pos.y + 1.2), cz - this.player.pos.z);
        if (miss < 1.6 && miss > 0.35) this.sfx.whiz({ x: cx, y: cy, z: cz });
      }
      this.effects.tracer(
        { x: eye.x + fx * 0.4, y: eye.y - 0.12 + fy * 0.4, z: eye.z + fz * 0.4 },
        res.point, 0.8,
      );
    }
    this.effects.muzzleFlash({ x: eye.x + fx * 0.5, y: eye.y + fy * 0.5, z: eye.z + fz * 0.5 });
    this.sfx.shot(w.sound, bot.pos);
    this.notifyShot(bot.pos, bot, w.kind === 'sniper' ? 1.4 : 1);
  }

  botGrenade(bot, targetPos) {
    const o = bot.eye;
    const dx = targetPos.x - o.x, dz = targetPos.z - o.z;
    const d = Math.hypot(dx, dz);
    const dir = { x: dx / d, y: 0.34 + clamp(d / 90, 0, 0.3), z: dz / d };
    const l = Math.hypot(dir.x, dir.y, dir.z);
    this.throwGrenade(
      { x: o.x + dir.x * 0.6, y: o.y, z: o.z + dir.z * 0.6 },
      { x: dir.x / l, y: dir.y / l, z: dir.z / l },
      bot, clamp(d / 17, 0.55, 1.15),
    );
  }

  throwGrenade(origin, dir, owner, power = 1, type = 'frag') {
    this.grenadeSys.throw_(origin, dir, owner, power, type);
  }

  /** Blind everyone who was looking at the pop. */
  applyFlash(point) {
    for (const a of this.actors) {
      if (!a.alive) continue;
      const eye = { x: a.pos.x, y: a.pos.y + a.height * 0.9, z: a.pos.z };
      const dx = point.x - eye.x, dy = point.y - eye.y, dz = point.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 22) continue;
      if (!this.collider.los(eye.x, eye.y, eye.z, point.x, point.y, point.z)) continue;
      const yaw = a.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      const facing = clamp((dot + 0.35) / 1.35, 0, 1);           // 1 = staring at it
      const near = clamp(1 - dist / 22, 0, 1);
      const secs = (0.5 + 4.2 * facing) * (0.35 + 0.65 * near);
      if (secs < 0.35) continue;
      if (a.isPlayer) a.flashBlind(secs);
      else a.blindT = Math.max(a.blindT, secs * 1.15);
    }
  }

  /** Spend the next earned killstreak. */
  useStreak(player) {
    const S = this.streaks.use(player);
    if (S) this.onEvent({ type: 'streakUsed', name: S.name, id: S.id });
    else this.onEvent({ type: 'streakEmpty' });
    return S;
  }

  /** Register a noise so nearby bots can react, and light up the minimap. */
  notifyShot(pos, source, loud = 1) {
    if (loud >= 0.5) this.recentFire.set(source, this.time);
    for (const b of this.bots) {
      if (b === source || !b.alive) continue;
      if (source && b.team === source.team) continue;
      b.hear(pos, loud, this);
    }
  }

  onHitmarker(killed) { this.onEvent({ type: 'hitmarker', killed }); }

  /* -------------------------------- update ------------------------------- */

  update(dt) {
    if (this.over) return;
    this.time += dt;
    if (this.warmup > 0) {
      this.warmup -= dt;
      if (this.warmup <= 0) this.onEvent({ type: 'go' });
    } else {
      this.clock = Math.max(0, this.clock - dt);
    }

    if (!(CHEATS.enabled && CHEATS.freezeBots)) {
      for (const b of this.bots) b.update(dt, this);
    }
    if (this.warmup > 0) return;
    if (this.player.alive && this.player.pos.y < -3) this.rescue(this.player);
    this.streaks.update(dt);
    this.dom?.update(dt);

    this.grenadeSys.update(dt, (g) => {
      if (g.type === 'flash') {
        this.applyFlash(g.p);
        return;
      }
      const victims = Grenades.blastDamage(this.collider, this.actors, g.p);
      for (const v of victims) this.damage(v.actor, v.dmg, g.owner, 'chest', 'GRENADE');
      const d = Math.hypot(g.p.x - this.player.pos.x, g.p.z - this.player.pos.z);
      if (d < 16) this.player.shake(0.5, clamp(0.12 * (1 - d / 16), 0, 0.12));
    });

    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (this.time < r.at) continue;
      this.respawns.splice(i, 1);
      if (r.actor.isPlayer) {
        this.spawnActor(r.actor);
      } else {
        this.spawnActor(r.actor);
      }
    }

    if (this.clock <= 0) this.finish();
  }

  respawnTimeLeft(actor) {
    const r = this.respawns.find((x) => x.actor === actor);
    return r ? Math.max(0, r.at - this.time) : 0;
  }

  finish() {
    if (this.over) return;
    this.over = true;
    this.streaks.dispose();
    this.dom?.dispose();
    const a = this.score.A, b = this.score.B;
    const mine = this.player.team;
    const result = a === b ? 'draw' : (mine === 'A') === (a > b) ? 'win' : 'loss';
    this.onEvent({ type: 'end', result, score: { ...this.score } });
  }

  /** Best performer of the match, across both teams. */
  mvp() {
    return [...this.actors].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
  }

  roster(team) {
    return this.actors
      .filter((a) => a.team === team)
      .sort((x, y) => y.kills - x.kills || x.deaths - y.deaths);
  }

  /** Enemies revealed on the minimap (they fired recently), plus all allies. */
  minimapActors() {
    const out = [];
    for (const a of this.actors) {
      if (!a.alive || a === this.player) continue;
      if (a.team === this.player.team) out.push({ a, known: true });
      else if (this.streaks.uavActive) out.push({ a, known: false });
      else if (CHEATS.enabled && CHEATS.esp.radar) out.push({ a, known: false });
      else {
        const t = this.recentFire.get(a);
        if (t !== undefined && this.time - t < 2.6) out.push({ a, known: false });
      }
    }
    return out;
  }
}

export { DIFFICULTY, WEAPONS, PRIMARIES };
