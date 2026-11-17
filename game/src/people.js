// people.js — low-poly humanoids and the pedestrian crowd. One mesh builder
// serves the player, the crowds on the sidewalks and the story's thugs; the
// crowd system walks them along the pavements, makes them flee danger, and
// knocks them down when a fast car gets too close (which the wanted system
// hears about through NH.onCrime).
'use strict';
window.NH = window.NH || {};

// A ~1.8 m person: legs and arms pivot at the hip/shoulder so walk cycles are
// just sine swings. Colours come from the palettes in config.js.
NH.makePersonMesh = function makePersonMesh(opts) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants });
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.28), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  g.add(head);
  if (opts.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.44),
      new THREE.MeshLambertMaterial({ color: opts.cap }));
    cap.position.set(0, 1.86, 0.04);
    g.add(cap);
  }

  function limb(mat, w, len, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.y = -len / 2;
    m.castShadow = true;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  }
  const legL = limb(pants, 0.17, 0.78, -0.13, 0.8, 0);
  const legR = limb(pants, 0.17, 0.78, 0.13, 0.8, 0);
  const armL = limb(shirt, 0.13, 0.66, -0.34, 1.42, 0);
  const armR = limb(shirt, 0.13, 0.66, 0.34, 1.42, 0);
  g.userData.parts = { legL, legR, armL, armR, torso, head };
  return g;
};

NH.Person = class Person {
  constructor(scene, opts, x, z, heading) {
    this.mesh = NH.makePersonMesh(opts);
    this.mesh.position.set(x, 0, z);
    this.heading = heading || 0;
    this.phase = Math.random() * Math.PI * 2;
    this.down = false;
    scene.add(this.mesh);
  }
  get pos() { return this.mesh.position; }

  animate(dt, speed) {
    if (this.down) return;
    this.phase += dt * (4 + speed * 1.6);
    const swing = Math.min(0.65, speed * 0.22) * Math.sin(this.phase);
    const p = this.mesh.userData.parts;
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.8;
    p.armR.rotation.x = swing * 0.8;
    this.mesh.position.y = Math.abs(Math.sin(this.phase)) * 0.045;
    this.mesh.rotation.y = this.heading;
  }

  fall() {
    if (this.down) return;
    this.down = true;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.25;
  }

  stand() {
    this.down = false;
    this.mesh.rotation.x = 0;
    this.mesh.position.y = 0;
  }
};

NH.Pedestrians = class Pedestrians {
  constructor(scene, rng) {
    this.list = [];
    const cfg = NH.CONFIG;
    for (let i = 0; i < cfg.pedCount; i++) {
      const vertical = rng.chance(0.5);
      const line = rng.pick(vertical ? NH.World.roadsX : NH.World.roadsZ);
      const side = rng.chance(0.5) ? 1 : -1;
      const off = side * (cfg.road / 2 + 2.3);
      const along = rng.range(-cfg.half + 6, cfg.half - 6);
      const x = vertical ? line + off : along;
      const z = vertical ? along : line + off;
      const person = new NH.Person(scene, {
        shirt: rng.pick(NH.PED_SHIRTS),
        pants: rng.pick(NH.PED_PANTS),
        skin: rng.pick(NH.SKIN_TONES),
        cap: rng.chance(0.3) ? rng.pick(NH.PED_SHIRTS) : null,
      }, x, z, rng.range(0, Math.PI * 2));
      person.home = { vertical, line, side };
      person.dir = rng.chance(0.5) ? 1 : -1;
      person.fleeUntil = 0;
      person.fleeFrom = null;
      person.getUpAt = 0;
      this.list.push(person);
    }
  }

  scare(x, z, radius) {
    const now = performance.now() / 1000;
    for (const p of this.list) {
      if (p.down) continue;
      if (Math.hypot(p.pos.x - x, p.pos.z - z) < radius) {
        p.fleeUntil = now + 5;
        p.fleeFrom = { x, z };
      }
    }
  }

  update(dt, vehicles, now) {
    const cfg = NH.CONFIG;
    for (const p of this.list) {
      if (p.down) {
        if (p.getUpAt && now > p.getUpAt) { p.stand(); p.getUpAt = 0; }
        else continue;
      }
      let speed = cfg.pedSpeed;
      let tx, tz;
      if (p.fleeFrom && now < p.fleeUntil) {
        speed = 5.2;
        const dx = p.pos.x - p.fleeFrom.x;
        const dz = p.pos.z - p.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = p.pos.x + (dx / d) * 10;
        tz = p.pos.z + (dz / d) * 10;
      } else {
        // Walk the sidewalk: target a point far along the home road's edge.
        const h = p.home;
        const along = h.vertical ? p.pos.z : p.pos.x;
        let target = along + p.dir * 24;
        if (target > cfg.half - 4 || target < -cfg.half + 4) {
          p.dir *= -1;
          target = along + p.dir * 24;
        }
        tx = h.vertical ? h.line + h.side * (cfg.road / 2 + 2.3) : target;
        tz = h.vertical ? target : h.line + h.side * (cfg.road / 2 + 2.3);
        // Occasionally cross to another street at an intersection.
        if (NH.jitter.chance(0.0015)) {
          p.home = {
            vertical: !h.vertical,
            line: h.vertical ? NH.World.roadsZ.reduce((a, b) =>
              Math.abs(b - p.pos.z) < Math.abs(a - p.pos.z) ? b : a)
              : NH.World.roadsX.reduce((a, b) =>
                Math.abs(b - p.pos.x) < Math.abs(a - p.pos.x) ? b : a),
            side: NH.jitter.chance(0.5) ? 1 : -1,
          };
        }
      }
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.2) {
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - p.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        p.pos.x += Math.sin(p.heading) * speed * dt;
        p.pos.z += Math.cos(p.heading) * speed * dt;
        NH.World.collideCircle(p.pos, 0.4);
      }
      p.animate(dt, speed);

      // Cars: a fast car close by knocks a pedestrian down — a crime.
      for (const v of vehicles) {
        if (v.dead || Math.abs(v.speed) < 4) continue;
        const ddx = p.pos.x - v.pos.x;
        const ddz = p.pos.z - v.pos.z;
        if (ddx * ddx + ddz * ddz < 2.6) {
          p.fall();
          p.getUpAt = now + 9;
          v.speed *= 0.55;
          if (NH.onCrime) NH.onCrime('pedHit', v);
          break;
        }
      }
    }
  }
};
