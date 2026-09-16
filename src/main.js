// ============================================================================
//  OPERATION NUKETOWN — bootstrap, render loop and menu flow.
// ============================================================================
import * as THREE from 'three';
import { Input } from './core/input.js';
import { Sfx } from './core/audio.js';
import { buildTextures } from './core/textures.js';
import { buildNuketown } from './world/nuketown.js';
import { NavGraph } from './world/nav.js';
import { Effects } from './game/combat.js';
import { Player } from './game/player.js';
import { Match, MATCH } from './game/match.js';
import { WEAPONS, PRIMARIES } from './game/weapons.js';
import { DIFFICULTY } from './game/bots.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { clamp, fmtTime } from './core/util.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');

const settings = {
  sens: 1.0,
  fov: 85,
  volume: 0.7,
  quality: 2,
  primary: 'm4',
  difficulty: 'regular',
};
try { Object.assign(settings, JSON.parse(localStorage.getItem('nuketown.settings') || '{}')); } catch { /* defaults */ }
const saveSettings = () => {
  try { localStorage.setItem('nuketown.settings', JSON.stringify(settings)); } catch { /* private mode */ }
};

/* ------------------------------ renderer ------------------------------- */

const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality > 0, powerPreference: 'high-performance' });
renderer.setClearColor(0xc9b48c);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd6b489, 70, 340);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 900);
camera.rotation.order = 'YXZ';
scene.add(camera);

const sun = new THREE.DirectionalLight(0xffe6bd, 2.5);
sun.position.set(-54, 62, 40);
sun.castShadow = true;
sun.shadow.camera.left = -46; sun.shadow.camera.right = 46;
sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0009;
sun.shadow.normalBias = 0.022;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xa8c8e8, 0x8a7550, 0.95));
scene.add(new THREE.AmbientLight(0xffffff, 0.22));   // keeps interiors readable

// gentle fill travelling with the eye: keeps the view model and interiors readable
const fill = new THREE.PointLight(0xfff1dc, 0.5, 4.2, 2);
fill.position.set(0.15, 0.05, 0.25);
camera.add(fill);

