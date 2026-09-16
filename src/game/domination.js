// ============================================================================
//  DOMINATION — three flags on Nuketown: A at the yellow house, B in the
//  middle of the road, C at the green house. Holding them scores over time.
// ============================================================================
import * as THREE from 'three';
import { clamp } from '../core/util.js';

export const DOM = {
  scoreLimit: 200,
  duration: 720,
  radius: 4.2,
  captureRate: 0.17,        // per player per second (≈6 s solo)
  tickEvery: 5,             // seconds between score ticks
  pointsPerZone: 1,
};

const TEAM_COLOR = { A: 0x4ea3ff, B: 0xff5340, null: 0xd8d2c4 };

function letterTexture(letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(8,11,14,.72)';
  g.beginPath();
  g.roundRect ? g.roundRect(14, 14, 100, 100, 14) : g.rect(14, 14, 100, 100);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 76px Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Domination {
  constructor(match, scene) {
    this.match = match;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tick = 0;
    this.lastAssign = 0;

    // A and C sit on the pavement in front of each house — clear of the
    // porch roofs, close enough that the porch and driveway both count.
    const spots = [
      { id: 'A', x: -10.5, z: -5.6 },
      { id: 'B', x: 0.5, z: 0.4 },
      { id: 'C', x: 10.5, z: 5.6 },
    ];
    this.zones = spots.map((s) => this._buildZone(s));
  }

  _buildZone(s) {
    // drop the flag onto whatever surface is under the spot
    // probe from just above head height so a flag can never end up on a roof
    const hit = this.match.collider.raycast(s.x, 2.4, s.z, 0, -1, 0, 8);
    const y = hit ? Math.max(0, 2.4 - hit.dist) : 0;

    const g = new THREE.Group();
    g.position.set(s.x, y, s.z);

    const ringMat = new THREE.MeshBasicMaterial({
      color: TEAM_COLOR.null, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(DOM.radius - 0.22, DOM.radius, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 3.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
    );
    pole.position.y = 1.7;
    pole.castShadow = true;
    g.add(pole);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 0.22, 12),
      new THREE.MeshLambertMaterial({ color: 0x3a3f44 }),
    );
    base.position.y = 0.11;
    g.add(base);

    const flagMat = new THREE.MeshLambertMaterial({
      color: TEAM_COLOR.null, side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72), flagMat);
    flag.position.set(0.62, 1.0, 0);
    g.add(flag);

    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: letterTexture(s.id), transparent: true, depthTest: false, depthWrite: false,
    }));
    label.scale.set(1.0, 1.0, 1);
    label.position.y = 4.0;
    label.renderOrder = 12;
    g.add(label);

    this.group.add(g);
    return {
      id: s.id, x: s.x, y, z: s.z,
      owner: null, progress: 0, capturing: null, contested: false,
      group: g, ring: ringMat, flag: flagMat, flagMesh: flag, label,
    };
  }

  /** Actors standing on a flag. */
  _occupants(zone) {
    const out = { A: 0, B: 0, list: [] };
    for (const a of this.match.actors) {
      if (!a.alive) continue;
      if (Math.abs(a.pos.y - zone.y) > 2.6) continue;
      const d = Math.hypot(a.pos.x - zone.x, a.pos.z - zone.z);
      if (d > DOM.radius) continue;
      out[a.team]++;
      out.list.push(a);
    }
    return out;
  }

  update(dt) {
    const M = this.match;

    for (const z of this.zones) {
      const occ = this._occupants(z);
      const teams = (occ.A > 0 ? 1 : 0) + (occ.B > 0 ? 1 : 0);
      z.contested = teams > 1;
      const team = occ.A > 0 && occ.B === 0 ? 'A' : occ.B > 0 && occ.A === 0 ? 'B' : null;
      z.capturing = team;

      if (team && team !== z.owner) {
        const n = team === 'A' ? occ.A : occ.B;
        const rate = DOM.captureRate * (1 + (n - 1) * 0.6);
        if (z.progress > 0 && z.progressTeam !== team) {
          // roll back the enemy's work first
          z.progress = Math.max(0, z.progress - rate * dt * 1.6);
          if (z.progress <= 0) z.progressTeam = team;
        } else {
          z.progressTeam = team;
          z.progress = Math.min(1, z.progress + rate * dt);
          if (z.progress >= 1) {
            const prev = z.owner;
            z.owner = team;
            z.progress = 0;
            z.progressTeam = null;
            M.onEvent({
              type: 'zone',
              zone: z.id,
              team,
              lost: prev && prev !== team,
              mine: team === M.player.team,
              byPlayer: occ.list.includes(M.player),
            });
          }
        }
      } else if (!z.contested && z.progress > 0) {
        z.progress = Math.max(0, z.progress - DOM.captureRate * 0.5 * dt);
      }

      this._paint(z);
    }

    // score ticks
    this.tick += dt;
    if (this.tick >= DOM.tickEvery) {
      this.tick -= DOM.tickEvery;
      for (const z of this.zones) {
        if (z.owner) M.score[z.owner] += DOM.pointsPerZone;
      }
      if (M.score.A >= DOM.scoreLimit || M.score.B >= DOM.scoreLimit) M.finish();
    }

    // objectives for the bots
    this.lastAssign -= dt;
    if (this.lastAssign <= 0) {
      this.lastAssign = 2.5;
      this._assignObjectives();
    }
  }

  _paint(z) {
    const col = TEAM_COLOR[z.owner] ?? TEAM_COLOR.null;
    z.ring.color.setHex(col);
    z.flag.color.setHex(col);
    z.ring.opacity = z.contested ? 0.75 : z.capturing ? 0.6 : 0.4;
    // the banner climbs the pole with the capture progress
    const raised = z.owner ? 1 : z.progress;
    z.flagMesh.position.y = 0.55 + raised * 1.95;
    z.flagMesh.material.color.setHex(z.capturing && !z.owner ? TEAM_COLOR[z.capturing] : col);
    z.label.material.color.setHex(col);
    z.label.scale.setScalar(z.contested ? 1.18 : 1.0);
  }

  /** Spread the bots over the flags: take what we do not hold, defend the rest. */
  _assignObjectives() {
    const M = this.match;
    const nav = M.nav;
    for (const team of ['A', 'B']) {
      const bots = M.bots.filter((b) => b.team === team && b.alive);
      if (!bots.length) continue;
      const owned = this.zones.filter((z) => z.owner === team);
      const wanted = this.zones.filter((z) => z.owner !== team);
      // aim for two flags: enough to win, not so many that we overextend
      const targets = [];
      for (const z of wanted) targets.push(z);
      if (owned.length) targets.push(owned[0]);
      bots.forEach((b, i) => {
        const z = targets.length ? targets[i % targets.length] : this.zones[1];
        const node = nav.nearest(z.x, z.y + 0.1, z.z, false);
        b.objective = node;
        if (Math.random() < 0.5) b.goal = -1;      // repath toward it now
      });
    }
  }

  /** What the HUD needs. */
  hudState() {
    return this.zones.map((z) => ({
      id: z.id,
      owner: z.owner,
      progress: z.progress,
      progressTeam: z.progressTeam ?? null,
      contested: z.contested,
      capturing: z.capturing,
    }));
  }

  /** The zone the player is currently standing on, if any. */
  playerZone() {
    const p = this.match.player;
    for (const z of this.zones) {
      if (Math.abs(p.pos.y - z.y) > 2.6) continue;
      if (Math.hypot(p.pos.x - z.x, p.pos.z - z.z) <= DOM.radius) return z;
    }
    return null;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const b of this.match.bots) b.objective = -1;
  }
}

export { TEAM_COLOR };
