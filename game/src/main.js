// main.js — Neon Harbor's bootstrap and conductor. Builds the three.js
// scene (golden-hour light, gradient sky, warm haze), creates every system,
// wires their callbacks into one game object, runs the state machine
// (menu / playing / paused / busted / wasted), and implements the ?shot=
// setups the screenshot script drives.
'use strict';
window.NH = window.NH || {};

(function boot() {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xeac9a2, 190, 640);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);

  // Gradient sky dome.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1100, 20, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.20, 0.42, 0.68); vec3 mid = vec3(0.62, 0.76, 0.88); vec3 low = vec3(0.99, 0.80, 0.55); vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.65, h)) : mix(low, mid, smoothstep(-0.04, 0.18, h)); gl_FragColor = vec4(c, 1.0); }',
    }));
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x9a855e, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfae, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // World + systems.
  const rng = NH.makeRng(NH.CONFIG.seed ^ 0x5eed);
  NH.buildCity(scene);
  const audio = new NH.Audio();
  const hud = new NH.HUD();
  const fx = new NH.FX(scene);
  const traffic = new NH.Traffic(scene, rng);
  const peds = new NH.Pedestrians(scene, rng);
  const player = new NH.Player(scene);
  const wanted = new NH.Wanted();
  const police = new NH.Police(scene);
  const combat = new NH.Combat(scene, fx);
  combat.attachGun(player);

  const game = {
    scene, camera, renderer, audio, hud, fx, traffic, peds, player,
    wanted, police, combat,
    money: 120, gunUpgraded: false, now: 0,
    state: 'menu',
    allVehicles: [],
    addMoney(n, why) {
      this.money += n;
      if (n > 0) {
        hud.notify(`+$${n} — ${why}`);
        if (audio) audio.cash();
      }
    },
    saveProgress() { NH.Save.store(this); },
  };
  game.missions = new NH.Missions(game);
  NH.game = game;
  NH.hud = hud;
  NH.audio = audio;
  NH.allVehicles = game.allVehicles;
  game.allVehicles.push(...traffic.cars, ...traffic.parked);
  NH.trafficRef = traffic;

  // --- cross-system callbacks ---------------------------------------------
  let lastPoliceHitAt = -9;
  NH.onCrime = function onCrime(kind, source) {
    if (kind === 'pedHit' && !(player.state === 'car' && source === player.car)) return;
    wanted.addCrime(kind, game.now);
    if (kind === 'gunfire') peds.scare(player.pos.x, player.pos.z, 20);
  };
  NH.onCarCrash = function onCarCrash(vehicle, speed) {
    audio.crash(speed);
    fx.burst(vehicle.pos.x, 0.9, vehicle.pos.z, 0xffc36b, 6, 3, 0.4);
    if (player.state === 'car' && vehicle === player.car) {
      for (const u of police.units) {
        if (Math.hypot(u.pos.x - vehicle.pos.x, u.pos.z - vehicle.pos.z) < 5 &&
            game.now - lastPoliceHitAt > 3) {
          lastPoliceHitAt = game.now;
          wanted.addCrime('policeHit', game.now);
        }
      }
    }
  };
  NH.onThugDown = function onThugDown() {
    wanted.addCrime('thugDown', game.now);
    game.addMoney(25, 'Collector down');
  };
  NH.onBusted = function onBusted() {
    if (game.state !== 'playing') return;
    game.state = 'busted';
    const fine = NH.CONFIG.fineBase + wanted.level * 120;
    game.money = Math.max(0, game.money - fine);
    document.getElementById('busted-detail').textContent =
      `The patrol walks Nico to the station. Fine: $${fine}. The city keeps the change.`;
    document.getElementById('busted-screen').classList.remove('hidden');
    audio.busted();
    document.exitPointerLock && document.exitPointerLock();
  };
  NH.onPlayerDeath = function onPlayerDeath() {
    if (game.state !== 'playing') return;
    game.state = 'dead';
    document.getElementById('dead-screen').classList.remove('hidden');
    document.exitPointerLock && document.exitPointerLock();
  };

  // --- input ----------------------------------------------------------------
  const input = { keys: new Set(), mouseDown: false };
  NH.input = input;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    input.keys.add(e.code);
    if (game.state !== 'playing') return;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyM' && !game.missions.active) game.missions.startNext();
    if (e.code === 'KeyN') hud.notify(audio.toggleMusic() ? 'Music on' : 'Music off');
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });

  canvas.addEventListener('click', () => {
    audio.unlock();
    if (game.state === 'playing' && !game.shotMode && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas || game.state !== 'playing') return;
    player.camYaw -= e.movementX * 0.0026;
    player.camPitch = Math.max(-0.12, Math.min(0.95, player.camPitch + e.movementY * 0.0021));
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && game.state === 'playing') { input.mouseDown = true; combat.aiming = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { input.mouseDown = false; combat.aiming = false; }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') {
      if (game.state === 'playing') pauseGame();
      else if (game.state === 'paused') resumeGame();
    }
  });

  function interact() {
    if (player.state === 'car') {
      player.exitCar();
      audio.setEngine(0, false);
      hud.setPrompt('');
      return;
    }
    const car = player.nearestCar(game.allVehicles, 3.6);
    if (!car) return;
    const wasParked = car.parked;
    player.enterCar(car, audio);
    if (wasParked || car.driver === 'player') {
      if (!car.stolenByPlayer && !car.wasPlayers) {
        car.stolenByPlayer = true;
        wanted.addCrime('carTheft', game.now);
        peds.scare(car.pos.x, car.pos.z, 9);
        hud.notify(car.kind === 'police' ? 'You stole a patrol car. Bold.' : 'Car stolen');
      }
    }
  }

  // --- menus / state ---------------------------------------------------------
  const menuEl = document.getElementById('menu');
  const hudEl = document.getElementById('hud');
  const continueBtn = document.getElementById('btn-continue');
  function refreshContinue() { continueBtn.disabled = !NH.Save.load(); }
  refreshContinue();

  function startPlaying(fresh) {
    menuEl.classList.add('hidden');
    hudEl.classList.add('on');
    game.state = 'playing';
    audio.unlock();
    if (fresh) {
      hud.notify('Welcome to Port Solano. Press M for work — or just take a car.');
      setTimeout(() => { if (!game.missions.active) game.missions.startNext(); }, 1600);
    }
  }
  document.getElementById('btn-new').addEventListener('click', () => {
    NH.Save.clear();
    game.money = 120;
    game.missions.index = 0;
    game.gunUpgraded = false;
    player.teleport(NH.POIS.playerStart.x, NH.POIS.playerStart.z, Math.PI);
    wanted.clear();
    refreshContinue();
    startPlaying(true);
  });
  continueBtn.addEventListener('click', () => {
    const save = NH.Save.load();
    if (save) {
      game.money = save.money || 0;
      game.missions.index = save.missionIndex || 0;
      game.gunUpgraded = !!save.gunUpgraded;
      player.teleport(save.x ?? NH.POIS.playerStart.x, save.z ?? NH.POIS.playerStart.z, save.heading || 0);
    }
    startPlaying(false);
  });
  function pauseGame() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    game.saveProgress();
    document.getElementById('pause-menu').classList.remove('hidden');
    document.exitPointerLock && document.exitPointerLock();
  }
  function resumeGame() {
    game.state = 'playing';
    document.getElementById('pause-menu').classList.add('hidden');
  }
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-quit').addEventListener('click', () => {
    game.saveProgress();
    document.getElementById('pause-menu').classList.add('hidden');
    menuEl.classList.remove('hidden');
    hudEl.classList.remove('on');
    game.state = 'menu';
    refreshContinue();
  });
  document.getElementById('btn-busted-ok').addEventListener('click', () => {
    document.getElementById('busted-screen').classList.add('hidden');
    wanted.clear();
    if (player.state === 'car') player.exitCar();
    player.teleport(NH.POIS.courthouse.x + 6, NH.POIS.courthouse.z + 8, 0);
    player.health = NH.CONFIG.playerHealth;
    player.dead = false;
    game.state = 'playing';
  });
  document.getElementById('btn-dead-ok').addEventListener('click', () => {
    document.getElementById('dead-screen').classList.add('hidden');
    game.money = Math.max(0, game.money - 200);
    wanted.clear();
    if (player.state === 'car') player.exitCar();
    player.teleport(NH.POIS.playerStart.x, NH.POIS.playerStart.z, Math.PI);
    player.health = NH.CONFIG.playerHealth;
    player.dead = false;
    game.state = 'playing';
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- screenshot setups ------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  game.shotMode = shot;
  let shotFrames = 0;
  let menuOrbit = 0;
  if (shot) setupShot(shot);

  function setupShot(name) {
    hudEl.classList.add('on');
    if (name === 'start') {
      game.state = 'menu';
      return;
    }
    menuEl.classList.add('hidden');
    game.state = 'playing';
    if (name === 'cover') {
      const car = new NH.Vehicle(scene, 'sports', 0xc23b2e, -84, 153.4, Math.PI / 2);
      game.allVehicles.push(car);
      player.enterCar(car, null);
      car.speed = 15;
      game.shotCruise = 15;
      game.money = 1250;
      hud.setObjective('Deliver the Vantara Comet to Adeyemi Auto Works');
      game.missions._showMarker(NH.POIS.autoWorks.x, NH.POIS.autoWorks.z);
      game.shotCamera = (cam) => {
        const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
        const side = { x: f.z, z: -f.x };
        cam.position.set(
          car.pos.x + f.x * 8.5 + side.x * 5.2, 1.25,
          car.pos.z + f.z * 8.5 + side.z * 5.2);
        cam.lookAt(car.pos.x, 0.95, car.pos.z);
      };
    } else if (name === 'mission') {
      player.teleport(NH.POIS.fishMarket.x + 9, NH.POIS.fishMarket.z + 7, -2.35);
      player.camYaw = -2.35;
      game.money = 570;
      hud.setObjective('Pick up the cooler at Solano Fish Market');
      game.missions._showMarker(NH.POIS.fishMarket.x, NH.POIS.fishMarket.z);
      hud.dialogue([
        { who: 'Dessa', text: 'The cooler is by the stalls, blue lid. Patrols are sweeping the docks — be quick, Nico.' },
      ]);
    } else if (name === 'chase') {
      const car = new NH.Vehicle(scene, 'sports', 0xc23b2e, -26.6, 34, Math.PI);
      game.allVehicles.push(car);
      player.enterCar(car, null);
      car.speed = 23;
      game.shotCruise = 23;
      game.money = 2100;
      wanted.setMinimum(4, 0);
      hud.setObjective('Lose the police — break their line of sight');
      const spots = [[-26.6, 52], [-33.5, 60], [-19.5, 63]];
      for (const [x, z] of spots) {
        const u = new NH.Vehicle(scene, 'police', 0xf2f2f2, x, z, Math.PI);
        u.driver = 'police';
        u.speed = 20;
        police.units.push(u);
        game.allVehicles.push(u);
      }
    }
  }

  // --- main loop ----------------------------------------------------------------
  const clock = new THREE.Clock();
  let saveTimer = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    if (game.state === 'menu') {
      menuOrbit += dt * 0.045;
      const cx = -30 + Math.cos(menuOrbit) * 105;
      const cz = 55 + Math.sin(menuOrbit) * 105;
      camera.position.set(cx, 34, cz);
      camera.lookAt(-10, 6, 30);
      traffic.update(dt);
      peds.update(dt, game.allVehicles, t);
      game.now += dt;
    } else if (game.state === 'playing') {
      game.now += dt;
      const now = game.now;
      player.update(dt, input, game.allVehicles);
      if (game.shotCruise && player.car) {
        player.car.speed += (game.shotCruise - player.car.speed) * Math.min(1, dt * 3);
      }
      traffic.update(dt);
      NH.collideVehicles(game.allVehicles, dt);
      peds.update(dt, game.allVehicles, now);
      police.update(dt, now, player, wanted);
      wanted.update(dt, now);
      if (input.mouseDown && player.state === 'foot') combat.playerShoot(camera, player, now);
      combat.update(dt, player, now);
      fx.update(dt);
      game.missions.update(dt, now);
      hud.update(dt, game);
      hud.setBust(police.bustMeter > 0 ? police._bust || 0 : 0);
      hud.setBust((police._bust || 0) / NH.CONFIG.bustSeconds);
      // Context prompt + crosshair.
      if (player.state === 'foot') {
        const near = player.nearestCar(game.allVehicles, 3.6);
        hud.setPrompt(near ? `<b>E</b> — ${near.parked ? 'Steal' : 'Enter'} the ${near.kind}` : '');
        document.getElementById('crosshair').style.opacity = '0.9';
      } else {
        hud.setPrompt('');
        document.getElementById('crosshair').style.opacity = '0';
      }
      if (player.state !== 'car') audio.setEngine(0, false);
      if (game.shotCamera) game.shotCamera(camera);
      else player.updateCamera(dt, camera);
      saveTimer += dt;
      if (saveTimer > 8) { saveTimer = 0; game.saveProgress(); }
    } else {
      // paused / busted / wasted: hold the frame, keep the world breathing.
      traffic.update(0);
    }

    // Sun shadow follows the player; water breathes.
    const focus = game.state === 'menu' ? { x: 0, z: 40 } : player.pos;
    sun.position.set(focus.x + 110, 150, focus.z + 55);
    sun.target.position.set(focus.x, 0, focus.z);
    if (NH.water) NH.water.position.y = -0.35 + Math.sin(t * 0.7) * 0.05;
    sky.position.copy(camera.position);

    renderer.render(scene, camera);
    if (shot) {
      shotFrames++;
      // Late staging: just before the capture frame, snap one patrol car
      // into view ahead of the player as a roadblock — pursuit AI otherwise
      // tucks every unit behind the camera where a still cannot show them.
      if (shotFrames === 62 && shot === 'chase' && police.units.length) {
        const car = player.car;
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        const sx = fz, sz = -fx; // right-hand side vector
        // Two-car roadblock ~30 m ahead, angled across the player's lane;
        // far enough that the remaining frames cannot collapse it into the
        // camera the way a close teleport does.
        const spots = [[30, -3.5], [33, 3.5]];
        for (let i = 0; i < Math.min(2, police.units.length); i++) {
          const u = police.units[i];
          const [fwd, side] = spots[i];
          u.placeAt(car.pos.x + fx * fwd + sx * side,
            car.pos.z + fz * fwd + sz * side, car.heading + Math.PI * 0.82);
          u.speed = 2;
        }
      }
      if (shotFrames === 70) window.__NH_SHOT_READY = true;
    }
  }
  window.__NH_GAME = game;
  frame();
})();