function applyQuality() {
  const q = settings.quality;
  renderer.setPixelRatio(q === 0 ? 0.7 : q === 1 ? Math.min(devicePixelRatio, 1.2) : Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = q > 0;
  sun.shadow.mapSize.set(q > 1 ? 2048 : 1024, q > 1 ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  scene.fog.far = q === 0 ? 220 : 340;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

/* --------------------------------- world -------------------------------- */

const input = new Input(canvas);
const sfx = new Sfx();
const hud = new Hud();

let world, nav, effects, player, match, minimap;
let state = 'loading';         // loading | menu | play | pause | end
let lastTime = performance.now();
let scoreboardShown = false;

/* scope + flash overlays are created here so index.html stays declarative */
const scopeEl = document.createElement('div');
scopeEl.style.cssText = `position:absolute;inset:0;display:none;pointer-events:none;
  background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 26vh, rgba(0,0,0,.97) 27vh);`;
scopeEl.innerHTML = `
  <div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:rgba(0,0,0,.85)"></div>
  <div style="position:absolute;top:50%;left:0;height:1px;width:100%;background:rgba(0,0,0,.85)"></div>
  <div style="position:absolute;left:50%;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;
       border:1px solid rgba(0,0,0,.9);border-radius:50%"></div>`;
$('hud').appendChild(scopeEl);

const flashEl = document.createElement('div');
flashEl.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:60;transition:opacity .9s';
document.body.appendChild(flashEl);

/* ------------------------------- loading -------------------------------- */

const stage = (txt) => new Promise((res) => {
  $('loading-txt').textContent = txt;
  requestAnimationFrame(() => requestAnimationFrame(() => res()));
});

async function boot() {
  resize();
  applyQuality();
  await stage('Génération des textures du site…');
  const tex = buildTextures();

  await stage('Construction de Nuketown…');
  world = buildNuketown(tex);
  scene.add(world.group);

  await stage('Pose du ciel du Nevada…');
  const skyGeo = new THREE.SphereGeometry(420, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: tex.sky, side: THREE.BackSide, fog: false });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  await stage('Calcul des points de navigation…');
  nav = new NavGraph(world.collider, world.bounds, world.hints);

  await stage('Déploiement des mannequins…');
  effects = new Effects(scene, sfx);
  player = new Player(camera, scene, sfx, effects, { primary: settings.primary, fov: settings.fov });
  minimap = new Minimap($('minimap'), world);

  buildMenus();
  $('loading').classList.add('hidden');
  state = 'menu';
  requestAnimationFrame(frame);
}

/* --------------------------------- menus -------------------------------- */

function buildMenus() {
  // loadout chips
  const list = $('loadout-list');
  list.innerHTML = '';
  for (const id of PRIMARIES) {
    const w = WEAPONS[id];
    const b = document.createElement('button');
    b.className = 'chip' + (id === settings.primary ? ' sel' : '');
    b.dataset.w = id;
    b.innerHTML = `${w.name}<small>${w.desc} · ${w.mag} coups</small>`;
    b.onclick = () => {
      settings.primary = id;
      saveSettings();
      [...list.children].forEach((c) => c.classList.toggle('sel', c.dataset.w === id));
      player?.setLoadout(id);
    };
    list.appendChild(b);
  }
  // difficulty chips
  const diffs = $('difficulty-list');
  [...diffs.children].forEach((c) => {
    c.classList.toggle('sel', c.dataset.diff === settings.difficulty);
    c.onclick = () => {
      settings.difficulty = c.dataset.diff;
      saveSettings();
      [...diffs.children].forEach((x) => x.classList.toggle('sel', x === c));
    };
  });
  $('brief-target').textContent = MATCH.scoreLimit;

  const bind = (id, key, fmt, apply) => {
    const el = $(id);
    if (!el) return;
    const out = el.parentElement.querySelector('output');
    const sync = () => {
      const v = Number(el.value);
      settings[key] = key === 'sens' ? v / 100 : key === 'volume' ? v / 100 : v;
      out.textContent = fmt(settings[key]);
      apply?.(settings[key]);
      saveSettings();
    };
    el.value = key === 'sens' || key === 'volume' ? settings[key] * 100 : settings[key];
    el.oninput = sync;
    sync();
  };
  const qualityName = (v) => ['Basse', 'Moyenne', 'Élevée'][v] ?? v;
  for (const p of ['set', 'p']) {
    bind(`${p}-sens`, 'sens', (v) => v.toFixed(2), (v) => { input.sensitivity = v; });
    bind(`${p}-fov`, 'fov', (v) => String(v), (v) => { if (player) player.baseFov = v; camera.fov = v; camera.updateProjectionMatrix(); });
    bind(`${p}-vol`, 'volume', (v) => String(Math.round(v * 100)), (v) => sfx.setVolume(v));
    if (p === 'set') bind('set-quality', 'quality', qualityName, () => applyQuality());
  }

  $('btn-start').onclick = () => startMatch();
  $('btn-again').onclick = () => { $('endgame').classList.add('hidden'); startMatch(); };
  $('btn-resume').onclick = () => resume();
  $('btn-quit').onclick = () => quitToMenu();

  input.onLockChange = (locked) => {
    if (!locked && state === 'play') pause();
  };
}

function syncMenuInputs() {
  for (const [id, v] of [['p-sens', settings.sens * 100], ['p-fov', settings.fov], ['p-vol', settings.volume * 100]]) {
    const el = $(id);
    if (!el) continue;
    el.value = v;
    el.parentElement.querySelector('output').textContent =
      id === 'p-sens' ? settings.sens.toFixed(2) : id === 'p-vol' ? String(Math.round(settings.volume * 100)) : String(settings.fov);
  }
}

/* ------------------------------- match flow ----------------------------- */

function startMatch() {
  sfx.init();
  sfx.resume();
  sfx.setVolume(settings.volume);
  input.sensitivity = settings.sens;

  if (match) for (const b of match.bots) scene.remove(b.model.group);
  player.setLoadout(settings.primary);
  player.baseFov = settings.fov;
  player.kills = 0; player.deaths = 0; player.streak = 0; player.bestStreak = 0;
  player.shotsFired = 0; player.shotsHit = 0;

  match = new Match({
    scene, collider: world.collider, nav, spawns: world.spawns, bounds: world.bounds,
    sfx, effects, player, difficulty: settings.difficulty, onEvent: handleEvent,
  });

  $('menu').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('endgame').classList.add('hidden');
  hud.show(true);
  hud.scores(0, 0);
  hud.respawn(false);
  state = 'play';
  input.lock();
  sfx.siren(true);
  nukeState = null;
  flashEl.style.opacity = 0;
}

function pause() {
  if (state !== 'play') return;
  state = 'pause';
  syncMenuInputs();
  $('pause').classList.remove('hidden');
  input.unlock();
}

function resume() {
  if (state !== 'pause') return;
  $('pause').classList.add('hidden');
  state = 'play';
  input.lock();
  sfx.resume();
}

function quitToMenu() {
  $('pause').classList.add('hidden');
  hud.show(false);
  hud.scoreboard(false);
  $('menu').classList.remove('hidden');
  state = 'menu';
  input.unlock();
}

function handleEvent(e) {
  switch (e.type) {
    case 'kill':
      hud.kill(e);
      if (e.mine) sfx.hitmarker(true);
      if (e.victimIsMe) hud.respawn(true, e.killer, 3);
      break;
    case 'hitmarker':
      hud.hitmarker(e.killed);
      sfx.hitmarker(e.killed);
      break;
    case 'streak':
      hud.streak(e.n);
      break;
    case 'spawned':
      hud.respawn(false);
      break;
    case 'end':
      endMatch(e);
      break;
    default: break;
  }
}

/* --------------------------- the closing shot --------------------------- */

let nukeState = null;

function detonate() {
  const g = new THREE.Group();
  g.position.set(96, 0, -122);
  const capMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false });
  const stemMat = new THREE.MeshBasicMaterial({ color: 0xd8c3a0, fog: false });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(18, 20, 14), capMat);
  cap.position.y = 70;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(7, 13, 70, 16), stemMat);
  stem.position.y = 35;
  const base = new THREE.Mesh(new THREE.SphereGeometry(26, 20, 12), stemMat);
  base.position.y = 4;
  g.add(cap, stem, base);
  g.scale.setScalar(0.05);
  scene.add(g);
  nukeState = { g, t: 0, cap: capMat, stem: stemMat, at: new THREE.Vector3(96, 88, -122) };
  sfx.explosion({ x: player.pos.x + 30, y: 20, z: player.pos.z - 40 });
  sfx.siren(false);
  flashEl.style.opacity = 0.9;
  setTimeout(() => { flashEl.style.opacity = 0; }, 260);
}

