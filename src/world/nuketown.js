// ============================================================================
//  NUKETOWN  —  Nevada Test Site "Survival Town", Black Ops (1962) layout
//  Two identical suburban houses in 180° rotational symmetry, a two-lane road
//  between them, garages + driveways on the inner flanks, fenced backyards,
//  side lots with the school bus / pickup spawn areas, mannequins everywhere,
//  the WELCOME TO NUKETOWN billboard and the detonation countdown clock.
// ============================================================================
import * as THREE from 'three';
import { Builder } from './builder.js';

const WT = 0.28;     // wall thickness
const FLOOR = 0.30;  // ground floor surface
const F2 = 3.45;     // first floor (upstairs) surface
const TOP = 6.50;    // top of the exterior walls
const RISE = 2.05;   // roof rise
const STAIR = { x: -4.9, w: 1.9, z0: 0.62, run: 0.38, steps: 13 };
const STAIR_RISE = (F2 - FLOOR) / STAIR.steps;

/* ------------------------------------------------------------------ utils */

/** Wall with any number of rectangular openings punched through it. */
function panelWall(B, o) {
  const { axis, coord, a0, a1, y0, y1, thick, mat, tile = 2, inner, innerSide = 1 } = o;
  const holes = (o.holes || []).slice().sort((p, q) => p.a[0] - q.a[0]);
  // Walls with an interior side are built as two half-thickness skins so the
  // room sees plaster while the street sees siding.
  const skins = inner
    ? [{ m: mat, off: -innerSide * thick / 4, t: thick / 2 },
       { m: inner, off: innerSide * thick / 4, t: thick / 2, tile: 2.2 }]
    : [{ m: mat, off: 0, t: thick }];
  const seg = (s, e, yy0, yy1) => {
    if (e - s < 0.02 || yy1 - yy0 < 0.02) return;
    for (const sk of skins) {
      const tl = sk.tile ?? tile;
      if (axis === 'z') B.box((s + e) / 2, yy0, coord + sk.off, e - s, yy1 - yy0, sk.t, sk.m, { tile: tl });
      else B.box(coord + sk.off, yy0, (s + e) / 2, sk.t, yy1 - yy0, e - s, sk.m, { tile: tl });
    }
  };
  const pane = (h) => {
    const gh = h.y[1] - h.y[0], gs = h.a[1] - h.a[0];
    if (axis === 'z') B.deco((h.a[0] + h.a[1]) / 2, h.y[0], coord, gs, gh, thick * 0.3, 'glass', { fit: true });
    else B.deco(coord, h.y[0], (h.a[0] + h.a[1]) / 2, thick * 0.3, gh, gs, 'glass', { fit: true });
  };
  let cur = a0;
  for (const h of holes) {
    seg(cur, h.a[0], y0, y1);
    seg(h.a[0], h.a[1], y0, h.y[0]);
    seg(h.a[0], h.a[1], h.y[1], y1);
    if (h.glass) pane(h);
    cur = h.a[1];
  }
  seg(cur, a1, y0, y1);
}

function triangle(mat, a, b, c) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/* --------------------------------------------------------------- mannequin */

function mannequin(B, x, z, rotY = 0, y = 0, pose = 0) {
  const M = '#ded2b6';
  const o = { tile: 1.2, rotY, solid: false };
  // legs
  B.deco(x - 0.12, y + 0.02, z, 0.17, 0.82, 0.19, M, o);
  B.deco(x + 0.12, y + 0.02, z, 0.17, 0.82, 0.19, M, o);
  // hips + torso
  B.deco(x, y + 0.8, z, 0.46, 0.26, 0.24, M, o);
  B.deco(x, y + 1.02, z, 0.52, 0.52, 0.27, M, o);
  B.deco(x, y + 1.5, z, 0.2, 0.1, 0.2, M, o);
  B.deco(x, y + 1.58, z, 0.23, 0.26, 0.24, M, o);          // head
  if (pose === 0) {                                          // arms forward
    B.deco(x - 0.34, y + 1.2, z + 0.22, 0.15, 0.15, 0.62, M, { ...o });
    B.deco(x + 0.34, y + 1.2, z + 0.22, 0.15, 0.15, 0.62, M, { ...o });
  } else if (pose === 1) {                                   // arms out (T)
    B.deco(x - 0.56, y + 1.32, z, 0.66, 0.15, 0.15, M, o);
    B.deco(x + 0.56, y + 1.32, z, 0.66, 0.15, 0.15, M, o);
  } else {                                                   // arms down
    B.deco(x - 0.33, y + 0.96, z, 0.14, 0.62, 0.15, M, o);
    B.deco(x + 0.33, y + 0.96, z, 0.14, 0.62, 0.15, M, o);
  }
}

/* ----------------------------------------------------------------- houses */

