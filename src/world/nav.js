// Waypoint navigation. Nodes are auto-sampled from the collision world (so
// they always match the geometry), stitched with line-of-sight links, and
// all-pairs next-hop is precomputed once — path queries are then O(1).

export class NavGraph {
  constructor(collider, bounds, hints = []) {
    this.collider = collider;
    this.nodes = [];
    this.links = [];
    this._build(bounds, hints);
  }

  _standable(x, z, from, half = 0.4, height = 1.75, lift = 0.05) {
    const hit = this.collider.raycast(x, from, z, 0, -1, 0, 6.5);
    if (!hit) return null;
    const y = from - hit.dist;
    if (hit.box.tag === 'noclip') return null;
    const cand = this.collider.query(x - 1, z - 1, x + 1, z + 1);
    if (!this.collider.free(x, y + lift, z, half, height, cand)) return null;
    return y;
  }

  _build(bounds, hints) {
    const step = 2.2;
    const found = [];
    for (let x = bounds.minX + 1; x <= bounds.maxX - 1; x += step) {
      for (let z = bounds.minZ + 1; z <= bounds.maxZ - 1; z += step) {
        const levels = [];
        for (const from of [1.4, 4.3]) {
          const y = this._standable(x, z, from);
          if (y === null || y === undefined) continue;
          if (levels.some((l) => Math.abs(l - y) < 0.8)) continue;
          levels.push(y);
        }
        for (const y of levels) found.push({ x, y, z });
      }
    }
    // hand-placed hints snap onto whatever surface is actually under them
    const chained = [];
    for (const h of hints) {
      // hints use a slim probe: a staircase step always clips a full-size box
      // slim, slightly lifted probe: a stair riser always clips a full-size box
      const y = this._standable(h.x, h.z, h.y + 1.7, 0.14, 1.2, 0.3)
        ?? this._standable(h.x, h.z, h.y + 0.45, 0.14, 1.2, 0.3);
      if (y === null || y === undefined) continue;
      if (Math.abs(y - h.y) > 1.6) continue;
      const n = { x: h.x, y, z: h.z };
      found.push(n);
      if (h.chain) chained.push({ chain: h.chain, order: h.order ?? 0, n });
    }
    // de-duplicate (tight in Y so successive staircase nodes both survive)
    for (const n of found) {
      if (this.nodes.some((m) => Math.abs(m.x - n.x) < 0.8 && Math.abs(m.z - n.z) < 0.8
        && Math.abs(m.y - n.y) < 0.45)) continue;
      this.nodes.push({ x: n.x, y: n.y, z: n.z, links: [] });
    }

    // link
    const R = 4.6;
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > R) continue;
        const dy = b.y - a.y;
        if (Math.abs(dy) > 1.25) continue;
        if (Math.abs(dy) > 0.45 && d > 2.4) continue;         // too steep to be a slope
        if (!this.collider.los(a.x, a.y + 0.95, a.z, b.x, b.y + 0.95, b.z)) continue;
        // ankle-height check rejects links that hop over waist-high cover, but
        // stair links legitimately have risers in the way, so skip it there
        if (Math.abs(dy) < 0.2 &&
            !this.collider.los(a.x, a.y + 0.28, a.z, b.x, b.y + 0.28, b.z)) continue;
        const cost = Math.hypot(d, dy * 2);
        a.links.push({ n: j, cost });
        b.links.push({ n: i, cost });
      }
    }

    // Chains (staircases) are declared by the map and linked unconditionally:
    // stair risers defeat the generic visibility test.
    const byChain = new Map();
    for (const c of chained) {
      const idx = this.nodes.findIndex((n) => n.x === c.n.x && n.y === c.n.y && n.z === c.n.z);
      if (idx < 0) continue;
      if (!byChain.has(c.chain)) byChain.set(c.chain, []);
      byChain.get(c.chain).push({ order: c.order, idx });
    }
    for (const list of byChain.values()) {
      list.sort((a, b) => a.order - b.order);
      for (let i = 0; i + 1 < list.length; i++) {
        const a = this.nodes[list[i].idx], b = this.nodes[list[i + 1].idx];
        if (a.links.some((l) => l.n === list[i + 1].idx)) continue;
        const cost = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 1.5 + 0.2;
        a.links.push({ n: list[i + 1].idx, cost });
        b.links.push({ n: list[i].idx, cost });
      }
    }

    this._keepLargestComponent();
    // tag nodes so bots can prefer rooftops, rooms or the open street
    for (const n of this.nodes) {
      n.indoor = !!this.collider.raycast(n.x, n.y + 1.75, n.z, 0, 1, 0, 4.5);
      n.high = n.y > 1.2;
    }

    // spatial hash for nearest-node lookups
    this.cell = 4;
    this.hash = new Map();
    this.nodes.forEach((n, i) => {
      const k = `${Math.floor(n.x / this.cell)},${Math.floor(n.z / this.cell)}`;
      let arr = this.hash.get(k);
      if (!arr) this.hash.set(k, (arr = []));
      arr.push(i);
    });

    this._precompute();
  }

  /**
   * Drop islands (garage/porch roofs sampled from above, sealed pockets) so a
   * bot never picks a goal it cannot walk to.
   */
  _keepLargestComponent() {
    const N = this.nodes.length;
    const comp = new Int16Array(N).fill(-1);
    let best = -1, bestSize = 0, c = 0;
    for (let i = 0; i < N; i++) {
      if (comp[i] >= 0) continue;
      const q = [i];
      comp[i] = c;
      let size = 0;
      while (q.length) {
        const u = q.pop();
        size++;
        for (const l of this.nodes[u].links) {
          if (comp[l.n] < 0) { comp[l.n] = c; q.push(l.n); }
        }
      }
      if (size > bestSize) { bestSize = size; best = c; }
      c++;
    }
    if (bestSize === N) return;
    const remap = new Int16Array(N).fill(-1);
    const kept = [];
    for (let i = 0; i < N; i++) {
      if (comp[i] !== best) continue;
      remap[i] = kept.length;
      kept.push(this.nodes[i]);
    }
    for (const n of kept) {
      n.links = n.links
        .filter((l) => remap[l.n] >= 0)
        .map((l) => ({ n: remap[l.n], cost: l.cost }));
    }
    this.dropped = N - kept.length;
    this.nodes = kept;
  }

  /** All-pairs next hop via Dijkstra from every node (map is small). */
  _precompute() {
    const N = this.nodes.length;
    this.next = new Int16Array(N * N).fill(-1);
    const dist = new Float32Array(N);
    const hop = new Int16Array(N);
    const visited = new Uint8Array(N);
    for (let src = 0; src < N; src++) {
      dist.fill(Infinity);
      hop.fill(-1);
      visited.fill(0);
      dist[src] = 0;
      for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < N; i++) if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
        if (u < 0) break;
        visited[u] = 1;
        for (const l of this.nodes[u].links) {
          const nd = dist[u] + l.cost;
          if (nd < dist[l.n]) {
            dist[l.n] = nd;
            // remember the first step taken out of src on this route
            hop[l.n] = u === src ? l.n : hop[u];
          }
        }
      }
      const row = src * N;
      for (let dst = 0; dst < N; dst++) this.next[row + dst] = dst === src ? dst : hop[dst];
    }
  }

  nearest(x, y, z, requireLos = true) {
    let best = -1, bestD = Infinity;
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let r = 0; r <= 3 && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (r > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const arr = this.hash.get(`${cx + dx},${cz + dz}`);
          if (!arr) continue;
          for (const i of arr) {
            const n = this.nodes[i];
            const dy = Math.abs(n.y - y);
            if (dy > 2.2) continue;
            const d = Math.hypot(n.x - x, n.z - z) + dy * 1.5;
            if (d >= bestD) continue;
            if (requireLos && !this.collider.los(x, y + 0.9, z, n.x, n.y + 0.9, n.z)) continue;
            bestD = d; best = i;
          }
        }
      }
    }
    if (best < 0 && requireLos) return this.nearest(x, y, z, false);
    return best;
  }

  /** Next node index to walk toward, or -1. */
  step(from, to) {
    if (from < 0 || to < 0) return -1;
    if (from === to) return to;
    const n = this.next[from * this.nodes.length + to];
    return n < 0 ? -1 : n;
  }

  node(i) { return this.nodes[i]; }

  /** A random node, optionally biased toward a position. */
  randomNode() { return (Math.random() * this.nodes.length) | 0; }
}