function endMatch(e) {
  state = 'end';
  input.unlock();
  hud.show(false);
  hud.scoreboard(false);
  detonate();
  const acc = player.shotsFired ? (player.shotsHit / player.shotsFired) * 100 : 0;
  $('eg-result').textContent = e.result === 'win' ? 'VICTOIRE' : e.result === 'loss' ? 'DÉFAITE' : 'ÉGALITÉ';
  $('eg-result').style.color = e.result === 'win' ? 'var(--warn)' : e.result === 'loss' ? 'var(--b)' : 'var(--ink)';
  $('eg-score').textContent = `${e.score[player.team]} — ${e.score[player.team === 'A' ? 'B' : 'A']}`;
  $('eg-k').textContent = player.kills;
  $('eg-d').textContent = player.deaths;
  $('eg-kd').textContent = (player.kills / Math.max(1, player.deaths)).toFixed(2);
  $('eg-acc').textContent = `${acc.toFixed(1)}%`;
  $('eg-streak').textContent = player.bestStreak;
  setTimeout(() => {
    if (state === 'end') $('endgame').classList.remove('hidden');
  }, 3200);
}

/* ------------------------------ clock face ------------------------------ */

let clockShown = -1;
function paintClock(secs) {
  const c = world.clock;
  if (!c) return;
  const s = Math.ceil(secs);
  if (s === clockShown) return;
  clockShown = s;
  const g = c.ctx;
  g.fillStyle = '#1b1f24';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#d8b25a';
  g.lineWidth = 8;
  g.strokeRect(10, 10, 236, 236);
  g.fillStyle = '#d8b25a';
  g.font = 'bold 26px Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('DETONATION IN', 128, 62);
  g.fillStyle = s <= 60 ? '#ff5340' : '#8dffb2';
  g.font = 'bold 74px "DS-Digital", Impact, monospace';
  g.fillText(fmtTime(s), 128, 150);
  g.fillStyle = '#8f949a';
  g.font = 'bold 18px Impact, sans-serif';
  g.fillText('SURVIVAL TOWN · NTS', 128, 200);
  g.fillText(`${match ? match.score.A : 0} — ${match ? match.score.B : 0}`, 128, 226);
  c.texture.needsUpdate = true;
}

