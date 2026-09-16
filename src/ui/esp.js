// ESP overlay: projects actors to screen space on a 2D canvas above the scene.
import * as THREE from 'three';
import { CHEATS } from '../game/cheats.js';

export class Esp {
  constructor(parent) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'esp';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.v = new THREE.Vector3();
    this.resize();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(innerWidth * dpr);
    this.canvas.height = Math.floor(innerHeight * dpr);
    this.dpr = dpr;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** world point -> {x,y,behind} in canvas pixels */
  _project(camera, x, y, z) {
    this.v.set(x, y, z).project(camera);
    return {
      x: (this.v.x * 0.5 + 0.5) * this.canvas.width,
      y: (-this.v.y * 0.5 + 0.5) * this.canvas.height,
      behind: this.v.z > 1 || this.v.z < -1,
    };
  }

  draw(player, match, camera) {
    const E = CHEATS.esp;
    this.clear();
    if (!CHEATS.enabled || !E.on) return;
    if (this.canvas.width !== Math.floor(innerWidth * Math.min(devicePixelRatio || 1, 2))) this.resize();

    const g = this.ctx;
    const s = this.dpr;
    const eye = player.eye;

    for (const a of match.actors) {
      if (a === player || !a.alive) continue;
      const foe = a.team !== player.team;
      if (!foe && !E.allies) continue;

      const dist = Math.hypot(a.pos.x - eye.x, a.pos.y - eye.y, a.pos.z - eye.z);
      if (dist > E.maxDist) continue;

      const feet = this._project(camera, a.pos.x, a.pos.y, a.pos.z);
      const head = this._project(camera, a.pos.x, a.pos.y + a.height + 0.22, a.pos.z);
      if (feet.behind || head.behind) continue;
      if (head.x < -200 * s || head.x > this.canvas.width + 200 * s) continue;

      const h = Math.abs(feet.y - head.y);
      if (h < 4 * s) continue;
      const w = h * 0.46;
      const x0 = head.x - w / 2, y0 = Math.min(head.y, feet.y);

      const visible = match.collider.los(eye.x, eye.y, eye.z, a.pos.x, a.pos.y + a.height * 0.72, a.pos.z);
      const base = foe ? (visible ? '#ff4433' : '#a8352c') : (visible ? '#4ea3ff' : '#2f6699');

      g.save();
      g.lineWidth = Math.max(1, 1.5 * s);
      g.strokeStyle = base;
      g.setLineDash(visible ? [] : [5 * s, 4 * s]);

      if (E.tracers) {
        g.beginPath();
        g.moveTo(this.canvas.width / 2, this.canvas.height);
        g.lineTo(head.x, feet.y);
        g.globalAlpha = 0.55;
        g.stroke();
        g.globalAlpha = 1;
      }

      if (E.boxes) {
        // corner box, easier to read than a full rectangle
        const c = Math.min(w, h) * 0.28;
        g.beginPath();
        for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]]) {
          g.moveTo(cx + sx * c, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * c);
        }
        g.stroke();
      }

      if (E.skeleton && h > 18 * s) {
        const p = (fy) => this._project(camera, a.pos.x, a.pos.y + a.height * fy, a.pos.z);
        const neck = p(0.86), hip = p(0.5), knee = p(0.25);
        g.setLineDash([]);
        g.globalAlpha = 0.85;
        g.beginPath();
        g.moveTo(head.x, head.y + h * 0.12); g.lineTo(neck.x, neck.y); g.lineTo(hip.x, hip.y);
        g.moveTo(x0 + w * 0.1, neck.y + h * 0.12); g.lineTo(neck.x, neck.y); g.lineTo(x0 + w * 0.9, neck.y + h * 0.12);
        g.moveTo(x0 + w * 0.2, feet.y); g.lineTo(knee.x, knee.y); g.lineTo(hip.x, hip.y);
        g.lineTo(knee.x, knee.y); g.lineTo(x0 + w * 0.8, feet.y);
        g.stroke();
        g.globalAlpha = 1;
      }

      if (E.health) {
        const hp = Math.max(0, Math.min(1, a.health / 100));
        const bx = x0 - 6 * s;
        g.setLineDash([]);
        g.fillStyle = 'rgba(0,0,0,.65)';
        g.fillRect(bx - 1.5 * s, y0 - 1.5 * s, 4 * s, h + 3 * s);
        g.fillStyle = hp > 0.5 ? '#54dd7b' : hp > 0.25 ? '#ffc73d' : '#ff4433';
        g.fillRect(bx, y0 + h * (1 - hp), 2.5 * s, h * hp);
      }

      // labels shrink with the box and disappear when they would be a smear
      const lines = [];
      if (E.names && h > 22 * s) lines.push(a.name.toUpperCase());
      if (E.distance && h > 34 * s) lines.push(`${dist.toFixed(0)} m`);
      else if (E.distance && !lines.length && h > 14 * s) lines.push(`${dist.toFixed(0)}m`);
      if (lines.length) {
        const fs = Math.max(8 * s, Math.min(13 * s, h * 0.17));
        g.setLineDash([]);
        g.font = `${Math.round(fs)}px "Bahnschrift","Arial Narrow",sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        let ty = y0 - 3 * s;
        for (let i = lines.length - 1; i >= 0; i--) {
          g.lineWidth = 3 * s;
          g.strokeStyle = 'rgba(0,0,0,.85)';
          g.strokeText(lines[i], head.x, ty);
          g.fillStyle = i === 0 ? base : '#dfe7ec';
          g.fillText(lines[i], head.x, ty);
          ty -= fs * 1.05;
        }
      }
      g.restore();
    }

    // aimbot lock indicator
    const lock = CHEATS._lock;
    if (CHEATS.aimbot.on && lock) {
      const p = this._project(camera, lock.point.x, lock.point.y, lock.point.z);
      if (!p.behind) {
        g.save();
        g.strokeStyle = '#ffcb3d';
        g.lineWidth = 1.5 * s;
        g.beginPath();
        g.arc(p.x, p.y, 9 * s, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(this.canvas.width / 2, this.canvas.height / 2);
        g.lineTo(p.x, p.y);
        g.globalAlpha = 0.35;
        g.stroke();
        g.restore();
      }
    }
  }
}
