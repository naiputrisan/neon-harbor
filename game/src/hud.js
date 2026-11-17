// hud.js — everything drawn over the 3D world: money and health, wanted
// stars, the objective line and timer, dialogue boxes, prompts, toast
// notifications, the mission banner, the speedometer, the damage vignette,
// and the live minimap (roads, water, traffic, police, mission marker).
'use strict';
window.NH = window.NH || {};

NH.HUD = class HUD {
  constructor() {
    const el = (id) => document.getElementById(id);
    this.moneyEl = el('money');
    this.healthFill = el('health-fill');
    this.starsEl = el('stars');
    this.locationEl = el('location');
    this.objectiveEl = el('objective');
    this.timerEl = el('timer');
    this.dialogueEl = el('dialogue');
    this.dlgWho = el('dlg-who');
    this.dlgText = el('dlg-text');
    this.promptEl = el('prompt');
    this.speedEl = el('speed');
    this.notifyEl = el('notify');
    this.bannerEl = el('banner');
    this.vignetteEl = el('vignette');
    this.bustWrap = el('bust-wrap');
    this.bustFill = el('bust-fill');
    this.mapCtx = el('minimap').getContext('2d');
    this._dlgQueue = [];
    this._dlgTimer = 0;
    this._flashTimer = 0;
    this._money = -1;
    this._stars = -1;
  }

  setMoney(n) {
    if (n === this._money) return;
    this._money = n;
    this.moneyEl.textContent = '$' + Math.round(n).toLocaleString('en-US');
  }

  setHealth(frac) {
    this.healthFill.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    this.healthFill.style.background = frac < 0.3 ? '#e0392c' : '#57c84c';
  }

  setWanted(starsFloat) {
    const level = Math.min(5, Math.ceil(starsFloat - 0.001));
    if (level === this._stars) return;
    this._stars = level;
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="star ${i < level ? 'on' : ''}">★</span>`;
    }
    this.starsEl.innerHTML = html;
    this.starsEl.style.opacity = level > 0 ? '1' : '0.25';
  }

  setLocation(name) {
    if (this.locationEl.textContent !== name) this.locationEl.textContent = name;
  }

  setObjective(text) { this.objectiveEl.textContent = text || ''; }

  setTimer(seconds) {
    if (seconds == null) { this.timerEl.textContent = ''; return; }
    const s = Math.max(0, Math.ceil(seconds));
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.style.color = s < 20 ? '#ff5a3c' : '#ffd75e';
  }

  setPrompt(text) {
    this.promptEl.textContent = text || '';
    this.promptEl.style.opacity = text ? '1' : '0';
  }

  setSpeed(kmh) {
    this.speedEl.textContent = kmh == null ? '' : `${Math.round(kmh)} km/h`;
  }

  setBust(ratio) {
    this.bustWrap.style.opacity = ratio > 0 ? '1' : '0';
    this.bustFill.style.width = Math.min(1, ratio) * 100 + '%';
  }

  dialogue(lines) {
    for (const line of lines) this._dlgQueue.push(line);
    if (this._dlgTimer <= 0) this._showNextLine();
  }

  _showNextLine() {
    const line = this._dlgQueue.shift();
    if (!line) {
      this.dialogueEl.style.opacity = '0';
      this._dlgTimer = 0;
      return;
    }
    this.dlgWho.textContent = line.who;
    this.dlgText.textContent = line.text;
    this.dialogueEl.style.opacity = '1';
    this._dlgTimer = 3.4 + line.text.length * 0.028;
  }

  notify(text) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.notifyEl.appendChild(div);
    setTimeout(() => div.classList.add('show'), 20);
    setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, 4600);
    while (this.notifyEl.children.length > 4) this.notifyEl.firstChild.remove();
  }

  banner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add('show');
    clearTimeout(this._bannerTimeout);
    this._bannerTimeout = setTimeout(() => this.bannerEl.classList.remove('show'), 2800);
  }

  damageFlash() {
    this._flashTimer = 0.55;
    this.vignetteEl.style.opacity = '0.85';
  }

  update(dt, game) {
    if (this._dlgTimer > 0) {
      this._dlgTimer -= dt;
      if (this._dlgTimer <= 0) this._showNextLine();
    }
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) this.vignetteEl.style.opacity = '0';
    }
    this.setMoney(game.money);
    this.setHealth(game.player.health / NH.CONFIG.playerHealth);
    this.setWanted(game.wanted.stars);
    this.setLocation(NH.World.districtAt(game.player.pos.x, game.player.pos.z));
    const p = game.player;
    this.setSpeed(p.state === 'car' ? Math.abs(p.car.speed) * 3.6 : null);
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 184, C = S / 2, view = 250, scale = S / view;
    const px = game.player.pos.x, pz = game.player.pos.z;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#24382e';
    ctx.fillRect(0, 0, S, S);
    const toMap = (x, z) => [C + (x - px) * scale, C + (z - pz) * scale];

    // Water: everything south of the beach line.
    const [, wy] = toMap(0, NH.CONFIG.half + 60);
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(0, wy, S, S - wy);

    // Roads.
    ctx.strokeStyle = '#565d63';
    ctx.lineWidth = NH.CONFIG.road * scale;
    ctx.beginPath();
    for (const x of NH.World.roadsX) {
      const [mx] = toMap(x, 0);
      if (mx < -10 || mx > S + 10) continue;
      ctx.moveTo(mx, 0); ctx.lineTo(mx, S);
    }
    for (const z of NH.World.roadsZ) {
      const [, my] = toMap(0, z);
      if (my < -10 || my > S + 10) continue;
      ctx.moveTo(0, my); ctx.lineTo(S, my);
    }
    ctx.stroke();

    const blip = (x, z, color, r) => {
      const [mx, my] = toMap(x, z);
      if (mx < -6 || mx > S + 6 || my < -6 || my > S + 6) return;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const v of game.traffic.cars) blip(v.pos.x, v.pos.z, '#d8d8d8', 2);
    const flash = Math.floor(performance.now() / 280) % 2 === 0;
    for (const u of game.police.units) blip(u.pos.x, u.pos.z, flash ? '#ff4040' : '#4d7cff', 3);
    if (game.missions.marker.visible) {
      const m = game.missions.marker.position;
      blip(m.x, m.z, '#ffc93c', 4.5);
    }
    if (game.missions.active && game.missions.active.step && game.missions.active.step.vehicle) {
      const v = game.missions.active.step.vehicle;
      blip(v.pos.x, v.pos.z, '#2ca8a0', 3.5);
    }

    // Player arrow, rotated to the heading.
    const heading = game.player.state === 'car' ? game.player.car.heading : game.player.heading;
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(4.6, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4.6, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
};