function house(B, cx, cz, s, P) {
  B.push(cx, cz, s);
  const sid = P.siding;

  /* foundation, floors, ceilings */
  B.box(0, -0.45, 4.5, 12.7, 0.75, 9.7, 'brick', { tile: 1.6 });        // top = FLOOR
  B.deco(0, FLOOR, 6.75, 11.7, 0.02, 4.2, 'carpet', { tile: 2.5 });     // living room
  B.deco(0, FLOOR, 2.3, 11.7, 0.02, 4.4, 'tiles', { tile: 1.5 });       // kitchen
  // upstairs slab, with the stairwell left open
  B.box(-4.9, F2 - 0.2, 7.15, 2.0, 0.2, 3.5, 'plaster', { tile: 2 });
  B.box(-4.9, F2 - 0.2, 0.37, 2.0, 0.2, 0.54, 'plaster', { tile: 2 });
  B.box(1.0, F2 - 0.2, 4.5, 9.8, 0.2, 8.8, 'plaster', { tile: 2 });
  B.deco(1.05, F2, 4.5, 9.8, 0.02, 8.9, 'carpet', { tile: 2.5 });
  B.deco(-4.95, F2, 7.2, 2.0, 0.02, 3.5, 'carpet', { tile: 2.5 });
  B.box(0, TOP - 0.2, 4.5, 11.8, 0.2, 8.8, 'plaster', { tile: 2 });     // attic floor

  /* exterior walls — ground floor */
  panelWall(B, {
    axis: 'z', coord: 9 - WT / 2, a0: -6, a1: 6, y0: FLOOR, y1: F2, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: -1,
    holes: [
      { a: [-3.7, -2.25], y: [FLOOR, 2.45] },                  // front door
      { a: [0.3, 3.2], y: [1.15, 2.5], glass: true },          // picture window
    ],
  });
  B.deco(-2.97, FLOOR, 9 - WT / 2 - 0.1, 1.4, 2.15, 0.08, 'door', { fit: true });
  panelWall(B, {
    axis: 'z', coord: WT / 2, a0: -6, a1: 6, y0: FLOOR, y1: F2, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: 1,
    holes: [
      { a: [-3.7, -2.0], y: [1.3, 2.45], glass: true },        // kitchen window
      { a: [1.5, 2.9], y: [FLOOR, 2.45] },                     // back door
    ],
  });
  panelWall(B, {
    axis: 'x', coord: -6 + WT / 2, a0: 0, a1: 9, y0: FLOOR, y1: F2, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: 1,
    holes: [{ a: [6.3, 7.9], y: [1.2, 2.45], glass: true }],
  });
  panelWall(B, {
    axis: 'x', coord: 6 - WT / 2, a0: 0, a1: 9, y0: FLOOR, y1: F2, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: -1,
    holes: [
      { a: [2.6, 3.95], y: [FLOOR, 2.45] },                    // door into garage
      { a: [6.4, 7.9], y: [1.2, 2.45], glass: true },
    ],
  });

  /* exterior walls — upstairs */
  panelWall(B, {
    axis: 'z', coord: 9 - WT / 2, a0: -6, a1: 6, y0: F2, y1: TOP, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: -1,
    holes: [
      { a: [-4.4, -2.7], y: [4.35, 5.55], glass: true },
      { a: [0.7, 2.4], y: [4.35, 5.55], glass: true },
    ],
  });
  panelWall(B, {
    axis: 'z', coord: WT / 2, a0: -6, a1: 6, y0: F2, y1: TOP, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: 1,
    holes: [
      { a: [-4.1, -2.5], y: [4.35, 5.55], glass: true },
      { a: [1.2, 3.0], y: [4.35, 5.55], glass: true },
    ],
  });
  panelWall(B, {
    axis: 'x', coord: -6 + WT / 2, a0: 0, a1: 9, y0: F2, y1: TOP, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: 1,
    holes: [{ a: [1.0, 2.7], y: [4.35, 5.55], glass: true }],
  });
  panelWall(B, {
    axis: 'x', coord: 6 - WT / 2, a0: 0, a1: 9, y0: F2, y1: TOP, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: -1,
    holes: [{ a: [6.2, 7.9], y: [4.35, 5.55], glass: true }],
  });

  /* interior partitions */
  panelWall(B, {                                   // kitchen / living divider
    axis: 'z', coord: 4.6, a0: -3.9, a1: 5.85, y0: FLOOR, y1: F2 - 0.2, thick: 0.16, mat: 'plasterWarm',
    holes: [{ a: [2.3, 3.7], y: [FLOOR, 2.4] }],
  });
  panelWall(B, {                                   // upstairs bedroom divider
    axis: 'x', coord: 0, a0: 0.15, a1: 8.85, y0: F2, y1: TOP - 0.2, thick: 0.16, mat: 'plasterWarm',
    holes: [{ a: [5.5, 6.9], y: [F2, F2 + 2.1] }],
  });
  panelWall(B, {                                   // upstairs landing wall
    axis: 'z', coord: 5.5, a0: -3.9, a1: 0, y0: F2, y1: TOP - 0.2, thick: 0.16, mat: 'plasterWarm',
    holes: [{ a: [-3.0, -1.6], y: [F2, F2 + 2.1] }],
  });

  /* staircase (west wall) + landing railing */
  for (let i = 0; i < STAIR.steps; i++) {
    B.box(STAIR.x, FLOOR, STAIR.z0 + i * STAIR.run + STAIR.run / 2,
      STAIR.w, STAIR_RISE * (i + 1), STAIR.run, 'wood', { tile: 1 });
  }
  B.box(-3.95, F2, 3.0, 0.12, 0.95, 5.0, 'wood', { tile: 1 });          // rail
  B.box(-4.9, F2, 0.36, 1.9, 0.95, 0.12, 'wood', { tile: 1 });

  /* ground floor furniture */
  B.box(-4.2, FLOOR, 7.6, 2.4, 0.75, 0.95, '#5a4636', { tile: 1 });     // sofa base
  B.box(-4.2, FLOOR + 0.55, 8.1, 2.4, 0.5, 0.3, '#6b5442', { tile: 1 });
  B.box(1.6, FLOOR, 7.0, 1.1, 0.42, 0.62, '#7a5c3d', { tile: 1 });      // coffee table
  B.box(3.9, FLOOR, 5.4, 1.0, 0.55, 0.45, '#3a3d40', { tile: 1 });      // tv stand
  B.deco(3.9, FLOOR + 0.55, 5.4, 0.9, 0.62, 0.12, '#15181a', { fit: true });
  B.box(-5.0, FLOOR, 1.3, 1.4, 0.9, 0.62, '#d7d2c4', { tile: 1 });      // counter
  B.box(-2.0, FLOOR, 0.6, 3.4, 0.9, 0.66, '#d7d2c4', { tile: 1 });
  B.box(2.2, FLOOR, 0.62, 0.8, 1.75, 0.7, '#e3e6e4', { tile: 1 });      // fridge
  B.box(4.4, FLOOR, 2.9, 1.3, 0.78, 1.3, '#8a6a46', { tile: 1 });       // kitchen table
  mannequin(B, 4.4, 2.9, 3.1, FLOOR + 0.78, 2);                          // dinner guest

  /* upstairs furniture */
  B.box(3.4, F2, 2.0, 1.4, 0.55, 2.0, '#6d5a44', { tile: 1 });          // bed 1
  B.deco(3.4, F2 + 0.55, 2.0, 1.36, 0.18, 1.96, '#c8c0ad', { tile: 1 });
  B.box(3.6, F2, 6.9, 1.4, 0.55, 2.0, '#6d5a44', { tile: 1 });          // bed 2
  B.deco(3.6, F2 + 0.55, 6.9, 1.36, 0.18, 1.96, '#b9c3c8', { tile: 1 });
  B.box(-2.4, F2, 1.0, 1.6, 1.15, 0.55, '#5c4733', { tile: 1 });        // dresser
  B.box(5.3, F2, 4.6, 0.5, 0.5, 0.5, '#5c4733', { tile: 1 });           // nightstand

  /* porch */
  B.box(-1.0, -0.1, 9.85, 8.6, 0.4, 1.8, 'concrete', { tile: 1.5 });    // deck
  B.box(-1.0, -0.2, 11.0, 6.0, 0.35, 0.5, 'concrete', { tile: 1.5 });   // step
  for (const px of [-5.1, -1.0, 3.1]) B.box(px, FLOOR, 10.6, 0.18, 2.6, 0.18, 'wood', { tile: 1 });
  B.box(-1.0, 2.9, 9.9, 9.0, 0.22, 2.0, 'shingle', { tile: 1.4 });      // porch roof
  B.deco(3.4, FLOOR, 10.0, 0.7, 0.9, 0.7, '#7c6a4c', { tile: 1 });      // chair
  mannequin(B, -4.3, 10.2, 0.4, FLOOR, 1);

  /* garage */
  const G = { x0: 6, x1: 11.7, z0: 1.6, z1: 8.6 };
  B.box(8.85, -0.2, 5.1, 5.9, 0.5, 7.2, 'concrete', { tile: 2 });       // slab, top 0.3
  panelWall(B, { axis: 'z', coord: G.z0, a0: G.x0, a1: G.x1, y0: FLOOR, y1: 2.95, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: 1 });
  panelWall(B, {
    axis: 'x', coord: G.x1, a0: G.z0, a1: G.z1, y0: FLOOR, y1: 2.95, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: -1,
    holes: [{ a: [5.9, 7.4], y: [1.3, 2.4], glass: true }],
  });
  panelWall(B, {                                   // street side: door is up
    axis: 'z', coord: G.z1, a0: G.x0, a1: G.x1, y0: FLOOR, y1: 2.95, thick: WT, mat: sid, inner: 'plasterWarm', innerSide: -1,
    holes: [{ a: [6.5, 11.2], y: [FLOOR, 2.6] }],
  });
  B.deco(8.85, 2.62, G.z1 - 0.18, 4.7, 0.3, 0.2, 'garage', { fit: true });   // rolled-up door
  B.box(8.85, 2.95, 5.1, 6.2, 0.26, 7.5, 'shingle', { tile: 1.4 });
  B.box(11.0, FLOOR, 3.0, 0.7, 0.95, 2.4, '#6a5a3e', { tile: 1 });      // workbench
  B.box(10.9, FLOOR + 1.6, 3.0, 0.5, 0.06, 2.2, '#6a5a3e', { tile: 1 }); // shelf
  B.box(6.7, FLOOR, 2.3, 0.6, 0.9, 0.6, 'metal', { tile: 1 });          // oil drum
  B.box(7.5, FLOOR, 2.3, 0.6, 0.9, 0.6, 'metal', { tile: 1 });
  B.box(9.8, FLOOR, 7.6, 1.2, 0.7, 1.2, '#7b4a2e', { tile: 1 });        // crates
  B.box(9.9, FLOOR + 0.7, 7.5, 0.9, 0.6, 0.9, '#7b4a2e', { tile: 1 });

  /* mailbox, walkway, driveway */
  B.deco(-2.9, 0.05, 12.4, 1.8, 0.03, 3.2, 'concrete', { tile: 3 });    // front walk
  B.deco(8.85, 0.05, 10.8, 5.6, 0.03, 4.8, 'concrete', { tile: 3.5 });  // driveway
  B.box(5.4, 0, 12.2, 0.12, 1.15, 0.12, 'wood', { tile: 1 });
  B.deco(5.4, 1.15, 12.2, 0.22, 0.26, 0.46, '#4d5b63', { tile: 1 });

  /* roof: two slopes + gable ends, as free meshes (yaw-only boxes can't tilt) */
  const roofMat = B.material('shingle');
  const gableMat = B.material(sid);
  const rg = new THREE.Group();
  rg.position.set(cx, 0, cz);
  rg.rotation.y = s < 0 ? Math.PI : 0;
  const oh = 0.45, halfD = 4.6 + oh, slopeLen = Math.hypot(halfD, RISE);
  const theta = Math.atan2(RISE, halfD);
  for (const dir of [1, -1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(12 + oh * 2, 0.2, slopeLen), roofMat);
    slab.position.set(0, TOP + RISE / 2 - 0.02, 4.5 + dir * halfD / 2);
    slab.rotation.x = dir * theta;
    slab.castShadow = slab.receiveShadow = true;
    rg.add(slab);
  }
  for (const ex of [-6, 6]) {
    rg.add(triangle(gableMat,
      [ex, TOP, 4.5 - 4.6], [ex, TOP, 4.5 + 4.6], [ex, TOP + RISE, 4.5]));
  }
  B.add(rg);
  B.clip(0, TOP, 4.5, 12.6, RISE + 0.2, 9.6, 'wood');                   // roof volume

  /* chimney */
  B.box(4.6, TOP, 1.5, 0.9, 2.2, 0.9, 'brick', { tile: 1.2 });

  B.pop();
}

