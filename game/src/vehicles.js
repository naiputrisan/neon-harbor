// vehicles.js — the car factory (five body kinds, police livery with a working
// light bar), an arcade Vehicle model shared by the player, traffic and the
// police, and the traffic system that keeps Port Solano's roads alive.
'use strict';
window.NH = window.NH || {};

const KIND_STATS = {
  sedan:  { len: 4.3, wid: 1.85, maxSpeed: 34, accel: 13, grip: 3.4 },
  sports: { len: 4.4, wid: 1.9,  maxSpeed: 47, accel: 21, grip: 3.9 },
  taxi:   { len: 4.3, wid: 1.85, maxSpeed: 32, accel: 12, grip: 3.4 },
  truck:  { len: 5.6, wid: 2.1,  maxSpeed: 26, accel: 9,  grip: 2.8 },
  police: { len: 4.4, wid: 1.9,  maxSpeed: 44, accel: 19, grip: 3.8 },
};

function smokeTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(70,70,70,0.55)');
  grad.addColorStop(1, 'rgba(70,70,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}
let _smokeTex = null;

NH.makeCarMesh = function makeCarMesh(kind, color) {
  const st = KIND_STATS[kind] || KIND_STATS.sedan;
  const car = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0x666666 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1c2a33, shininess: 120 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x17191c });
  const L = st.len, Wd = st.wid;

  const bodyH = kind === 'sports' ? 0.5 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(Wd, bodyH, L), paint);
  body.position.y = 0.42 + bodyH / 2;
  body.castShadow = true;
  car.add(body);

  if (kind === 'truck') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.95, 1.3), paint);
    cab.position.set(0, 1.35, L / 2 - 0.85);
    cab.castShadow = true;
    car.add(cab);
    const box = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.15, 1.7, L - 1.7),
      new THREE.MeshLambertMaterial({ color: 0xe8e4da }));
    box.position.set(0, 1.45, -0.75);
    box.castShadow = true;
    car.add(box);
  } else {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(Wd - 0.3, kind === 'sports' ? 0.42 : 0.52, L * 0.46), glass);
    cabin.position.set(0, 0.42 + bodyH + 0.24, -L * 0.04);
    cabin.castShadow = true;
    car.add(cabin);
  }

  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.1, 0.08, 0.4), trim);
    spoiler.position.set(0, 1.12, -L / 2 + 0.25);
    car.add(spoiler);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    sign.position.set(0, 1.42, 0);
    car.add(sign);
  }
  if (kind === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.02, 0.3, L * 0.5),
      new THREE.MeshLambertMaterial({ color: 0x14202e }));
    stripe.position.set(0, 0.78, 0);
    car.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2a22 }));
    red.position.x = -0.32;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.x = 0.32;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.5, -0.1);
    car.add(bar);
    car.userData.lightBar = { red, blue };
  }

  // Lights: warm headlights, red tails — each pair merged into one mesh.
  const lightGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);
  car.add(NH.mergeParts([-1, 1].map((sx) => ({
    geo: lightGeo, x: sx * (Wd / 2 - 0.3), y: 0.78, z: L / 2 + 0.01 })),
    new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), false));
  car.add(NH.mergeParts([-1, 1].map((sx) => ({
    geo: lightGeo, x: sx * (Wd / 2 - 0.3), y: 0.8, z: -L / 2 - 0.01 })),
    new THREE.MeshBasicMaterial({ color: 0xd21f14 }), false));

  // Wheels: one merged mesh of four cylinders (they do not spin individually;
  // at city scale the rolling read comes from motion, not spoke rotation).
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 10);
  car.add(NH.mergeParts(
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([wx, wz]) => ({
      geo: wheelGeo, x: wx * (Wd / 2 - 0.05), y: 0.35, z: wz * (L / 2 - 0.85),
      rz: Math.PI / 2 })),
    new THREE.MeshLambertMaterial({ color: 0x121316 }), false));

  // Damage smoke puff, shown when the car is badly hurt.
  if (!_smokeTex) _smokeTex = smokeTexture();
  const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
    map: _smokeTex, transparent: true, opacity: 0 }));
  smoke.scale.set(2.2, 1.6, 1);
  smoke.position.set(0, 1.5, L / 4);
  car.add(smoke);
  car.userData.smoke = smoke;
  return car;
};