/* -------------------------------- loop ---------------------------------- */

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0005, (now - lastTime) / 1000));
  lastTime = now;

  if (state === 'play') {
    player.update(dt, input, match);
    match.update(dt);
    effects.update(dt);
    hud.update(dt);

    // audio listener follows the camera
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    sfx.setListener(camera.position, fwd);

    // sun shadow box follows the action
    sun.position.set(player.pos.x - 54, 62, player.pos.z + 40);
    sun.target.position.set(player.pos.x, 0, player.pos.z);
    sun.target.updateMatrixWorld();

    // HUD
    const st = player.weapon;
    hud.health(player.health);
    hud.ammo(st.mag, st.reserve, st.w.mag);
    hud.weapon(st.w.name, st.reloading > 0 ? 'RECHARGE' : st.mode, player.grenades);
    hud.reloadHint(st.mag === 0 && st.reserve > 0);
    hud.scores(match.score.A, match.score.B);
    hud.clock(match.clock);
    hud.crosshair(
      st.spread(player.ads, Math.hypot(player.vel.x, player.vel.z) > 1.2, player.crouch, !player.grounded),
      camera.fov, !player.alive || player.scoped,
    );
    hud.hitDirections(player.lastHitDirs, player.yaw);
    scopeEl.style.display = player.scoped ? 'block' : 'none';
    minimap.draw(player, match.minimapActors(), match.grenadeSys.items);
    paintClock(match.clock);

    if (!player.alive) hud.respawn(true, undefined, match.respawnTimeLeft(player));

    const wantSb = input.down('Tab');
    if (wantSb !== scoreboardShown) {
      scoreboardShown = wantSb;
      hud.scoreboard(wantSb, match, player);
    } else if (wantSb) hud.scoreboard(true, match, player);

    if (input.hit('Escape')) pause();
  } else if (state === 'end' && nukeState) {
    nukeState.t += dt;
    const t = nukeState.t;
    nukeState.g.scale.setScalar(clamp(0.05 + t * 0.5, 0.05, 1.15));
    nukeState.g.position.y = Math.min(26, t * 8);
    const heat = clamp(1 - t / 3.2, 0, 1);
    nukeState.cap.color.setRGB(1, 0.62 + heat * 0.35, 0.34 + heat * 0.5);
    nukeState.stem.color.setRGB(0.72 + heat * 0.28, 0.66 + heat * 0.2, 0.58);
    // turn the camera onto the shot tower for the closing shot
    const d = nukeState.at.clone().sub(camera.position);
    const wantYaw = Math.atan2(-d.x, -d.z);
    const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    let dy = wantYaw - camera.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    camera.rotation.y += dy * Math.min(1, dt * 2.2);
    camera.rotation.x += (wantPitch - camera.rotation.x) * Math.min(1, dt * 2.2);
    camera.rotation.z += Math.sin(t * 22) * 0.0022 * clamp(1.4 - t / 2, 0, 1);
    effects.update(dt);
  }

  renderer.render(scene, camera);
  input.endFrame();
}

/* ------------------------------ kick it off ----------------------------- */

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'pause') resume();
  if (e.code === 'Enter' && state === 'menu') startMatch();
});
canvas.addEventListener('click', () => {
  if (state === 'play' && !input.locked) input.lock();
});

boot().catch((err) => {
  console.error(err);
  $('loading-txt').textContent = `Erreur de chargement : ${err.message}`;
});

// expose a little debug handle
window.NUKETOWN = {
  get match() { return match; }, get player() { return player; },
  get world() { return world; }, get nav() { return nav; },
  settings, DIFFICULTY,
};