/* ------------------------------------------------------------- vehicles */

function schoolBus(B, x, z, rotY) {
  const o = { rotY, tile: 2 };
  B.box(x, 0.62, z, 9.6, 1.75, 2.55, 'busPaint', o);             // body
  B.box(x - 0.5, 2.37, z, 8.0, 0.28, 2.5, 'busPaint', o);        // roof
  B.deco(x - 0.5, 1.62, z, 7.9, 0.72, 2.62, 'glass', { rotY, tile: 1.4 });   // windows
  B.box(x + 4.1, 0.62, z, 1.6, 1.25, 2.4, 'busPaint', o);        // hood
  B.deco(x + 4.95, 1.05, z, 0.12, 0.7, 2.2, 'glass', { rotY, fit: true });
  B.box(x - 4.9, 0.35, z, 0.3, 1.1, 2.5, '#2d2f31', o);          // rear
  for (const dx of [3.5, -1.4, -3.7]) {
    for (const dz of [-1.25, 1.25]) {
      B.box(x + dx * Math.cos(rotY), 0, z - dx * Math.sin(rotY) + dz, 0.85, 0.62, 0.34, '#1c1d1f', { rotY, tile: 1 });
    }
  }
  B.deco(x + 1.8, 1.9, z + 1.3, 3.0, 0.4, 0.06, '#1c1d1f', { rotY, fit: true });
}

