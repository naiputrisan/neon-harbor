// city.js — builds Port Solano into the three.js scene: ground, beach and
// water, the road grid with sidewalks, city blocks of sun-bleached buildings,
// palms and streetlights, plus the landmarks the missions use. Static
// geometry is merged into a handful of big meshes (one per material) so the
// scene stays at a few hundred draw calls. Also owns the shared world
// queries every other system needs: where the roads are, and
// circle-vs-building collision.
'use strict';
window.NH = window.NH || {};

// Road centre coordinates on both axes (metres, world origin at city centre).
NH.roadLines = function roadLines() {
  const c = NH.CONFIG;
  const lines = [];
  for (let i = 0; i < c.gridCount; i++) lines.push(-c.half + c.road / 2 + i * c.pitch);
  return lines;
};

// Named places the story uses. Positions sit on block corners beside roads so
// cars and pedestrians can always reach them.
NH.POIS = {
  autoWorks:   { name: 'Adeyemi Auto Works', x: -66, z: -96 },
  fishMarket:  { name: 'Solano Fish Market', x: -136, z: -24 },
  cafeLumen:   { name: 'Café Lumen', x: 96, z: 24 },
  pier9:       { name: 'Pier Nine', x: -136, z: -66 },
  courthouse:  { name: 'Solano Courthouse', x: 24, z: -36 },
  lighthouse:  { name: 'Harbor Lighthouse', x: -168, z: 188 },
  marinaRow:   { name: 'Marina Row', x: -114, z: 126 },
  playerStart: { name: 'Marina Row', x: -114, z: 108 },
};

NH.World = {
  colliders: [],   // {x, z, hw, hd} building footprints
  roadsX: [],      // vertical road centre x values
  roadsZ: [],      // horizontal road centre z values
  bounds: 200,

  isOnRoad(x, z) {
    const half = NH.CONFIG.road / 2 + 0.5;
    for (const rx of this.roadsX) if (Math.abs(x - rx) < half) return true;
    for (const rz of this.roadsZ) if (Math.abs(z - rz) < half) return true;
    return false;
  },

  // Push a circle (pos {x,z}, radius r) out of every building footprint and
  // keep it inside the world. Mutates pos; returns true if it hit anything.
  collideCircle(pos, r) {
    let hit = false;
    for (const b of this.colliders) {
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      const px = b.hw + r - Math.abs(dx);
      if (px <= 0) continue;
      const pz = b.hd + r - Math.abs(dz);
      if (pz <= 0) continue;
      if (px < pz) pos.x = b.x + (dx > 0 ? b.hw + r : -b.hw - r);
      else pos.z = b.z + (dz > 0 ? b.hd + r : -b.hd - r);
      hit = true;
    }
    const lim = this.bounds - r;
    if (pos.x < -lim) { pos.x = -lim; hit = true; }
    if (pos.x > lim) { pos.x = lim; hit = true; }
    if (pos.z < -lim) { pos.z = -lim; hit = true; }
    if (pos.z > 208) { pos.z = 208; hit = true; } // the sea stops everyone
    return hit;
  },

  districtAt(x, z) {
    let best = 'Port Solano', bestD = Infinity;
    for (const d of NH.DISTRICTS) {
      const dd = (d.x - x) * (d.x - x) + (d.z - z) * (d.z - z);
      if (dd < bestD) { bestD = dd; best = d.name; }
    }
    return best;
  },
};

// Merge transformed copies of simple geometries into one mesh per material.
// parts: [{ geo, x, y, z, rx, ry, rz }] — the geometry is expanded to
// non-indexed form, baked with its matrix, and concatenated.
NH.mergeParts = function mergeParts(parts, material, shadows) {
  let total = 0;
  const baked = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0));
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), q,
      new THREE.Vector3(p.sx || 1, p.sy || 1, p.sz || 1));
    g.applyMatrix4(m);
    baked.push(g);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of baked) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geo, material);
  if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; }
  return mesh;
};

// Facade textures: a few canvas-painted window grids, tinted per building.
function facadeTexture(rng, litRatio) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 12;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.chance(litRatio);
      g.fillStyle = lit ? '#ffe9a8' : '#33424e';
      g.fillRect(8 + x * 20, 10 + y * 20, 12, 13);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function asphaltTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#33373c';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = '#e8c85a';
  g.fillRect(61, 6, 6, 40);
  g.fillRect(61, 82, 6, 40);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

