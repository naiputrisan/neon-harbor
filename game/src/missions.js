// missions.js — the story of Neon Harbor: four missions for fixer Odessa
// "Dessa" Crane, told through objectives and dialogue, plus a systemic
// chop-shop loop (any car Nico steals can be sold to Adeyemi Auto Works).
// All people, places and cars are invented for this game.
'use strict';
window.NH = window.NH || {};

const DESSA = 'Dessa';
const NICO = 'Nico';
const YUSUF = 'Yusuf';

NH.Missions = class Missions {
  constructor(game) {
    this.game = game;
    this.index = 0;          // next story mission to offer
    this.active = null;      // { def, stepIndex, step }
    this.marker = this._makeMarker(game.scene);
    this.sideJobDone = 0;
  }

  _makeMarker(scene) {
    const group = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 26, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc93c, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false }));
    cyl.position.y = 13;
    group.add(cyl);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.85),
      new THREE.MeshBasicMaterial({ color: 0xffd75e }));
    gem.position.y = 4.4;
    group.add(gem);
    group.visible = false;
    scene.add(group);
    group.userData.gem = gem;
    return group;
  }

  get storyDone() { return this.index >= NH.STORY.length; }

  startNext() {
    if (this.storyDone || this.active) return;
    const def = NH.STORY[this.index];
    this.active = { def, stepIndex: -1, step: null };
    this.game.hud.banner(`Mission — ${def.title}`);
    this.game.hud.dialogue(def.intro);
    this._nextStep();
  }

  _nextStep() {
    const a = this.active;
    a.stepIndex++;
    if (a.stepIndex >= a.def.steps.length) { this._complete(); return; }
    a.step = a.def.steps[a.stepIndex];
    const s = a.step;
    if (s.onStart) s.onStart(this.game, s);
    if (s.timeLimit) s.timeLeft = s.timeLimit;
    this.game.hud.setObjective(s.objective);
    if (s.at) this._showMarker(s.at.x, s.at.z);
    else this.marker.visible = false;
  }

  _showMarker(x, z) {
    this.marker.position.set(x, 0, z);
    this.marker.visible = true;
  }

  _complete() {
    const { def } = this.active;
    this.active = null;
    this.index++;
    this.marker.visible = false;
    this.game.hud.setObjective('');
    this.game.hud.dialogue(def.outro);
    this.game.addMoney(def.reward, def.title);
    if (def.onComplete) def.onComplete(this.game);
    if (NH.audio) NH.audio.missionDone();
    this.game.saveProgress();
    if (!this.storyDone) {
      this.game.hud.notify(`Next: "${NH.STORY[this.index].title}" — press M when ready`);
    } else {
      this.game.hud.notify('Story complete — Port Solano is yours. Chop-shop runs stay open.');
    }
  }

  update(dt, now) {
    // Marker idle animation.
    if (this.marker.visible) {
      this.marker.userData.gem.rotation.y += dt * 2.2;
      this.marker.userData.gem.position.y = 4.4 + Math.sin(now * 2.4) * 0.35;
    }
    const g = this.game;
    if (this.active) {
      const s = this.active.step;
      if (s) {
        if (s.timeLimit) {
          s.timeLeft -= dt;
          g.hud.setTimer(s.timeLeft);
          if (s.timeLeft <= 0) {
            // Fail soft: reset the clock, keep the step, sting a little.
            s.timeLeft = s.timeLimit;
            g.hud.notify('Too slow — the clock restarts. Move!');
            if (s.onTimeout) s.onTimeout(g, s);
          }
        } else g.hud.setTimer(null);
        if (s.check(g, s, dt)) this._nextStep();
      }
    } else {
      g.hud.setTimer(null);
      this._chopShop(dt);
    }
  }

  // Any stolen car delivered to the Auto Works earns its street value.
  _chopShop() {
    const g = this.game;
    const p = g.player;
    if (p.state !== 'car' || !p.car.stolenByPlayer) return;
    const poi = NH.POIS.autoWorks;
    const d = Math.hypot(p.car.pos.x - poi.x, p.car.pos.z - poi.z);
    if (d < 11 && Math.abs(p.car.speed) < 3) {
      const base = { sedan: 130, taxi: 110, sports: 320, truck: 180, police: 0 }[p.car.kind] || 120;
      const pay = Math.round(base * (0.4 + 0.6 * (p.car.health / 100)));
      p.car.stolenByPlayer = false;
      this.sideJobDone++;
      if (pay > 0) {
        g.addMoney(pay, 'Chop-shop delivery');
        g.hud.notify(`Yusuf takes the ${p.car.kind} off your hands: +$${pay}`);
      }
    }
  }
};

// Step check helpers ------------------------------------------------------------
function distTo(player, at) {
  return Math.hypot(player.pos.x - at.x, player.pos.z - at.z);
}
const atPlace = (radius) => (g, s) => distTo(g.player, s.at) < radius;
const inCar = (g, s) => g.player.state === 'car' && g.player.car === s.vehicle;

