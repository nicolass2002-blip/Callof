// Everything static in the level is a (possibly yaw-rotated) box.
// The builder batches boxes per material into merged BufferGeometries, so the
// whole of Nuketown renders in a couple dozen draw calls, and registers a
// matching AABB with the collider for movement and bullets.
import * as THREE from 'three';
import { Collider } from './physics.js';

/* face table: normal, 4 corners (unit, centred), u-size axis, v-size axis */
const FACES = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], us: 'd', vs: 'h' },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], us: 'd', vs: 'h' },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], us: 'w', vs: 'd' },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], us: 'w', vs: 'd' },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], us: 'w', vs: 'h' },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], us: 'w', vs: 'h' },
];

export class Builder {
  /**
   * @param {object} tex texture table from buildTextures()
   */
  constructor(tex) {
    this.tex = tex;
    this.batches = new Map();
    this.materials = new Map();
    this.collider = new Collider();
    this.stack = [{ ox: 0, oz: 0, s: 1 }];
    this.props = [];             // non-merged extras (sprites, cylinders…)
  }

  /* ----------------------------- transform ---------------------------- */
  /** Place subsequent local coordinates at (ox,oz); s=-1 rotates by 180°. */
  push(ox, oz, s = 1) { this.stack.push({ ox, oz, s }); return this; }
  pop() { this.stack.pop(); return this; }
  get tf() { return this.stack[this.stack.length - 1]; }
  toWorld(x, z) {
    const t = this.tf;
    return { x: t.ox + t.s * x, z: t.oz + t.s * z };
  }