NH.Vehicle = class Vehicle {
  constructor(scene, kind, color, x, z, heading) {
    this.kind = kind;
    this.stats = KIND_STATS[kind] || KIND_STATS.sedan;
    this.mesh = NH.makeCarMesh(kind, color);
    this.mesh.position.set(x, 0, z);
    this.heading = heading || 0;
    this.speed = 0;
    this.health = 100;
    this.parked = false;
    this.driver = null;      // 'player' | 'traffic' | 'police' | null
    this.dead = false;
    scene.add(this.mesh);
  }

  get pos() { return this.mesh.position; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  placeAt(x, z, heading) {
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
  }

  // Player-style driving: throttle -1..1, steer -1..1.
  manualDrive(dt, throttle, steer, handbrake) {
    const st = this.stats;
    const drag = handbrake ? 2.6 : 0.55;
    if (throttle > 0) this.speed += st.accel * throttle * dt;
    else if (throttle < 0) {
      this.speed += (this.speed > 0.5 ? -26 : st.accel * 0.55 * throttle) * dt;
    }
    this.speed -= this.speed * drag * dt * 0.35;
    this.speed = Math.max(-st.maxSpeed * 0.32, Math.min(st.maxSpeed, this.speed));
    if (Math.abs(this.speed) < 0.04 && throttle === 0) this.speed = 0;
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 6) *
      (handbrake ? 1.5 : 1);
    this.heading -= steer * steerAuthority * st.grip * 0.42 * dt *
      (this.speed < 0 ? -1 : 1);
    this._integrate(dt);
  }

  // AI driving: steer toward a point at a desired speed.
  steerTo(dt, tx, tz, targetSpeed, urgency) {
    const st = this.stats;
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = (urgency ? 2.4 : 1.6) * dt;
    this.heading += Math.max(-maxTurn, Math.min(maxTurn, diff * 3 * dt + Math.sign(diff) * 0.001));
    const slowForTurn = Math.max(0.35, 1 - Math.abs(diff) * 0.55);
    const want = targetSpeed * slowForTurn;
    if (this.speed < want) this.speed = Math.min(want, this.speed + st.accel * dt);
    else this.speed = Math.max(want, this.speed - 30 * dt);
    this._integrate(dt);
  }

  _integrate(dt) {
    const f = this.forward();
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    const hit = NH.World.collideCircle(this.pos, 1.7);
    if (hit && Math.abs(this.speed) > 6) {
      this.damage(Math.abs(this.speed) * 0.55);
      if (NH.onCarCrash) NH.onCarCrash(this, Math.abs(this.speed));
      this.speed *= -0.25;
    } else if (hit) {
      // slide back out along the push
      this.speed *= 0.6;
    }
    this.mesh.rotation.y = this.heading;
    // Damage smoke state.
    const smoke = this.mesh.userData.smoke;
    if (smoke) {
      const target = this.health < 35 && !this.dead ? 0.5 + Math.sin(performance.now() * 0.01) * 0.15 : 0;
      smoke.material.opacity += (target - smoke.material.opacity) * 0.1;
    }
    this._lastMove = { x: this.pos.x - before.x, z: this.pos.z - before.z };
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.speed = 0;
    }
  }
};

// Car-vs-car: circles of radius ~1.9; push apart, trade a little speed, and
// report solid hits so the game can score crimes and play sounds.
NH.collideVehicles = function collideVehicles(vehicles, dt) {
  for (let i = 0; i < vehicles.length; i++) {
    const a = vehicles[i];
    if (a.dead) continue;
    for (let j = i + 1; j < vehicles.length; j++) {
      const b = vehicles[j];
      if (b.dead) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.4;
      if (d2 > min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d, nz = dz / d;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      b.pos.x += nx * push; b.pos.z += nz * push;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 5) {
        a.damage(rel * 0.35); b.damage(rel * 0.35);
        if (NH.onCarCrash) NH.onCarCrash(a.speed !== 0 ? a : b, rel);
      }
      const swap = (a.speed + b.speed) / 2;
      a.speed = swap * 0.7; b.speed = swap * 0.7;
    }
  }
};

