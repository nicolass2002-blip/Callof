// Rotating tactical map. The static layer is rendered once from the collision
// boxes, then blitted rotated under the player each frame.

export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 3.4;                       // pixels per metre on screen
    this.world = world;
    this._buildStatic(world);
  }

  _buildStatic(world) {
    const b = world.bounds;
    const px = 8;                            // static layer resolution
    const w = Math.ceil((b.maxX - b.minX + 8) * px);
    const h = Math.ceil((b.maxZ - b.minZ + 8) * px);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    this.static = c;
    this.staticPx = px;
    this.origin = { x: b.minX - 4, z: b.minZ - 4 };

    g.fillStyle = '#1b2318';
    g.fillRect(0, 0, w, h);
    const X = (x) => (x - this.origin.x) * px;
    const Z = (z) => (z - this.origin.z) * px;

    // road + pavements
    g.fillStyle = '#2b2d30';
    g.fillRect(X(-32), Z(-4.6), 64 * px, 9.2 * px);
    g.strokeStyle = 'rgba(226,206,120,.5)';
    g.lineWidth = 1.5;
    g.setLineDash([6, 8]);
    g.beginPath(); g.moveTo(X(-32), Z(0)); g.lineTo(X(32), Z(0)); g.stroke();
    g.setLineDash([]);

    // every collision box becomes a footprint, shaded by height
    for (const box of world.collider.boxes) {
      if (box.tag === 'ground' || box.tag === 'noclip') continue;
      const top = box.maxY, bot = box.minY;
      if (top < 0.25) continue;
      const bw = box.maxX - box.minX, bd = box.maxZ - box.minZ;
      if (bw > 60 || bd > 60) continue;              // skip the ground slab
      if (bot > 3.6) continue;                       // upper floors would hide the ground plan
      g.fillStyle = top > 2.6 ? 'rgba(122,132,140,.95)'
        : top > 1.4 ? 'rgba(96,104,112,.85)'
          : 'rgba(74,80,86,.7)';
      g.fillRect(X(box.minX), Z(box.minZ), bw * px, bd * px);
    }

    // spawn markers
    for (const [team, color] of [['A', 'rgba(78,163,255,.35)'], ['B', 'rgba(255,83,64,.35)']]) {
      g.fillStyle = color;
      for (const s of world.spawns[team]) {
        g.beginPath();
        g.arc(X(s.x), Z(s.z), 1.6 * px, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  draw(player, actors, grenades) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const S = this.scale;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0e1310';
    ctx.fillRect(0, 0, W, H);

    ctx.translate(W / 2, H / 2);
    ctx.rotate(player.yaw);
    ctx.scale(S / this.staticPx, S / this.staticPx);
    ctx.translate(
      -(player.pos.x - this.origin.x) * this.staticPx,
      -(player.pos.z - this.origin.z) * this.staticPx,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.static, 0, 0);
    ctx.restore();

    // entities
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(player.yaw);
    const mark = (a, color, known) => {
      const x = (a.pos.x - player.pos.x) * S;
      const z = (a.pos.z - player.pos.z) * S;
      if (Math.hypot(x, z) > Math.min(W, H) / 2 - 8) return;
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(a.yaw !== undefined ? -a.yaw : 0);
      ctx.fillStyle = color;
      if (known) {
        ctx.beginPath();
        ctx.moveTo(0, -5); ctx.lineTo(4, 4); ctx.lineTo(-4, 4);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    };
    for (const { a, known } of actors) {
      mark(a, a.team === player.team ? '#4ea3ff' : '#ff5340', known);
    }
    for (const g of grenades || []) {
      const x = (g.p.x - player.pos.x) * S, z = (g.p.z - player.pos.z) * S;
      ctx.fillStyle = '#ffcb3d';
      ctx.beginPath(); ctx.arc(x, z, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // player arrow, always centred and pointing up
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // compass ring
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    // north marker: world -Z rotated into the map's frame
    const r = Math.min(W, H) / 2 - 13;
    const nx = Math.sin(player.yaw), nz = -Math.cos(player.yaw);
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = 'bold 12px "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', W / 2 + nx * r, H / 2 + nz * r);
  }
}