// The story. Each mission is data + tiny step closures; the engine above runs
// them. Dialogue lines are { who, text }.
NH.STORY = [
  {
    title: 'Harbor Lights',
    reward: 450,
    intro: [
      { who: DESSA, text: 'Nico. You drive, you don\'t ask questions — that\'s why I called.' },
      { who: DESSA, text: 'A teal Vantara Comet sits on Marina Row, keys in, owner careless. Bring it to Yusuf at Adeyemi Auto Works.' },
      { who: NICO, text: 'Steal a sports car my first hour in Port Solano. Sure. Why ease in?' },
    ],
    steps: [
      {
        objective: 'Steal the teal Vantara Comet on Marina Row',
        at: NH.POIS.marinaRow, type: 'steal',
        onStart(g, s) {
          s.vehicle = new NH.Vehicle(g.scene, 'sports', 0x2ca8a0,
            NH.POIS.marinaRow.x, NH.POIS.marinaRow.z, Math.PI / 2);
          s.vehicle.parked = true;
          g.traffic.parked.push(s.vehicle);
          g.allVehicles.push(s.vehicle);
          s.at = { x: s.vehicle.pos.x, z: s.vehicle.pos.z };
        },
        check: inCar,
      },
      {
        objective: 'Deliver the Comet to Adeyemi Auto Works',
        at: NH.POIS.autoWorks, type: 'deliver',
        onStart(g, s) { s.vehicle = g.missions.active.def.steps[0].vehicle; },
        check(g, s) {
          return g.player.state === 'car' && g.player.car === s.vehicle &&
            distTo(g.player, s.at) < 11 && Math.abs(s.vehicle.speed) < 3;
        },
      },
    ],
    outro: [
      { who: YUSUF, text: 'Clean work. No scratches that matter. Dessa said you were good.' },
      { who: DESSA, text: 'Four hundred fifty, as agreed. Stick around, Nico — this city pays people like us.' },
    ],
  },
  {
    title: 'Cold Chain',
    reward: 700,
    intro: [
      { who: DESSA, text: 'A cooler at the Fish Market needs to reach Café Lumen while it\'s still cold.' },
      { who: DESSA, text: 'Harbour patrols are jumpy today. If they clock you, lose them after the drop — not before.' },
    ],
    steps: [
      {
        objective: 'Pick up the cooler at Solano Fish Market (on foot)',
        at: NH.POIS.fishMarket, type: 'pickup',
        check(g, s) { return g.player.state === 'foot' && distTo(g.player, s.at) < 4; },
      },
      {
        objective: 'Deliver the cooler to Café Lumen — fast',
        at: NH.POIS.cafeLumen, type: 'deliverAny', timeLimit: 170,
        onStart(g) {
          g.wanted.setMinimum(2, g.now);
          g.hud.dialogue([
            { who: DESSA, text: 'Patrol just lit up the docks. Clock\'s running, Nico — Lumen, now!' },
          ]);
        },
        check: atPlace(9),
      },
    ],
    outro: [
      { who: DESSA, text: 'Cold, on time, and only slightly illegal. Seven hundred.' },
      { who: NICO, text: 'You say that like "slightly" is doing a lot of work. It is.' },
    ],
  },
  {
    title: 'Dockside Diplomacy',
    reward: 900,
    intro: [
      { who: DESSA, text: 'Silas Crowe\'s collectors are at Pier Nine, leaning on my courier, Bram.' },
      { who: DESSA, text: 'Diplomacy, Nico. The loud kind. Take my pistol — and this stays between us.' },
    ],
    steps: [
      { objective: 'Reach Pier Nine', at: NH.POIS.pier9, type: 'goto', check: atPlace(12) },
      {
        objective: 'Drive off Crowe\'s collectors',
        at: NH.POIS.pier9, type: 'fight',
        onStart(g, s) {
          g.combat.spawnThugs(NH.POIS.pier9, 4);
          s.spawned = true;
          g.hud.dialogue([
            { who: 'Collector', text: 'Wrong pier, friend. Walk away while walking\'s free.' },
          ]);
        },
        check(g) { return g.combat.aliveThugs() === 0; },
      },
      {
        objective: 'Report back to Adeyemi Auto Works',
        at: NH.POIS.autoWorks, type: 'goto', check: atPlace(11),
      },
    ],
    outro: [
      { who: YUSUF, text: 'Bram walked home whistling. Whatever you did, it worked.' },
      { who: DESSA, text: 'Nine hundred, and I\'ve tuned that pistol of yours. Crowe will answer this — be ready.' },
    ],
    onComplete(g) { g.gunUpgraded = true; },
  },
  {
    title: 'Neon Getaway',
    reward: 1500,
    intro: [
      { who: DESSA, text: 'Crowe framed me with the harbour ledgers. I testify at noon — if I reach the courthouse alive.' },
      { who: DESSA, text: 'Pick me up there. Every patrol in Port Solano will try to stop us. Lose them, then the lighthouse.' },
    ],
    steps: [
      {
        objective: 'Pick up Dessa at the Solano Courthouse (on foot)',
        at: NH.POIS.courthouse, type: 'pickup',
        check(g, s) { return g.player.state === 'foot' && distTo(g.player, s.at) < 4.5; },
      },
      {
        objective: 'Lose the police — break their line of sight',
        type: 'escape',
        onStart(g) {
          g.wanted.setMinimum(3, g.now);
          g.hud.dialogue([
            { who: DESSA, text: 'That\'s every siren in the city. Drive, Nico. DRIVE.' },
          ]);
        },
        check(g) { return g.wanted.stars <= 0.05; },
      },
      {
        objective: 'Reach the Harbor Lighthouse',
        at: NH.POIS.lighthouse, type: 'goto', check: atPlace(13),
      },
    ],
    outro: [
      { who: DESSA, text: 'You hear that? Quiet. First quiet in a week.' },
      { who: DESSA, text: 'Fifteen hundred, and Port Solano owes you more than money. Don\'t be a stranger.' },
      { who: NICO, text: 'Stranger? Dessa — I live here now.' },
    ],
  },
];
