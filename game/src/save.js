// save.js — localStorage persistence: money, story progress and where Nico
// was standing. Wrapped in try/catch because some browser contexts deny
// storage; the game must run regardless.
'use strict';
window.NH = window.NH || {};

NH.Save = {
  load() {
    try {
      const raw = localStorage.getItem(NH.CONFIG.saveKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return null;
      return data;
    } catch (e) {
      return null;
    }
  },

  store(game) {
    try {
      const p = game.player;
      localStorage.setItem(NH.CONFIG.saveKey, JSON.stringify({
        money: Math.round(game.money),
        missionIndex: game.missions.index,
        gunUpgraded: !!game.gunUpgraded,
        x: Math.round(p.pos.x * 10) / 10,
        z: Math.round(p.pos.z * 10) / 10,
        heading: Math.round(p.heading * 100) / 100,
        savedAt: Date.now(),
      }));
    } catch (e) { /* storage unavailable: play on without saving */ }
  },

  clear() {
    try { localStorage.removeItem(NH.CONFIG.saveKey); } catch (e) { /* ignore */ }
  },
};