function sedan(B, x, z, rotY, color = '#93332a') {
  const o = { rotY, tile: 2 };
  B.box(x, 0.3, z, 4.6, 0.72, 1.92, color, o);
  B.box(x - 0.15, 1.02, z, 2.35, 0.62, 1.78, color, o);
  B.deco(x - 0.15, 1.05, z, 2.3, 0.55, 1.84, 'glass', { rotY, tile: 1.2 });
  B.box(x + 2.15, 0.52, z, 0.35, 0.34, 1.7, '#b9bdc0', o);       // bumper
  B.box(x - 2.15, 0.52, z, 0.35, 0.34, 1.7, '#b9bdc0', o);
  for (const dx of [1.5, -1.5]) {
    for (const dz of [-0.95, 0.95]) {
      B.box(x + dx * Math.cos(rotY), 0, z - dx * Math.sin(rotY) + dz, 0.72, 0.56, 0.3, '#17181a', { rotY, tile: 1 });
    }
  }
  B.deco(x + 2.3, 0.62, z - 0.6, 0.1, 0.22, 0.4, '#f2e6c0', { rotY, fit: true });
  B.deco(x + 2.3, 0.62, z + 0.6, 0.1, 0.22, 0.4, '#f2e6c0', { rotY, fit: true });
}

function pickup(B, x, z, rotY) {
  const o = { rotY, tile: 2 };
  B.box(x, 0.35, z, 5.2, 0.8, 2.05, '#3f5a48', o);
  B.box(x + 1.1, 1.15, z, 1.9, 0.75, 1.9, '#3f5a48', o);
  B.deco(x + 1.1, 1.2, z, 1.85, 0.6, 1.96, 'glass', { rotY, tile: 1.2 });
  B.box(x - 1.9, 1.15, z, 0.16, 0.6, 2.0, '#35503f', o);          // tailgate
  B.box(x - 0.75, 1.15, z - 0.95, 2.4, 0.55, 0.14, '#35503f', o); // bed walls
  B.box(x - 0.75, 1.15, z + 0.95, 2.4, 0.55, 0.14, '#35503f', o);
  B.box(x - 1.1, 1.15, z + 0.3, 0.9, 0.85, 0.9, '#6f4a2c', o);    // crate in the bed
  for (const dx of [1.7, -1.5]) {
    for (const dz of [-1.0, 1.0]) {
      B.box(x + dx * Math.cos(rotY), 0, z - dx * Math.sin(rotY) + dz, 0.8, 0.62, 0.32, '#17181a', { rotY, tile: 1 });
    }
  }
}

/* ----------------------------------------------------------------- props */

function woodFence(B, x0, z0, x1, z1, h = 1.85, gaps = []) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rotY = Math.atan2(dx, dz) - Math.PI / 2;
  const n = Math.max(1, Math.round(len / 2));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const mid = (t0 + t1) / 2;
    if (gaps.some(([a, b]) => mid > a && mid < b)) continue;
    const cx = x0 + dx * mid, cz = z0 + dz * mid;
    B.box(cx, 0, cz, len / n, h, 0.1, 'plank', { rotY, tile: 1.6 });
    B.deco(cx, h - 0.12, cz, len / n, 0.14, 0.18, 'wood', { rotY, tile: 1.6 });
  }
  // posts
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    B.box(x0 + dx * t, 0, z0 + dz * t, 0.16, h + 0.14, 0.16, 'wood', { rotY, tile: 1 });
  }
}