NH.buildCity = function buildCity(scene) {
  const cfg = NH.CONFIG;
  const rng = NH.makeRng(cfg.seed);
  const W = NH.World;
  W.roadsX = NH.roadLines();
  W.roadsZ = NH.roadLines();
  W.bounds = cfg.half + 46;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x9db38a }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Beach sand along the south edge, then open water beyond it.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 52),
    new THREE.MeshLambertMaterial({ color: 0xe8d194 }));
  sand.position.set(0, 0.01, cfg.half + 42);
  sand.rotation.x = -Math.PI / 2;
  sand.receiveShadow = true;
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 320),
    new THREE.MeshPhongMaterial({ color: 0x1d6f8e, shininess: 120, specular: 0x99ddee }));
  water.position.set(0, -0.35, cfg.half + 210);
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  NH.water = water;

  // Roads and sidewalks.
  const asphalt = asphaltTexture();
  const roadLen = cfg.half * 2 + cfg.road;
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xcfc8bb });
  for (const x of W.roadsX) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(cfg.road + 5, roadLen + 10), walkMat);
    walk.position.set(x, 0.015, 0); walk.rotation.x = -Math.PI / 2;
    walk.receiveShadow = true; scene.add(walk);
    const tex = asphalt.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, roadLen / 16);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.road, roadLen),
      new THREE.MeshLambertMaterial({ map: tex }));
    road.position.set(x, 0.03, 0); road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true; scene.add(road);
  }
  for (const z of W.roadsZ) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(roadLen + 10, cfg.road + 5), walkMat);
    walk.position.set(0, 0.015, z); walk.rotation.x = -Math.PI / 2;
    walk.receiveShadow = true; scene.add(walk);
    const tex = asphalt.clone();
    tex.needsUpdate = true;
    tex.repeat.set(roadLen / 16, 1);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(roadLen, cfg.road),
      new THREE.MeshLambertMaterial({ map: tex }));
    road.rotation.order = 'YXZ';
    road.rotation.y = Math.PI / 2;
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.03, z);
    road.receiveShadow = true; scene.add(road);
  }

  // Buildings: each block gets up to 4 towers on a 2x2 lot grid, merged into
  // one mesh per (facade, colour) pair; roofs merge into a single mesh.
  const facades = [facadeTexture(rng, 0.25), facadeTexture(rng, 0.45), facadeTexture(rng, 0.12)];
  const buckets = new Map();
  const roofParts = [];
  const roofGeoUnit = new THREE.BoxGeometry(1, 0.7, 1);
  const blockCentres = [];
  for (let i = 0; i < cfg.gridCount - 1; i++) {
    blockCentres.push(-cfg.half + cfg.road + cfg.block / 2 + i * cfg.pitch);
  }
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      const downtown = 1 - Math.min(1, Math.hypot(bx, bz) / 240);
      for (const ox of [-11.5, 11.5]) {
        for (const oz of [-11.5, 11.5]) {
          if (rng.chance(0.18)) continue; // some lots stay parking / plaza
          const w = rng.range(13, 19);
          const d = rng.range(13, 19);
          const h = rng.range(11, 22) + downtown * rng.range(8, 42);
          const x = bx + ox + rng.range(-1.5, 1.5);
          const z = bz + oz + rng.range(-1.5, 1.5);
          const fi = rng.int(0, facades.length - 1);
          const color = rng.pick(NH.BUILDING_COLORS);
          const key = fi + ':' + color;
          if (!buckets.has(key)) buckets.set(key, { fi, color, parts: [] });
          buckets.get(key).parts.push({
            geo: new THREE.BoxGeometry(w, h, d), x, y: h / 2, z });
          roofParts.push({ geo: roofGeoUnit, x, y: h + 0.35, z, sx: w + 0.7, sz: d + 0.7 });
          W.colliders.push({ x, z, hw: w / 2 + 0.3, hd: d / 2 + 0.3 });
        }
      }
    }
  }
  for (const { fi, color, parts } of buckets.values()) {
    const mesh = NH.mergeParts(parts, new THREE.MeshLambertMaterial({
      color, map: facades[fi] }), true);
    scene.add(mesh);
  }
  scene.add(NH.mergeParts(roofParts,
    new THREE.MeshLambertMaterial({ color: 0x6b5a49 }), false));

  buildPalms(scene, rng);
  buildStreetlights(scene);
  buildLandmarks(scene, rng);
  return W;
};

