// All DOM-side HUD plumbing.
import { clamp, fmtTime } from '../core/util.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      health: $('health-bar'), healthFill: $('health-bar').firstElementChild, healthTxt: $('health-txt'),
      ammo: $('ammo'), mag: $('ammo-mag'), res: $('ammo-res'),
      weapon: $('weapon-name'), firemode: $('firemode'), grenades: $('grenades').querySelector('b'),
      flashbangs: $('flashbangs').querySelector('b'),
      blind: $('blind'), streakSlot: $('streak-slot'), uav: $('uav-timer'),
      warmup: $('warmup'), warmupNum: $('warmup').querySelector('b'), fps: $('fps'),
      domBar: $('dom-bar'), capture: $('capture'), captureTxt: $('capture-txt'),
      captureBar: $('capture').querySelector('.cap-bar i'),
      zones: Object.fromEntries([...$('dom-bar').querySelectorAll('.zone')].map((z) => [z.dataset.z, z])),
      reload: $('reload-hint'),
      scoreA: $('score-a'), scoreB: $('score-b'), clock: $('clock'),
      killfeed: $('killfeed'), streak: $('streak-banner'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      vignette: $('damage-vignette'), hitDirs: $('hit-dirs'),
      respawn: $('respawn-overlay'), roKiller: $('ro-killer'), roCount: $('ro-count'),
      scoreboard: $('scoreboard'), sbA: $('sb-a'), sbB: $('sb-b'),
      sbScoreA: $('sb-score-a'), sbScoreB: $('sb-score-b'),
    };
    this.hmTimer = 0;
    this.streakTimer = 0;
    this.dirEls = [];
    this._lastHealth = -1;
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  health(h) {
    const v = Math.max(0, Math.round(h));
    if (v === this._lastHealth) return;
    this._lastHealth = v;
    this.el.healthFill.style.width = `${clamp(v, 0, 100)}%`;
    this.el.healthTxt.textContent = v;
    this.el.health.classList.toggle('low', v <= 35);
    this.el.vignette.style.opacity = v >= 70 ? 0 : String(clamp((70 - v) / 62, 0, 0.95));
  }

  ammo(mag, reserve, magSize) {
    this.el.mag.textContent = mag;
    this.el.res.textContent = reserve;
    this.el.ammo.classList.toggle('low', mag <= Math.max(1, Math.ceil(magSize * 0.25)));
  }

  weapon(name, mode, grenades, flashbangs) {
    this.el.weapon.textContent = name;
    this.el.firemode.textContent = (mode || '').toUpperCase();
    this.el.grenades.textContent = grenades;
    this.el.flashbangs.textContent = flashbangs;
  }

  /** White-out while flashbanged (0..1). */
  blind(v) {
    const o = v <= 0 ? 0 : Math.min(1, v ** 0.55);
    if (this._blind === o) return;
    this._blind = o;
    this.el.blind.style.opacity = String(o * 0.96);
  }

  /** The killstreak waiting to be called in. */
  streakSlot(streak, count) {
    const key = streak ? `${streak.id}|${count}` : '';
    if (key === this._slotKey) return;
    this._slotKey = key;
    this.el.streakSlot.classList.toggle('hidden', !streak);
    if (!streak) return;
    this.el.streakSlot.innerHTML =
      `${count > 1 ? `<span class="sq">${count}</span>` : ''}` +
      `<span class="sn">${streak.name}</span><span class="sh">[4] ${streak.hint}</span>`;
  }

  uavTimer(secs) {
    const on = secs > 0;
    this.el.uav.classList.toggle('hidden', !on);
    if (on) this.el.uav.textContent = `AVION ESPION ${Math.ceil(secs)}s`;
  }

  reloadHint(v) { this.el.reload.classList.toggle('hidden', !v); }

  scores(a, b) { this.el.scoreA.textContent = a; this.el.scoreB.textContent = b; }
  clock(t) { this.el.clock.textContent = fmtTime(t); }

  /** Crosshair gap in pixels, derived from the live weapon spread. */
  crosshair(spreadRad, fovDeg, hidden) {
    const px = Math.tan(spreadRad) / Math.tan((fovDeg * Math.PI) / 360) * (window.innerHeight / 2);
    this.el.crosshair.style.setProperty('--sp', `${clamp(px * 0.85, 3, 90)}px`);
    this.el.crosshair.style.opacity = hidden ? 0 : 1;
  }

  hitmarker(kill) {
    const el = this.el.hitmarker;
    el.classList.remove('on');
    el.classList.toggle('kill', !!kill);
    // force a reflow so the animation restarts
    void el.offsetWidth;
    el.classList.add('on');
    this.hmTimer = kill ? 0.35 : 0.14;
  }

  kill(e) {
    const div = document.createElement('div');
    div.className = 'kf' + (e.mine || e.victimIsMe ? ' mine' : '');
    const kt = e.killerTeam === 'A' ? 'nm-a' : 'nm-b';
    const vt = e.victimTeam === 'A' ? 'nm-a' : 'nm-b';
    div.innerHTML = `<span class="${kt}">${e.killer}</span>` +
      `<span class="wp">${e.headshot ? '✦' : '»'} ${e.weapon}</span>` +
      `<span class="${vt}">${e.victim}</span>`;
    this.el.killfeed.appendChild(div);
    setTimeout(() => div.remove(), 5200);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.firstElementChild.remove();
  }

  streak(n, reward) {
    this.el.streak.innerHTML = reward
      ? `${reward.name}<small>SÉRIE DE ${n} · PRÊT SUR [4]</small>`
      : `SÉRIE DE ${n}<small>CONTINUEZ</small>`;
    this.el.streak.classList.add('on');
    this.streakTimer = reward ? 2.8 : 1.8;
  }

  banner(title, sub = '') {
    this.el.streak.innerHTML = `${title}<small>${sub}</small>`;
    this.el.streak.classList.add('on');
    this.streakTimer = 2.2;
  }

  respawn(show, killer, secs) {
    this.el.respawn.classList.toggle('hidden', !show);
    if (killer !== undefined) this.el.roKiller.textContent = killer;
    if (secs !== undefined) this.el.roCount.textContent = Math.ceil(secs);
  }

  hitDirections(dirs, yaw) {
    // recycle DOM nodes: one arrow per active hit
    while (this.dirEls.length < dirs.length) {
      const d = document.createElement('div');
      d.className = 'hit-dir';
      this.el.hitDirs.appendChild(d);
      this.dirEls.push(d);
    }
    this.dirEls.forEach((el, i) => {
      const d = dirs[i];
      if (!d) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.opacity = clamp(d.t, 0, 1);
      el.style.transform = `rotate(${((d.ang - yaw) * 180) / Math.PI}deg)`;
    });
  }

  scoreboard(show, match, player) {
    this.el.scoreboard.classList.toggle('hidden', !show);
    if (!show) return;
    this.el.scoreboard.querySelector('h2').textContent = `NUKETOWN — ${match.rules.name}`;
    this.el.sbScoreA.textContent = match.score.A;
    this.el.sbScoreB.textContent = match.score.B;
    for (const [team, tbody] of [['A', this.el.sbA], ['B', this.el.sbB]]) {
      tbody.innerHTML = '';
      for (const a of match.roster(team)) {
        const tr = document.createElement('tr');
        if (a === player) tr.className = 'me';
        else if (!a.alive) tr.className = 'dead';
        tr.innerHTML = `<td>${a.name}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.ping}</td>`;
        tbody.appendChild(tr);
      }
    }
  }

  /** @param {Array|null} zones from Domination.hudState() */
  domination(zones, playerZone) {
    this.el.domBar.classList.toggle('hidden', !zones);
    if (!zones) { this.el.capture.classList.add('hidden'); return; }
    for (const z of zones) {
      const el = this.el.zones[z.id];
      if (!el) continue;
      el.classList.toggle('own-a', z.owner === 'A');
      el.classList.toggle('own-b', z.owner === 'B');
      el.classList.toggle('contested', z.contested);
      el.querySelector('i').style.setProperty('--p', `${Math.round((z.owner ? 1 : z.progress) * 100)}%`);
    }
    const on = !!playerZone && (playerZone.contested || playerZone.capturing || playerZone.progress > 0.01);
    this.el.capture.classList.toggle('hidden', !on);
    if (!on) return;
    this.el.capture.classList.toggle('contested', playerZone.contested);
    this.el.captureTxt.textContent = playerZone.contested
      ? `ZONE ${playerZone.id} CONTESTÉE`
      : playerZone.owner === playerZone.capturing
        ? `ZONE ${playerZone.id} TENUE`
        : `CAPTURE DE ${playerZone.id}`;
    this.el.captureBar.style.width = `${Math.round((playerZone.owner === playerZone.capturing ? 1 : playerZone.progress) * 100)}%`;
  }

  warmupCount(secs) {
    const on = secs > 0;
    this.el.warmup.classList.toggle('hidden', !on);
    if (!on) return;
    const n = Math.max(1, Math.min(3, Math.ceil(secs - 0.02)));
    if (n !== this._warmN) { this._warmN = n; this.el.warmupNum.textContent = n; }
  }

  fps(v) {
    this.el.fps.classList.toggle('hidden', v === null);
    if (v !== null) this.el.fps.textContent = `${v} FPS`;
  }

  update(dt) {
    if (this.hmTimer > 0) {
      this.hmTimer -= dt;
      if (this.hmTimer <= 0) this.el.hitmarker.classList.remove('on');
    }
    if (this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) this.el.streak.classList.remove('on');
    }
  }
}