function chainFence(B, x0, z0, x1, z1, h = 2.5) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const rotY = Math.atan2(dx, dz) - Math.PI / 2;
  B.box((x0 + x1) / 2, 0, (z0 + z1) / 2, len, h, 0.06, 'chain', { rotY, tile: 1.1, colMat: 'metal' });
  B.deco((x0 + x1) / 2, h, (z0 + z1) / 2, len, 0.08, 0.1, 'metal', { rotY, tile: 2 });
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    B.box(x0 + dx * t, 0, z0 + dz * t, 0.1, h + 0.18, 0.1, 'metal', { rotY, tile: 1 });
  }
}

function shed(B, x, z, rotY) {
  B.box(x, 0, z, 3.0, 2.3, 2.5, 'plank', { rotY, tile: 1.6 });
  B.box(x, 2.3, z, 3.3, 0.22, 2.8, 'shingle', { rotY, tile: 1.2 });
  B.deco(x, 0.06, z + 1.28 * Math.cos(rotY), 1.0, 1.95, 0.1, 'door', { rotY, fit: true });
}

function swingSet(B, x, z, rotY = 0) {
  const o = { rotY, tile: 1 };
  for (const dx of [-1.6, 1.6]) {
    B.box(x + dx, 0, z - 0.7, 0.12, 2.3, 0.12, 'metal', o);
    B.box(x + dx, 0, z + 0.7, 0.12, 2.3, 0.12, 'metal', o);
  }
  B.box(x, 2.3, z, 3.5, 0.13, 0.13, 'metal', o);
  for (const dx of [-0.8, 0.8]) {
    B.deco(x + dx - 0.2, 1.0, z, 0.05, 1.3, 0.05, '#4a4a4a', o);
    B.deco(x + dx + 0.2, 1.0, z, 0.05, 1.3, 0.05, '#4a4a4a', o);
    B.deco(x + dx, 0.95, z, 0.5, 0.07, 0.24, '#c04a2a', o);
  }
}

function picnicTable(B, x, z, rotY) {
  const o = { rotY, tile: 1 };
  B.box(x, 0.68, z, 2.1, 0.09, 0.9, 'plank', o);
  B.box(x, 0, z - 0.9, 1.9, 0.44, 0.06, 'plank', o);
  B.box(x, 0, z + 0.9, 1.9, 0.44, 0.06, 'plank', o);
  B.box(x, 0.42, z - 0.85, 1.9, 0.07, 0.34, 'plank', o);
  B.box(x, 0.42, z + 0.85, 1.9, 0.07, 0.34, 'plank', o);
  for (const dx of [-0.9, 0.9]) B.box(x + dx, 0, z, 0.1, 0.68, 0.8, 'wood', o);
}

function sandbags(B, x, z, rotY, rows = 3) {
  for (let r = 0; r < rows; r++) {
    const w = 2.4 - r * 0.3;
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * (w / 4);
      B.box(x + off * Math.cos(rotY), r * 0.34, z - off * Math.sin(rotY),
        w / 4 - 0.03, 0.34, 0.6, r % 2 ? '#8d8259' : '#7e7350', { rotY, tile: 0.8 });
    }
  }
}

function barrier(B, x, z, rotY) {
  B.box(x, 0, z, 2.6, 0.4, 0.7, 'concreteDark', { rotY, tile: 1.4 });
  B.box(x, 0.4, z, 2.4, 0.55, 0.38, 'concreteDark', { rotY, tile: 1.4 });
}

function tires(B, x, z) {
  for (let i = 0; i < 4; i++) B.box(x + (Math.random() - 0.5) * 0.2, i * 0.27, z, 0.95, 0.27, 0.95, '#1d1e20', { tile: 1, rotY: Math.random() });
}

function trashcan(B, x, z, tipped = false) {
  if (tipped) B.box(x, 0, z, 1.05, 0.62, 0.62, 'metal', { rotY: Math.random() * 3, tile: 1 });
  else {
    B.box(x, 0, z, 0.66, 0.95, 0.66, 'metal', { tile: 1 });
    B.deco(x, 0.95, z, 0.74, 0.08, 0.74, 'metal', { tile: 1 });
  }
}

function dumpster(B, x, z, rotY) {
  B.box(x, 0.16, z, 2.4, 1.25, 1.5, '#2f5c46', { rotY, tile: 1.6 });
  B.deco(x, 1.41, z, 2.5, 0.1, 1.6, '#274d3b', { rotY, tile: 1.6 });
  for (const dx of [-0.9, 0.9]) for (const dz of [-0.6, 0.6]) {
    B.box(x + dx, 0, z + dz, 0.26, 0.2, 0.26, '#17181a', { rotY, tile: 1 });
  }
}

function powerPole(B, x, z) {
  B.box(x, 0, z, 0.3, 8.6, 0.3, 'wood', { tile: 2 });
  B.deco(x, 7.6, z, 0.2, 0.16, 2.6, 'wood', { tile: 1 });
  B.deco(x, 6.9, z, 0.16, 0.14, 1.9, 'wood', { tile: 1 });
}

function deadTree(B, x, z) {
  B.box(x, 0, z, 0.42, 3.4, 0.42, '#5a4b3a', { tile: 1.5 });
  B.deco(x + 0.7, 2.4, z, 1.5, 0.22, 0.22, '#5a4b3a', { rotY: 0.4, tile: 1 });
  B.deco(x - 0.6, 2.9, z + 0.3, 1.3, 0.2, 0.2, '#5a4b3a', { rotY: -0.7, tile: 1 });
  B.deco(x, 3.4, z - 0.2, 0.3, 1.1, 0.3, '#5a4b3a', { rotY: 0.3, tile: 1 });
}