function buildPalms(scene, rng) {
  const spots = [];
  const southRoad = NH.World.roadsZ[NH.World.roadsZ.length - 1];
  for (let x = -170; x <= 170; x += 21) {
    spots.push([x, southRoad + 11]);
    spots.push([x + 9, southRoad - 11]);
  }
  for (let i = 0; i < 16; i++) {
    spots.push([rng.range(-185, 185), rng.range(170, 196)]); // beach palms
  }
  const trunkParts = [];
  const leafPartsA = [];
  const leafPartsB = [];
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
  const leafGeo = new THREE.ConeGeometry(0.5, 3.4, 4);
  for (const [x, z] of spots) {
    if (NH.World.isOnRoad(x, z)) continue;
    const h = rng.range(5.5, 8);
    trunkParts.push({
      geo: trunkGeo, x, y: h / 2, z, sy: h, rz: rng.range(-0.05, 0.05) });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const part = {
        geo: leafGeo,
        x: x + Math.cos(a) * 1.1, y: h + 0.35, z: z + Math.sin(a) * 1.1,
        rx: Math.sin(a) * 1.15, rz: -Math.cos(a) * 1.15,
      };
      (rng.chance(0.5) ? leafPartsA : leafPartsB).push(part);
    }
  }
  scene.add(NH.mergeParts(trunkParts,
    new THREE.MeshLambertMaterial({ color: 0x8a6a44 }), false));
  scene.add(NH.mergeParts(leafPartsA,
    new THREE.MeshLambertMaterial({ color: 0x3f9e4d, side: THREE.DoubleSide }), false));
  scene.add(NH.mergeParts(leafPartsB,
    new THREE.MeshLambertMaterial({ color: 0x55b567, side: THREE.DoubleSide }), false));
}

function buildStreetlights(scene) {
  const poleParts = [];
  const headParts = [];
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 5);
  const headGeo = new THREE.BoxGeometry(0.7, 0.18, 0.34);
  for (const x of NH.World.roadsX) {
    let flip = false;
    for (let z = -NH.CONFIG.half; z <= NH.CONFIG.half; z += 44) {
      flip = !flip;
      const side = flip ? 1 : -1;
      const lx = x + side * (NH.CONFIG.road / 2 + 1.2);
      poleParts.push({ geo: poleGeo, x: lx, y: 3.2, z });
      headParts.push({ geo: headGeo, x: lx - side * 0.8, y: 6.4, z });
    }
  }
  scene.add(NH.mergeParts(poleParts,
    new THREE.MeshLambertMaterial({ color: 0x3c4148 }), false));
  scene.add(NH.mergeParts(headParts,
    new THREE.MeshBasicMaterial({ color: 0xffe6a3 }), false));
}

function buildLandmarks(scene, rng) {
  // The harbour lighthouse on the south-west beach point.
  const lh = new THREE.Group();
  const towerMat = new THREE.MeshLambertMaterial({ color: 0xf3ede0 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2 - i * 0.3, 2.5 - i * 0.3, 5, 10),
      i % 2 ? bandMat : towerMat);
    seg.position.y = 2.5 + i * 5;
    seg.castShadow = true;
    lh.add(seg);
  }
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 8),
    new THREE.MeshBasicMaterial({ color: 0xffedb5 }));
  lampRoom.position.y = 16.2;
  lh.add(lampRoom);
  lh.position.set(NH.POIS.lighthouse.x, 0, NH.POIS.lighthouse.z);
  scene.add(lh);
  NH.World.colliders.push({ x: NH.POIS.lighthouse.x, z: NH.POIS.lighthouse.z, hw: 3, hd: 3 });

  // Marina boats: hulls with masts, bobbing on the water south of the beach.
  const mastMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x2e6fc2 });
  for (let i = 0; i < 9; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 6), hullMat);
    hull.position.y = 0.4;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 5), mastMat);
    mast.position.y = 4.4;
    boat.add(mast);
    boat.position.set(-140 + i * 34 + rng.range(-4, 4), 0, NH.CONFIG.half + 74);
    boat.rotation.y = rng.range(-0.3, 0.3);
    scene.add(boat);
  }
}