  /* ----------------------------- materials ---------------------------- */
  material(name) {
    if (this.materials.has(name)) return this.materials.get(name);
    let m;
    if (name[0] === '#') {
      m = new THREE.MeshLambertMaterial({ color: name });
    } else if (name === 'glass') {
      m = new THREE.MeshPhongMaterial({
        map: this.tex.window, shininess: 70, specular: 0x8fb8cc,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
    } else if (name === 'chain') {
      m = new THREE.MeshLambertMaterial({
        map: this.tex.chainlink, transparent: true, alphaTest: 0.4,
        side: THREE.DoubleSide, depthWrite: true,
      });
    } else if (name === 'metal' || name === 'busPaint') {
      m = new THREE.MeshPhongMaterial({ map: this.tex[name], shininess: 26, specular: 0x4a4e52 });
    } else if (name === 'sign' || name === 'fallout' || name === 'clock') {
      m = new THREE.MeshLambertMaterial({ map: this.tex[name] ?? this.tex.sign, side: THREE.DoubleSide });
    } else {
      const map = this.tex[name];
      if (!map) throw new Error(`unknown material: ${name}`);
      m = new THREE.MeshLambertMaterial({ map });
    }
    m.name = name;
    this.materials.set(name, m);
    return m;
  }

  _batch(key) {
    let b = this.batches.get(key);
    if (!b) {
      b = { pos: [], norm: [], uv: [], idx: [], count: 0 };
      this.batches.set(key, b);
    }
    return b;
  }

  /**
   * Add a box.
   * @param {number} x local centre X   @param {number} y world-space bottom Y
   * @param {number} z local centre Z
   * @param {number} w,h,d dimensions
   * @param {string} mat material name ('#rrggbb' allowed)
   * @param {object} o {tile, fit, rotY, solid, tag, colMat, shadow}
   */
  box(x, y, z, w, h, d, mat = 'concrete', o = {}) {
    const t = this.tf;
    const wp = this.toWorld(x, z);
    const rotY = (o.rotY || 0) * t.s + (t.s < 0 ? Math.PI : 0);
    const tile = o.tile ?? 2;
    const fit = !!o.fit;
    const key = mat + (o.shadow === false ? '|ns' : '');
    const b = this._batch(key);
    const cy = y + h / 2;
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const sizes = { w, h, d };

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const f of FACES) {
      const base = b.count;
      const su = sizes[f.us], sv = sizes[f.vs];
      const uvs = fit
        ? [[0, 0], [1, 0], [1, 1], [0, 1]]
        : [[0, 0], [su / tile, 0], [su / tile, sv / tile], [0, sv / tile]];
      for (let i = 0; i < 4; i++) {
        const c = f.c[i];
        const lx = c[0] * hx, ly = c[1] * hy, lz = c[2] * hz;
        const px = lx * cos + lz * sin, pz = -lx * sin + lz * cos;
        const X = wp.x + px, Y = cy + ly, Z = wp.z + pz;
        b.pos.push(X, Y, Z);
        if (X < minX) minX = X; if (X > maxX) maxX = X;
        if (Z < minZ) minZ = Z; if (Z > maxZ) maxZ = Z;
        const nx = f.n[0] * cos + f.n[2] * sin, nz = -f.n[0] * sin + f.n[2] * cos;
        b.norm.push(nx, f.n[1], nz);
        b.uv.push(uvs[i][0], uvs[i][1]);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      b.count += 4;
    }

    if (o.solid !== false) {
      this.collider.addBox({
        minX, maxX, minY: y, maxY: y + h, minZ, maxZ,
        mat: o.colMat ?? this._colMat(mat),
        tag: o.tag ?? 'world',
      });
    }
    return { x: wp.x, y, z: wp.z, w, h, d };
  }

  /** Collision-only volume (no geometry) — roof cavities, invisible clips. */
  clip(x, y, z, w, h, d, mat = 'concrete', tag = 'world') {
    const wp = this.toWorld(x, z);
    return this.collider.addBox({
      minX: wp.x - w / 2, maxX: wp.x + w / 2,
      minY: y, maxY: y + h,
      minZ: wp.z - d / 2, maxZ: wp.z + d / 2,
      mat, tag,
    });
  }

  /** Free-form mesh (anything a yaw-only box cannot express). */
  add(mesh) { this.props.push(mesh); return mesh; }

  /** Non-solid decoration (bullets and bodies pass straight through). */
  deco(x, y, z, w, h, d, mat, o = {}) {
    return this.box(x, y, z, w, h, d, mat, { ...o, solid: false });
  }

  _colMat(mat) {
    if (mat === 'glass') return 'glass';
    if (mat === 'grass' || mat === 'dirt') return 'dirt';
    if (mat === 'metal' || mat === 'busPaint' || mat === 'chain' || mat === 'garage') return 'metal';
    if (/wood|plank|door|shingle/.test(mat)) return 'wood';
    return 'concrete';
  }

  /** A four-sided hollow room: walls with optional openings are composed by hand. */
  wallX(x, y, z0, z1, h, thick, mat, o = {}) {
    return this.box(x, y, (z0 + z1) / 2, thick, h, Math.abs(z1 - z0), mat, o);
  }
  wallZ(z, y, x0, x1, h, thick, mat, o = {}) {
    return this.box((x0 + x1) / 2, y, z, Math.abs(x1 - x0), h, thick, mat, o);
  }

  /** Wall along X with a rectangular hole (door/window) punched out. */
  wallZHole(z, x0, x1, y0, y1, hole, thick, mat, o = {}) {
    const { x: hx0, x1: hx1, y: hy0, y1: hy1 } = hole;
    if (hx0 > x0) this.wallZ(z, y0, x0, hx0, y1 - y0, thick, mat, o);
    if (hx1 < x1) this.wallZ(z, y0, hx1, x1, y1 - y0, thick, mat, o);
    if (hy0 > y0) this.wallZ(z, y0, hx0, hx1, hy0 - y0, thick, mat, o);
    if (hy1 < y1) this.wallZ(z, hy1, hx0, hx1, y1 - hy1, thick, mat, o);
  }

  wallXHole(x, z0, z1, y0, y1, hole, thick, mat, o = {}) {
    const { z: hz0, z1: hz1, y: hy0, y1: hy1 } = hole;
    if (hz0 > z0) this.wallX(x, y0, z0, hz0, y1 - y0, thick, mat, o);
    if (hz1 < z1) this.wallX(x, y0, hz1, z1, y1 - y0, thick, mat, o);
    if (hy0 > y0) this.wallX(x, y0, hz0, hz1, hy0 - y0, thick, mat, o);
    if (hy1 < y1) this.wallX(x, hy1, hz0, hz1, y1 - hy1, thick, mat, o);
  }

  /** Merge every batch into meshes and return the scene group. */
  finish() {
    const group = new THREE.Group();
    group.name = 'level';
    for (const [key, b] of this.batches) {
      const name = key.replace('|ns', '');
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.material(name));
      mesh.castShadow = !key.endsWith('|ns');
      mesh.receiveShadow = true;
      mesh.name = `batch:${key}`;
      group.add(mesh);
    }
    for (const p of this.props) group.add(p);
    this.collider.build();
    return group;
  }
}