/* ------------------------------------------------------------ big picture */

function countdownClock(B) {
  // Dynamic canvas: the match timer is painted onto the test-site clock.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: texture });

  const g = new THREE.Group();
  g.position.set(-38, 0, 14);
  g.rotation.y = Math.PI * 0.32;
  const face = new THREE.Mesh(new THREE.BoxGeometry(5.2, 5.2, 0.4), mat);
  face.position.y = 9;
  face.castShadow = true;
  g.add(face);
  const legMat = B.material('metal');
  for (const dx of [-2, 2]) {
    for (const dz of [-1.2, 1.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 13, 0.26), legMat);
      leg.position.set(dx, 6.5, dz);
      g.add(leg);
    }
  }
  for (let i = 1; i < 5; i++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 0.16), legMat);
    brace.position.set(0, i * 2.6, -1.2);
    g.add(brace);
    const brace2 = brace.clone();
    brace2.position.z = 1.2;
    g.add(brace2);
  }
  B.add(g);
  return { canvas, ctx, texture };
}

function billboard(B) {
  // WELCOME TO NUKETOWN, just past the east fence, facing the street.
  const g = new THREE.Group();
  g.position.set(37, 0, -2);
  g.rotation.y = -Math.PI / 2 - 0.12;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 0.3), B.material('sign'));
  panel.position.y = 7.2;
  panel.castShadow = true;
  g.add(panel);
  const frame = B.material('wood');
  for (const dx of [-3.6, 3.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9.5, 0.5), frame);
    post.position.set(dx, 4.75, 0);
    post.castShadow = true;
    g.add(post);
  }
  B.add(g);
}

function testTower(B) {
  // The shot tower on the horizon — where the device sits.
  const g = new THREE.Group();
  g.position.set(96, 0, -122);
  const mat = B.material('metal');
  for (let i = 0; i < 9; i++) {
    const w = 7 - i * 0.6;
    const ring = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, w), mat);
    ring.position.y = i * 5 + 2;
    g.add(ring);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.4, 0.5), mat);
      leg.position.set(sx * w * 0.45, i * 5 + 4.5, sz * w * 0.45);
      g.add(leg);
    }
  }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 3.4), B.material('#9aa0a6'));
  cab.position.y = 48;
  g.add(cab);
  B.add(g);
}

function hills(B) {
  const mat = B.material('dirt');
  const g = new THREE.Group();
  const spots = [
    [-70, -80, 34, 13], [10, -110, 52, 20], [95, -60, 40, 16], [-120, 20, 46, 18],
    [-60, 95, 38, 14], [40, 110, 56, 22], [120, 70, 44, 17], [-130, -70, 50, 19],
  ];
  for (const [x, z, r, h] of spots) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
    m.position.set(x, h / 2 - 1, z);
    m.rotation.y = Math.random() * 3;
    g.add(m);
  }
  B.add(g);
}

/* ============================== main build ============================== */

