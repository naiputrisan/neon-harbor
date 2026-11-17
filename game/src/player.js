// player.js — Nico, the player character: on-foot movement with a third-person
// camera, entering and stealing cars, and the chase camera while driving.
// Input arrives through NH.input, filled by main.js from keyboard and mouse.
'use strict';
window.NH = window.NH || {};

NH.Player = class Player {
  constructor(scene) {
    this.person = new NH.Person(scene, {
      shirt: 0x117a7a, pants: 0x27313b, skin: 0xd9a066, cap: 0xc23b2e,
    }, NH.POIS.playerStart.x, NH.POIS.playerStart.z, Math.PI);
    this.health = NH.CONFIG.playerHealth;
    this.state = 'foot';           // 'foot' | 'car'
    this.car = null;
    this.heading = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 6.2;
    this.dead = false;
    this._camPos = new THREE.Vector3(0, 30, 60);
    this.regenTimer = 0;
  }

  get pos() {
    return this.state === 'car' ? this.car.pos : this.person.pos;
  }

  teleport(x, z, heading) {
    if (this.state === 'car') this.exitCar();
    this.person.pos.set(x, 0, z);
    this.heading = heading || 0;
    this.camYaw = this.heading;
  }

  nearestCar(vehicles, maxDist) {
    let best = null, bestD = maxDist;
    for (const v of vehicles) {
      if (v.dead) continue;
      const d = Math.hypot(v.pos.x - this.person.pos.x, v.pos.z - this.person.pos.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  enterCar(car, audio) {
    this.state = 'car';
    this.car = car;
    car.driver = 'player';
    car.parked = false;
    this.person.mesh.visible = false;
    if (audio) audio.door();
  }

  exitCar() {
    if (this.state !== 'car') return null;
    const car = this.car;
    car.driver = null;
    car.parked = true;
    car.speed = 0;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.person.pos.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
    NH.World.collideCircle(this.person.pos, 0.55);
    this.person.mesh.visible = true;
    this.state = 'foot';
    this.car = null;
    this.heading = car.heading;
    return car;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.regenTimer = 0;
    if (NH.hud) NH.hud.damageFlash();
    if (NH.audio) NH.audio.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      if (NH.onPlayerDeath) NH.onPlayerDeath();
    }
  }

  update(dt, input, vehicles) {
    // Slow health regen after 6 quiet seconds.
    this.regenTimer += dt;
    if (this.regenTimer > 6 && this.health > 0 && this.health < NH.CONFIG.playerHealth) {
      this.health = Math.min(NH.CONFIG.playerHealth, this.health + dt * 4);
    }
    if (this.state === 'car') { this._updateDriving(dt, input); return; }
    this._updateOnFoot(dt, input);
  }

  _updateOnFoot(dt, input) {
    const keys = input.keys;
    let mx = 0, mz = 0;
    if (keys.has('KeyW')) mz += 1;
    if (keys.has('KeyS')) mz -= 1;
    if (keys.has('KeyA')) mx -= 1;
    if (keys.has('KeyD')) mx += 1;
    const moving = (mx !== 0 || mz !== 0);
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = sprint ? NH.CONFIG.sprintSpeed : NH.CONFIG.walkSpeed;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      // Camera forward and screen-right in world space (y-up, right-handed).
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      const rx = -fz, rz = fx;
      const wx = fx * mz + rx * mx;
      const wz = fz * mz + rz * mx;
      this.heading = Math.atan2(wx, wz);
      this.person.pos.x += Math.sin(this.heading) * speed * dt;
      this.person.pos.z += Math.cos(this.heading) * speed * dt;
      NH.World.collideCircle(this.person.pos, NH.CONFIG.playerRadius);
      // Do not walk through cars.
      for (const v of vehiclesOrEmpty()) {
        const d = Math.hypot(v.pos.x - this.person.pos.x, v.pos.z - this.person.pos.z);
        if (d < 1.9) {
          const push = (1.9 - d) || 0.1;
          const nx = (this.person.pos.x - v.pos.x) / (d || 1);
          const nz = (this.person.pos.z - v.pos.z) / (d || 1);
          this.person.pos.x += nx * push;
          this.person.pos.z += nz * push;
        }
      }
    }
    this.person.heading = this.heading;
    this.person.animate(dt, moving ? speed : 0);
  }

  _updateDriving(dt, input) {
    const keys = input.keys;
    const throttle = (keys.has('KeyW') ? 1 : 0) + (keys.has('KeyS') ? -1 : 0);
    const steer = (keys.has('KeyA') ? 1 : 0) + (keys.has('KeyD') ? -1 : 0);
    const handbrake = keys.has('Space');
    this.car.manualDrive(dt, throttle, steer, handbrake);
    if (NH.audio) {
      NH.audio.setEngine(this.car.speed / this.car.stats.maxSpeed, true);
    }
  }

  // Camera: smooth third-person rig for both modes.
  updateCamera(dt, camera) {
    let targetPos, lookAt;
    if (this.state === 'car') {
      const car = this.car;
      const back = 9.5 + Math.abs(car.speed) * 0.06;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      targetPos = new THREE.Vector3(
        car.pos.x - fx * back, 3.4 + Math.abs(car.speed) * 0.012, car.pos.z - fz * back);
      lookAt = new THREE.Vector3(car.pos.x + fx * 7, 1.3, car.pos.z + fz * 7);
      const k = 1 - Math.pow(0.0001, dt);
      this._camPos.lerp(targetPos, Math.min(1, k));
    } else {
      const p = this.person.pos;
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      const h = 1.6 + this.camPitch * 5.2;
      targetPos = new THREE.Vector3(p.x - fx * this.camDist, h, p.z - fz * this.camDist);
      lookAt = new THREE.Vector3(p.x + fx * 3.2, 1.45 - this.camPitch * 1.4, p.z + fz * 3.2);
      const k = 1 - Math.pow(0.0000001, dt);
      this._camPos.lerp(targetPos, Math.min(1, k));
    }
    // Keep the camera out of buildings and above the ground.
    if (this._camPos.y < 0.7) this._camPos.y = 0.7;
    camera.position.copy(this._camPos);
    camera.lookAt(lookAt);
  }
};

function vehiclesOrEmpty() {
  return NH.allVehicles || [];
}
