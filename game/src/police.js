// police.js — the wanted system and Port Solano's finest. Crimes add stars;
// stars bring police cars that spawn on the roads beyond sight, pursue, and
// try to pin the player. Stay unseen and the stars drain away. Get caught on
// foot next to a patrol car for a few seconds and it is a bust.
'use strict';
window.NH = window.NH || {};

NH.CRIME_WEIGHT = {
  carTheft: 1.0,
  pedHit: 1.0,
  gunfire: 0.5,
  policeHit: 1.5,
  thugDown: 0.5,
  reckless: 0.25,
};

NH.Wanted = class Wanted {
  constructor() {
    this.stars = 0;          // float 0..5; display rounds up
    this.lastCrimeAt = -99;
    this.seen = false;       // any police unit currently has eyes on the player
  }

  get level() { return Math.min(5, Math.ceil(this.stars)); }

  addCrime(kind, now) {
    const w = NH.CRIME_WEIGHT[kind] || 0.5;
    this.stars = Math.min(5, this.stars + w);
    this.lastCrimeAt = now;
  }

  setMinimum(stars, now) {
    if (this.stars < stars) this.stars = stars;
    this.lastCrimeAt = now;
  }

  clear() { this.stars = 0; }

  update(dt, now) {
    if (this.stars <= 0) return;
    // Decay only while unseen and quiet: one star per decay period.
    if (!this.seen && now - this.lastCrimeAt > 5) {
      this.stars = Math.max(0, this.stars - dt / NH.CONFIG.wantedDecaySeconds);
    }
  }
};

NH.Police = class Police {
  constructor(scene) {
    this.scene = scene;
    this.units = [];
    this.spawnTimer = 0;
    this.bustMeter = 0;
    this._flash = 0;
    this.sirenLight = new THREE.PointLight(0xff3344, 0, 26);
    scene.add(this.sirenLight);
  }

  desiredUnits(level) {
    return level <= 0 ? 0 : Math.min(6, 1 + level);
  }

  _spawnPoint(playerPos) {
    // A road point 75–110 m from the player, so units arrive, not appear.
    for (let tries = 0; tries < 12; tries++) {
      const vertical = NH.jitter.chance(0.5);
      const line = NH.jitter.pick(vertical ? NH.World.roadsX : NH.World.roadsZ);
      const along = NH.jitter.range(-NH.CONFIG.half, NH.CONFIG.half);
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d > 70 && d < 120) return { x, z };
    }
    return { x: playerPos.x + 90, z: playerPos.z };
  }

  update(dt, now, player, wanted) {
    const level = wanted.level;
    const want = this.desiredUnits(level);
    this.spawnTimer -= dt;

    // Spawn up to the desired strength.
    if (this.units.length < want && this.spawnTimer <= 0) {
      const p = this._spawnPoint(player.pos);
      const unit = new NH.Vehicle(this.scene, 'police', 0xf2f2f2, p.x, p.z,
        Math.atan2(player.pos.x - p.x, player.pos.z - p.z));
      unit.driver = 'police';
      this.units.push(unit);
      if (NH.allVehicles) NH.allVehicles.push(unit);
      this.spawnTimer = 2.2;
    }

    // Retire units when the heat is gone or they are wrecked and far away.
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const d = Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z);
      if ((level === 0 && d > 55) || (u.dead && d > 60)) {
        this.scene.remove(u.mesh);
        this.units.splice(i, 1);
        if (NH.allVehicles) {
          const k = NH.allVehicles.indexOf(u);
          if (k >= 0) NH.allVehicles.splice(k, 1);
        }
      }
    }

    // Pursuit.
    let nearest = Infinity;
    wanted.seen = false;
    for (const u of this.units) {
      const d = Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z);
      nearest = Math.min(nearest, d);
      if (d < 65) wanted.seen = true;
      if (u.dead) continue;
      // Aim where the player will be, not where they are.
      const pv = player.state === 'car'
        ? { x: player.car.pos.x + Math.sin(player.car.heading) * player.car.speed * 0.45,
            z: player.car.pos.z + Math.cos(player.car.heading) * player.car.speed * 0.45 }
        : player.pos;
      const topSpeed = Math.min(u.stats.maxSpeed, 20 + level * 4.5);
      u.steerTo(dt, pv.x, pv.z, d > 26 ? topSpeed : topSpeed * 0.82, d < 30);
      // Flash the light bar.
      const bar = u.mesh.userData.lightBar;
      if (bar) {
        const phase = Math.floor(now * 3 + u.pos.x) % 2 === 0;
        bar.red.visible = phase;
        bar.blue.visible = !phase;
      }
    }

    // Siren audio + a wash of red/blue light from the nearest unit.
    if (NH.audio) NH.audio.setSiren(level, nearest === Infinity ? 999 : nearest);
    if (this.units.length && level > 0) {
      const u = this.units[0];
      this.sirenLight.position.set(u.pos.x, 3, u.pos.z);
      this.sirenLight.color.setHex(Math.floor(now * 3) % 2 ? 0xff3344 : 0x3366ff);
      this.sirenLight.intensity = nearest < 30 ? 1.6 : 0;
    } else {
      this.sirenLight.intensity = 0;
    }

    // Bust check: player on foot, close to a unit, nearly still.
    this.bustMeter = 0;
    if (level > 0 && player.state === 'foot') {
      for (const u of this.units) {
        const d = Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z);
        if (d < 6.5) {
          this.bustMeter = (this._bust || 0) + dt;
          this._bust = this.bustMeter;
          if (this.bustMeter >= NH.CONFIG.bustSeconds && NH.onBusted) NH.onBusted();
          break;
        }
      }
      if (this.bustMeter === 0) this._bust = 0;
    } else {
      this._bust = 0;
    }
  }
};
