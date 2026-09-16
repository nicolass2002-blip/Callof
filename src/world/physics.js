// Axis-aligned box world: collision, stepping, ray casting.
// Everything Nuketown is made of registers a box here, so bullets and feet
// agree with what you see without any mesh-level raycasting.

const EPS = 1e-4;
const CELL = 4;

export class Collider {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this.built = false;
  }

  /** @param {object} b {x,y,z} centre and {w,h,d} size, plus tag/mat metadata. */
  add(x, y, z, w, h, d, mat = 'concrete', tag = 'world') {
    const box = {
      minX: x - w / 2, maxX: x + w / 2,
      minY: y, maxY: y + h,
      minZ: z - d / 2, maxZ: z + d / 2,
      mat, tag,
    };
    this.boxes.push(box);
    this.built = false;
    return box;
  }

  addBox(box) { this.boxes.push(box); this.built = false; return box; }

  build() {
    this.grid.clear();
    this.boxes.forEach((b, i) => {
      const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
      const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const k = x * 10000 + z;
          let cell = this.grid.get(k);
          if (!cell) this.grid.set(k, (cell = []));
          cell.push(i);
        }
      }
    });
    this.built = true;
  }

  /** Candidate boxes overlapping an XZ rect. */
  query(minX, minZ, maxX, maxZ, out = []) {
    if (!this.built) this.build();
    out.length = 0;
    const seen = new Set();
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const cell = this.grid.get(x * 10000 + z);
        if (!cell) continue;
        for (const i of cell) {
          if (seen.has(i)) continue;
          seen.add(i);
          out.push(this.boxes[i]);
        }
      }
    }
    return out;
  }

  /** Is the actor AABB (feet at y, given half-width and height) free? */
  free(x, y, z, half, height, candidates) {
    const minX = x - half, maxX = x + half, minZ = z - half, maxZ = z + half;
    const minY = y + EPS, maxY = y + height - EPS;
    for (const b of candidates) {
      if (b.tag === 'noclip') continue;
      if (maxX > b.minX && minX < b.maxX &&
          maxY > b.minY && minY < b.maxY &&
          maxZ > b.minZ && minZ < b.maxZ) return false;
    }
    return true;
  }

  /**
   * Move an actor with axis-separated resolution and stair stepping.
   * `pos` is the feet position and is mutated in place.
   */
  move(pos, vel, dt, half, height, stepHeight = 0.42) {
    const pad = 2 + Math.max(Math.abs(vel.x), Math.abs(vel.z)) * dt;
    const cand = this.query(pos.x - half - pad, pos.z - half - pad,
                            pos.x + half + pad, pos.z + half + pad);
    const res = { grounded: false, wall: false, ceiling: false, ground: null };

    // --- vertical ---
    pos.y += vel.y * dt;
    for (const b of cand) {
      if (b.tag === 'noclip') continue;
      if (pos.x + half <= b.minX || pos.x - half >= b.maxX) continue;
      if (pos.z + half <= b.minZ || pos.z - half >= b.maxZ) continue;
      if (pos.y + height <= b.minY || pos.y >= b.maxY) continue;
      if (vel.y <= 0) {
        // landing: only snap up if we came from above the surface
        if (pos.y > b.maxY - Math.max(0.5, -vel.y * dt) - 0.02) {
          pos.y = b.maxY;
          vel.y = 0;
          res.grounded = true;
          res.ground = b;
        }
      } else if (pos.y + height > b.minY && pos.y < b.minY) {
        pos.y = b.minY - height - EPS;
        vel.y = 0;
        res.ceiling = true;
      }
    }
    // ground probe (so standing still still counts as grounded)
    if (!res.grounded && vel.y <= 0) {
      for (const b of cand) {
        if (b.tag === 'noclip') continue;
        if (pos.x + half <= b.minX || pos.x - half >= b.maxX) continue;
        if (pos.z + half <= b.minZ || pos.z - half >= b.maxZ) continue;
        if (Math.abs(pos.y - b.maxY) < 0.06) { res.grounded = true; res.ground = b; pos.y = b.maxY; vel.y = 0; break; }
      }
    }

    // --- horizontal, one axis at a time, with a step-up retry ---
    for (const axis of ['x', 'z']) {
      const delta = vel[axis] * dt;
      if (delta === 0) continue;
      const old = pos[axis];
      pos[axis] = old + delta;
      if (this.free(pos.x, pos.y, pos.z, half, height, cand)) continue;

      let stepped = false;
      if (res.grounded || vel.y <= 0.1) {
        for (const rise of [0.15, stepHeight]) {
          // need both a clear destination and headroom for the raised body
          if (this.free(pos.x, pos.y + rise, pos.z, half, height, cand)) {
            pos.y += rise;
            stepped = true;
            res.grounded = true;
            break;
          }
        }
      }
      if (!stepped) {
        pos[axis] = old;
        vel[axis] = 0;
        res.wall = true;
      }
    }
    return res;
  }

  /** Nearest box hit by a ray. Returns {dist, normal:{x,y,z}, box} or null. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 200) {
    if (!this.built) this.build();
    // March the broadphase grid in XZ, but keep it simple: sample a corridor.
    const pad = 0.5;
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    const cand = this.query(Math.min(ox, ex) - pad, Math.min(oz, ez) - pad,
                            Math.max(ox, ex) + pad, Math.max(oz, ez) + pad);
    let best = null;
    const inv = { x: 1 / (dx || 1e-9), y: 1 / (dy || 1e-9), z: 1 / (dz || 1e-9) };
    for (const b of cand) {
      if (b.tag === 'noclip' || b.tag === 'nohit') continue;
      let t0 = 0, t1 = maxDist, axis = 0, sgn = 1;
      // X slab
      let ta = (b.minX - ox) * inv.x, tb = (b.maxX - ox) * inv.x;
      let s = -1;
      if (ta > tb) { const t = ta; ta = tb; tb = t; s = 1; }
      if (ta > t0) { t0 = ta; axis = 0; sgn = s; }
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
      // Y slab
      ta = (b.minY - oy) * inv.y; tb = (b.maxY - oy) * inv.y; s = -1;
      if (ta > tb) { const t = ta; ta = tb; tb = t; s = 1; }
      if (ta > t0) { t0 = ta; axis = 1; sgn = s; }
      t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
      // Z slab
      ta = (b.minZ - oz) * inv.z; tb = (b.maxZ - oz) * inv.z; s = -1;
      if (ta > tb) { const t = ta; ta = tb; tb = t; s = 1; }
      if (ta > t0) { t0 = ta; axis = 2; sgn = s; }
      t1 = Math.min(t1, tb);
      if (t0 > t1 || t0 < 0) continue;

      if (!best || t0 < best.dist) {
        best = {
          dist: t0,
          normal: { x: axis === 0 ? sgn : 0, y: axis === 1 ? sgn : 0, z: axis === 2 ? sgn : 0 },
          box: b,
          mat: b.mat,
        };
      }
    }
    return best;
  }

  /** Cheap boolean line-of-sight test between two points. */
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
    return !hit || hit.dist >= len - 0.05;
  }
}
