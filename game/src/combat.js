// combat.js — gunplay: a tiny pooled particle system, hitscan shooting with
// tracers for the player, and the thug opponents the story sends against
// Nico (they close in, strafe, and shoot back). Damage numbers live in
// config.js.
'use strict';
window.NH = window.NH || {};

// Pooled point particles (sparks, dust, hit puffs). One THREE.Points, 320
// slots, additive so fading colour reads as fading alpha.
NH.FX = class FX {
  constructor(scene) {
    this.max = 320;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.cursor = 0;
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.32, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(x, y, z, hex, count, speed, life) {
    const c = new THREE.Color(hex);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.2;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * s;
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 5.5 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) this.pos[i * 3 + 1] = 0.05;
      const f = this.life[i] / this.maxLife[i];
      this.points.geometry.attributes.color.array[i * 3] *= (0.92 + f * 0.08);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
};

function pointInBuilding(x, z) {
  for (const b of NH.World.colliders) {
    if (Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd) return true;
  }
  return false;
}

NH.Combat = class Combat {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.thugs = [];
    this.cooldown = 0;
    this.tracers = [];
    this.flash = new THREE.PointLight(0xffc873, 0, 9);
    scene.add(this.flash);
    this.aiming = false;
  }

  attachGun(player) {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x191c1f }));
    gun.position.set(0, -0.62, 0.14);
    player.person.mesh.userData.parts.armR.add(gun);
  }

  spawnThugs(poi, count) {
    this.clearThugs();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const person = new NH.Person(this.scene, {
        shirt: 0x5e2129, pants: 0x1d1d24, skin: NH.jitter.pick(NH.SKIN_TONES),
      }, poi.x + Math.cos(a) * 6, poi.z + Math.sin(a) * 6, a + Math.PI);
      this.thugs.push({
        person, health: NH.CONFIG.thugHealth, dead: false,
        nextShot: 1 + Math.random() * 1.6, strafe: Math.random() < 0.5 ? 1 : -1,
        home: { x: poi.x, z: poi.z },
      });
    }
    return this.thugs;
  }

  clearThugs() {
    for (const t of this.thugs) this.scene.remove(t.person.mesh);
    this.thugs = [];
  }

  aliveThugs() { return this.thugs.filter(t => !t.dead).length; }

  _tracer(from, to, hex) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: hex, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.055 });
  }

  // The player's pistol: hitscan along the camera's aim.
  playerShoot(camera, player, now) {
    if (this.cooldown > 0 || player.state !== 'foot' || player.dead) return false;
    this.cooldown = NH.CONFIG.gunCooldown;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    if (NH.audio) NH.audio.gunshot();
    this.flash.position.copy(origin).addScaledVector(dir, 1.2);
    this.flash.intensity = 2.4;
    if (NH.onCrime) NH.onCrime('gunfire', player);

    // Nearest thug the ray passes through.
    let bestT = NH.CONFIG.gunRange, bestThug = null, bestCrit = false;
    for (const t of this.thugs) {
      if (t.dead) continue;
      for (const [lift, r, crit] of [[1.62, 0.34, true], [1.05, 0.62, false]]) {
        const cx = t.person.pos.x - origin.x;
        const cy = t.person.pos.y + lift - origin.y;
        const cz = t.person.pos.z - origin.z;
        const along = cx * dir.x + cy * dir.y + cz * dir.z;
        if (along < 0 || along > bestT) continue;
        const px = origin.x + dir.x * along - t.person.pos.x;
        const py = origin.y + dir.y * along - (t.person.pos.y + lift);
        const pz = origin.z + dir.z * along - t.person.pos.z;
        if (px * px + py * py + pz * pz < r * r) {
          bestT = along; bestThug = t; bestCrit = crit;
        }
      }
    }
    // Walls stop the bullet.
    let wallT = NH.CONFIG.gunRange;
    for (let s = 2; s < NH.CONFIG.gunRange; s += 1.5) {
      const x = origin.x + dir.x * s;
      const z = origin.z + dir.z * s;
      if (pointInBuilding(x, z)) { wallT = s; break; }
    }
    const hitT = Math.min(bestT, wallT);
    const impact = origin.clone().addScaledVector(dir, hitT);
    this._tracer(origin.clone().addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.12, 0)),
      impact, 0xffd98a);
    if (bestThug && bestT <= wallT) {
      const dmg = NH.CONFIG.gunDamage * (bestCrit ? 2 : 1) *
        (NH.game && NH.game.gunUpgraded ? 1.5 : 1);
      bestThug.health -= dmg;
      this.fx.burst(impact.x, impact.y, impact.z, 0xff5a3c, 7, 2.4, 0.4);
      if (NH.audio) NH.audio.hit();
      if (bestThug.health <= 0 && !bestThug.dead) {
        bestThug.dead = true;
        bestThug.person.fall();
        if (NH.onThugDown) NH.onThugDown(bestThug);
      }
    } else {
      this.fx.burst(impact.x, impact.y, impact.z, 0xcfc4a5, 5, 1.8, 0.35);
    }
    return true;
  }

  update(dt, player, now) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash.intensity *= Math.pow(0.0001, dt * 3);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // Aim pose: right arm points forward while the mouse is held.
    if (player && player.person) {
      const arm = player.person.mesh.userData.parts.armR;
      const target = this.aiming && player.state === 'foot' ? -1.35 : 0;
      arm.rotation.x += (target - arm.rotation.x) * Math.min(1, dt * 14);
    }
    // Thugs: close to fighting distance, strafe, shoot back.
    for (const t of this.thugs) {
      if (t.dead) continue;
      const p = t.person;
      const dx = player.pos.x - p.pos.x;
      const dz = player.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 42) { p.animate(dt, 0); continue; }
      let mx = 0, mz = 0, speed = 0;
      if (dist > 13) { mx = dx / dist; mz = dz / dist; speed = 3.4; }
      else if (dist < 7) { mx = -dx / dist; mz = -dz / dist; speed = 2.2; }
      else {
        mx = (-dz / dist) * t.strafe; mz = (dx / dist) * t.strafe; speed = 1.4;
        if (Math.random() < dt * 0.25) t.strafe *= -1;
      }
      if (speed > 0) {
        p.pos.x += mx * speed * dt;
        p.pos.z += mz * speed * dt;
        NH.World.collideCircle(p.pos, 0.45);
      }
      p.heading = Math.atan2(dx, dz);
      p.animate(dt, speed);
      t.nextShot -= dt;
      if (t.nextShot <= 0 && dist < 30 && !player.dead) {
        t.nextShot = 1.3 + Math.random() * 1.3;
        const from = { x: p.pos.x, y: 1.35, z: p.pos.z };
        const spread = 0.6 + dist * 0.05;
        const to = {
          x: player.pos.x + (Math.random() - 0.5) * spread,
          y: 1.2,
          z: player.pos.z + (Math.random() - 0.5) * spread,
        };
        this._tracer(from, to, 0xff7a5c);
        if (NH.audio) NH.audio.gunshot();
        const hitChance = Math.max(0.12, 0.5 - dist * 0.011) *
          (player.state === 'car' ? 0.55 : 1);
        if (Math.random() < hitChance) {
          if (player.state === 'car') player.car.damage(3 + Math.random() * 4);
          else player.damage(4 + Math.random() * 5);
          this.fx.burst(player.pos.x, 1.2, player.pos.z, 0xff5a3c, 5, 2, 0.35);
        }
      }
    }
  }
};
