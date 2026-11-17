// random.js — a small seeded RNG (mulberry32) plus helpers. The city builder
// and spawners draw from one seeded stream so Port Solano is identical on
// every visit; gameplay jitter uses a second, unseeded stream.
'use strict';
window.NH = window.NH || {};

NH.makeRng = function makeRng(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length) % arr.length]; },
    chance(p) { return next() < p; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
  };
};

// Unseeded stream for cosmetic jitter (particle spread, ped phase offsets).
NH.jitter = NH.makeRng((Math.random() * 0xffffffff) >>> 0);