// Traffic: cars that loop the road grid forever, turning at intersections.
NH.Traffic = class Traffic {
  constructor(scene, rng) {
    this.cars = [];
    const cfg = NH.CONFIG;
    for (let i = 0; i < cfg.trafficCount; i++) {
      const vertical = rng.chance(0.5);
      const line = rng.pick(vertical ? NH.World.roadsX : NH.World.roadsZ);
      const dir = rng.chance(0.5) ? 1 : -1;
      const along = rng.range(-cfg.half + 10, cfg.half - 10);
      const lane = 3.4;
      let x, z, heading;
      if (vertical) {
        x = line + (dir < 0 ? lane : -lane);
        z = along;
        heading = dir < 0 ? Math.PI : 0;
      } else {
        z = line + (dir > 0 ? lane : -lane);
        x = along;
        heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      const kind = rng.pick(['sedan', 'sedan', 'taxi', 'truck', 'sports']);
      const color = kind === 'taxi' ? 0xf2b234 : rng.pick(NH.CAR_COLORS);
      const car = new NH.Vehicle(scene, kind, color, x, z, heading);
      car.driver = 'traffic';
      car.cruise = rng.range(8, 12);
      car.axis = vertical ? 'z' : 'x';
      car.lineCoord = vertical ? x : z;
      this.cars.push(car);
    }
    // Parked cars along the curbs, waiting to be stolen.
    this.parked = [];
    for (let i = 0; i < cfg.parkedCount; i++) {
      const vertical = rng.chance(0.5);
      const line = rng.pick(vertical ? NH.World.roadsX : NH.World.roadsZ);
      const side = rng.chance(0.5) ? 1 : -1;
      const along = rng.range(-cfg.half + 8, cfg.half - 8);
      const off = side * (NH.CONFIG.road / 2 + 1.7);
      const x = vertical ? line + off : along;
      const z = vertical ? along : line + off;
      if (NH.World.isOnRoad(x, z) && Math.abs(off) < NH.CONFIG.road / 2) continue;
      const kind = rng.pick(['sedan', 'sedan', 'sports', 'taxi']);
      const car = new NH.Vehicle(scene, kind, rng.pick(NH.CAR_COLORS), x, z,
        vertical ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2));
      car.parked = true;
      this.parked.push(car);
    }
  }

  update(dt) {
    for (const car of this.cars) {
      if (car.dead || car.driver !== 'traffic') continue;
      // Waypoint: far ahead along the current axis; near an intersection,
      // sometimes pick a turn onto the crossing road.
      const ahead = 26;
      const f = car.forward();
      let tx = car.pos.x + f.x * ahead;
      let tz = car.pos.z + f.z * ahead;
      // Slow down when a car is close ahead.
      let speed = car.cruise;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 9 && dx * f.x + dz * f.z > 3) speed = Math.min(speed, other.speed * 0.9);
      }
      // Intersection turns: find a crossing road just ahead.
      const lines = car.axis === 'z' ? NH.World.roadsZ : NH.World.roadsX;
      const along = car.axis === 'z' ? car.pos.z : car.pos.x;
      for (const cross of lines) {
        const d = (cross - along) * Math.sign(car.axis === 'z' ? f.z : f.x);
        if (d > 2 && d < 12 && NH.jitter.chance(0.012)) {
          // aim at the crossing road's lane to turn onto it
          if (car.axis === 'z') tx = cross === car.pos.x ? tx : car.pos.x + (NH.jitter.chance(0.5) ? 30 : -30) * 0 + (cross - car.pos.x);
          // (simplified: nudge waypoint toward the crossing line)
          if (car.axis === 'z') { tx = car.pos.x; tz = cross; }
          else { tx = cross; tz = car.pos.z; }
        }
      }
      car.steerTo(dt, tx, tz, speed, false);
      // Keep traffic out of the sea / world edge by flipping waypoints.
      if (Math.abs(car.pos.x) > NH.CONFIG.half + 30 || Math.abs(car.pos.z) > NH.CONFIG.half + 30) {
        car.steerTo(dt, 0, 0, car.cruise, true);
      }
    }
  }
};