export function buildNuketown(tex) {
  const B = new Builder(tex);

  /* ---- ground ---- */
  B.deco(0, -2, 0, 420, 2.04, 420, 'dirt', { tile: 12, shadow: false });              // desert floor
  B.clip(0, -2, 0, 170, 2.04, 170, 'dirt', 'ground');                                 // walkable slab
  B.deco(0, 0, 0, 78, 0.04, 56, 'grass', { tile: 5, shadow: false });                 // town lawns
  B.deco(0, 0.04, 0, 64, 0.03, 8.4, 'asphalt', { tile: 5, shadow: false });           // road
  B.deco(0, 0.07, 0, 64, 0.02, 0.9, 'road', { tile: 6, shadow: false });              // centre line
  B.box(0, 0, -4.9, 64, 0.17, 1.0, 'concrete', { tile: 3, shadow: false });           // kerbs
  B.box(0, 0, 4.9, 64, 0.17, 1.0, 'concrete', { tile: 3, shadow: false });
  B.deco(0, 0.05, -5.95, 64, 0.03, 1.2, 'concrete', { tile: 3, shadow: false });      // pavements
  B.deco(0, 0.05, 5.95, 64, 0.03, 1.2, 'concrete', { tile: 3, shadow: false });

  /* ---- the two houses (180° rotational symmetry, like the real map) ---- */
  house(B, -9, -17, 1, { siding: 'sidingYellow' });   // yellow house, north side
  house(B, 9, 17, -1, { siding: 'sidingGreen' });     // green house, south side

  /* ---- backyards ---- */
  woodFence(B, -21, -22.4, -1.5, -22.4, 1.85, [[0.42, 0.55]]);   // north yard, rear
  woodFence(B, -21, -22.4, -21, -16.5);
  woodFence(B, -1.5, -22.4, -1.5, -17.2);
  woodFence(B, 21, 22.4, 1.5, 22.4, 1.85, [[0.42, 0.55]]);       // south yard, rear
  woodFence(B, 21, 22.4, 21, 16.5);
  woodFence(B, 1.5, 22.4, 1.5, 17.2);

  shed(B, -18.5, -20.3, 0.1);
  swingSet(B, -12.5, -20.0, 0.25);
  picnicTable(B, -5.0, -20.2, 0.5);
  mannequin(B, -5.0, -21.2, 0.2, 0.42, 2);
  mannequin(B, -5.2, -19.2, 3.4, 0.42, 2);
  trashcan(B, -20.2, -17.6);
  trashcan(B, -19.4, -17.6, true);
  B.box(-15.5, 0, -18.6, 1.3, 0.9, 1.0, '#6f4a2c', { tile: 1, rotY: 0.2 });  // crates
  B.box(-15.6, 0.9, -18.5, 1.0, 0.7, 0.8, '#6f4a2c', { tile: 1, rotY: -0.3 });

  shed(B, 18.5, 20.3, Math.PI + 0.1);
  picnicTable(B, 5.0, 20.2, -0.5);
  mannequin(B, 5.0, 21.2, 3.3, 0.42, 2);
  // empty above-ground pool
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    B.box(12.5 + Math.cos(a) * 2.5, 0, 20.0 + Math.sin(a) * 2.5, 1.1, 1.1, 0.16, 'metal', { rotY: -a, tile: 1 });
  }
  B.deco(12.5, 0.06, 20.0, 4.9, 0.04, 4.9, '#5f8ea0', { tile: 2 });
  sandbags(B, 16.6, 17.8, 0.2, 2);
  trashcan(B, 20.2, 17.6);
  B.box(2.6, 0, 19.0, 1.2, 0.85, 1.0, '#6f4a2c', { tile: 1, rotY: -0.25 });

  /* ---- west lot: bus spawn ---- */
  schoolBus(B, -25.2, -1.3, 0.09);
  sandbags(B, -20.0, 7.4, 0.5, 3);
  sandbags(B, -27.5, 10.5, -0.3, 2);
  barrier(B, -17.0, -8.0, 0.0);
  tires(B, -22.0, 11.8);
  B.box(-28.5, 0, 3.4, 2.0, 1.1, 5.6, 'brick', { tile: 1.5 });        // low brick wall
  B.box(-29.6, 0, 16.0, 6.0, 1.15, 0.5, 'brick', { tile: 1.5 });
  deadTree(B, -26.5, 18.5);
  deadTree(B, -15.0, 19.6);
  mannequin(B, -21.5, 3.6, 1.2, 0, 1);
  mannequin(B, -20.6, 4.6, 2.4, 0, 0);
  mannequin(B, -26.0, -6.0, 0.6, 0, 2);
  mannequin(B, -13.0, -6.6, 2.9, 0, 1);
  B.deco(-24.0, 0.05, 12.0, 12, 0.03, 10, 'dirt', { tile: 3, shadow: false });

  /* ---- east lot: pickup spawn ---- */
  pickup(B, 24.5, 1.2, Math.PI - 0.08);
  sandbags(B, 20.0, -7.4, -0.5 + Math.PI, 3);
  sandbags(B, 27.5, -10.5, 0.3, 2);
  barrier(B, 17.0, 8.0, 0.0);
  tires(B, 22.0, -11.8);
  B.box(28.5, 0, -3.4, 2.0, 1.1, 5.6, 'brick', { tile: 1.5 });
  B.box(29.6, 0, -16.0, 6.0, 1.15, 0.5, 'brick', { tile: 1.5 });
  deadTree(B, 26.5, -18.5);
  deadTree(B, 15.0, -19.6);
  mannequin(B, 21.5, -3.6, 4.3, 0, 1);
  mannequin(B, 20.6, -4.6, 5.5, 0, 0);
  mannequin(B, 26.0, 6.0, 3.7, 0, 2);
  mannequin(B, 13.0, 6.6, 6.0, 0, 1);
  B.deco(24.0, 0.05, -12.0, 12, 0.03, 10, 'dirt', { tile: 3, shadow: false });

  /* ---- corner clutter: fills the side lots and gives them cover ---- */
  const cornerClutter = (f) => {
    sandbags(B, f * -29.5, f * -11.5, f > 0 ? 0.25 : Math.PI + 0.25, 3);
    tires(B, f * -28.0, f * -16.8);
    B.box(f * -23.8, 0, f * -13.6, 1.4, 1.0, 1.2, '#6f4a2c', { tile: 1, rotY: f * 0.3 });
    B.box(f * -23.9, 1.0, f * -13.4, 1.1, 0.8, 0.9, '#6f4a2c', { tile: 1, rotY: f * -0.2 });
    B.box(f * -25.4, 0, f * -13.9, 1.0, 0.7, 0.9, '#7b4a2e', { tile: 1, rotY: f * 0.9 });
    trashcan(B, f * -22.4, f * -18.6);
    trashcan(B, f * -23.3, f * -18.2, true);
    deadTree(B, f * -30.2, f * -20.6);
    for (let i = 0; i < 3; i++) {                        // woodpile
      B.box(f * -18.6, i * 0.28, f * -19.4 - i * 0.05, 2.6, 0.28, 0.9, 'wood', { tile: 1, rotY: f * 0.08 });
    }
    barrier(B, f * -19.5, f * 16.8, f > 0 ? 1.55 : 1.55 + Math.PI);
    B.box(f * -27.6, 0, f * 19.6, 2.2, 1.2, 1.6, 'brick', { tile: 1.4 });
    mannequin(B, f * -24.6, f * -18.9, f > 0 ? 2.2 : 2.2 + Math.PI, 0, 1);
    mannequin(B, f * -19.6, f * 17.6, f > 0 ? 0.8 : 0.8 + Math.PI, 0, 0);
  };
  cornerClutter(1);
  cornerClutter(-1);

  /* ---- street furniture ---- */
  sedan(B, -1.5, 1.5, 0.05, '#93332a');
  sedan(B, 6.0, -2.0, Math.PI - 0.04, '#6e7b86');
  dumpster(B, -8.0, 5.4, 0.1);
  dumpster(B, 8.0, -5.4, Math.PI + 0.1);
  barrier(B, 2.0, -3.4, 0.08);
  barrier(B, -2.0, 3.4, Math.PI + 0.08);
  sandbags(B, -11.5, -3.6, 0.0, 3);
  sandbags(B, 11.5, 3.6, Math.PI, 3);
  trashcan(B, 14.0, -5.0);
  trashcan(B, -14.0, 5.0);
  trashcan(B, -14.9, 5.2, true);
  mannequin(B, 0.6, -1.2, 1.6, 0, 0);
  mannequin(B, -3.4, -4.9, 4.2, 0.14, 1);
  mannequin(B, 3.4, 4.9, 1.1, 0.14, 1);
  mannequin(B, 17.4, 4.4, 3.0, 0, 2);
  mannequin(B, -17.4, -4.4, 0.0, 0, 2);
  for (const px of [-19, 4, 27]) powerPole(B, px, -6.4);
  for (const px of [-27, -4, 19]) powerPole(B, px, 6.4);

  /* ---- fallout shelter sign at the mouth of each garage ---- */
  B.box(1.2, 0, -6.2, 0.1, 2.2, 0.1, 'metal', { tile: 1 });
  B.deco(1.2, 1.5, -6.2, 0.75, 0.75, 0.06, 'fallout', { fit: true });
  B.box(-1.2, 0, 6.2, 0.1, 2.2, 0.1, 'metal', { tile: 1 });
  B.deco(-1.2, 1.5, 6.2, 0.75, 0.75, 0.06, 'fallout', { fit: true });

  /* ---- perimeter: chain-link box around the playable area ---- */
  chainFence(B, -32, -24, 32, -24);
  chainFence(B, -32, 24, 32, 24);
  chainFence(B, -32, -24, -32, 24);
  chainFence(B, 32, -24, 32, 24);

  /* ---- landmarks ---- */
  billboard(B);
  testTower(B);
  hills(B);
  const clock = countdownClock(B);

  const group = B.finish();

  /* ---- spawns (facing down the street) ---- */
  const spawnsA = [
    [-29.5, 5.6], [-26.5, 8.6], [-29.5, -6.6], [-26.5, -9.6],
    [-21.5, 13.2], [-21.5, -13.2], [-30.5, 15.5], [-30.5, -15.5], [-18.5, 10.5],
  ];
  const spawns = {
    A: spawnsA.map(([x, z]) => ({ x, z, yaw: -Math.PI / 2 })),
    B: spawnsA.map(([x, z]) => ({ x: -x, z: -z, yaw: Math.PI / 2 })),
  };
  // Never let a spawn end up inside geometry: probe, then spiral outwards.
  const place = (sp) => {
    for (const [dx, dz] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2],
      [2.4, 1.2], [-2.4, -1.2], [2.4, -1.2], [-2.4, 1.2], [0, 3.2], [0, -3.2], [3.6, 0], [-3.6, 0]]) {
      const x = sp.x + dx, z = sp.z + dz;
      const cand = B.collider.query(x - 1.2, z - 1.2, x + 1.2, z + 1.2);
      const hit = B.collider.raycast(x, 3.2, z, 0, -1, 0, 8);
      const y = hit ? 3.2 - hit.dist : 0.05;
      if (y > 1.2 || y < -0.5) continue;
      if (!B.collider.free(x, y + 0.06, z, 0.4, 1.85, cand)) continue;
      sp.x = x; sp.z = z; sp.y = y + 0.02;
      return true;
    }
    sp.y = 0.05;
    console.warn('[nuketown] spawn point is obstructed', sp);
    return false;
  };
  for (const t of ['A', 'B']) for (const sp of spawns[t]) place(sp);

  /* ---- hand-placed nav hints: staircases and doorways ---- */
  const hints = [];
  let houseId = 0;
  const houseHints = (cx, cz, s) => {
    const chain = `stairs${houseId++}`;
    let order = 0;
    const L = (lx, lz, y, inChain = false) => hints.push({
      x: cx + s * lx, z: cz + s * lz, y,
      ...(inChain ? { chain, order: order++ } : {}),
    });
    L(-3.5, 1.3, FLOOR + 0.02, true);                    // floor beside the stairs
    for (let i = 0; i < STAIR.steps; i += 2) {           // every other step
      L(STAIR.x, STAIR.z0 + i * STAIR.run + STAIR.run / 2, FLOOR + STAIR_RISE * (i + 1), true);
    }
    L(STAIR.x, 5.95, F2 + 0.02, true);                   // top landing
    L(-4.9, 6.9, F2 + 0.02); L(-2.3, 6.3, F2 + 0.02);
    L(-2.3, 3.0, F2 + 0.02); L(2.6, 2.4, F2 + 0.02);
    L(3.0, 6.6, F2 + 0.02); L(-2.3, 8.0, F2 + 0.02);
    L(-2.97, 9.6, FLOOR + 0.02); L(-2.97, 8.2, FLOOR + 0.02);   // front door
    L(2.2, 0.9, FLOOR + 0.02); L(2.2, -0.9, 0.02);              // back door
    L(3.0, 3.4, FLOOR + 0.02); L(6.9, 3.4, FLOOR + 0.02);       // garage door
    L(8.8, 6.0, FLOOR + 0.02); L(8.8, 9.6, 0.02);               // garage mouth
    L(-1.0, 10.0, FLOOR + 0.02);                                 // porch
    L(-2.9, 12.6, 0.02);
  };
  houseHints(-9, -17, 1);
  houseHints(9, 17, -1);

  return {
    group,
    collider: B.collider,
    spawns,
    hints,
    clock,
    bounds: { minX: -31.4, maxX: 31.4, minZ: -23.4, maxZ: 23.4 },
    name: 'NUKETOWN',
  };
}
