// config.js — Neon Harbor: every world constant, tuning value and name lives here.
// The city is Port Solano, an original sun-soaked harbour city. Nothing in this
// file (or this game) comes from any commercial game: all names are invented.
'use strict';
window.NH = window.NH || {};

NH.CONFIG = {
  // World seed: the city is generated deterministically so every player (and
  // every screenshot) sees the same Port Solano.
  seed: 20261117,

  // City grid: blocks of BLOCK metres separated by roads of ROAD metres.
  // Road centre lines sit at multiples of PITCH from -HALF..HALF.
  gridCount: 6,          // roads per axis (0..5)
  block: 46,             // building block size (m)
  road: 14,              // road width (m)
  get pitch() { return this.block + this.road; },
  get half() { return (this.gridCount - 1) * this.pitch / 2 + this.road / 2; },

  // Player tuning
  walkSpeed: 6.2,
  sprintSpeed: 9.4,
  playerRadius: 0.55,
  playerHealth: 100,

  // Traffic / population
  trafficCount: 26,
  parkedCount: 30,
  pedCount: 30,
  pedSpeed: 1.6,

  // Wanted system
  wantedDecaySeconds: 14,   // unseen time per star lost
  bustSeconds: 2.6,         // standing near a cop on foot while wanted = busted
  fineBase: 150,

  // Combat
  gunDamage: 34,
  gunRange: 60,
  gunCooldown: 0.16,
  thugHealth: 70,

  // Economy
  stealCarBonus: 25,
  deliveryBasePay: 120,

  saveKey: 'neon-harbor-save-v1',
};

// Paint palettes (hex). Cars get a body colour from CAR_COLORS; police and
// taxis use their own liveries in vehicles.js.
NH.CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b93c, 0x3fae6a, 0xe6e6e6, 0x23272e,
  0x7a4fd0, 0xd96c2c, 0x2ca8a0, 0x8c9299, 0x5b3a29, 0xb03a5e];
NH.PED_SHIRTS = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0xe67e22, 0x9b59b6,
  0xecf0f1, 0x1abc9c, 0xfd79a8, 0x95a5a6];
NH.PED_PANTS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037, 0x212f3c, 0x6c3483];
NH.SKIN_TONES = [0xf2c89b, 0xd9a066, 0xb07a45, 0x8a5a2b, 0x6e4420, 0xf7d7b0];

// Building facade colours for the sun-bleached downtown look.
NH.BUILDING_COLORS = [0xf2e3c6, 0xe8cfa3, 0xd9b48c, 0xc9d6d5, 0xa8c3bc, 0xf0b8a0,
  0xd98c8c, 0xbfd9e8, 0xe6ddc3, 0xcfc4e8, 0xf5f0e1, 0x9fb8ad];

// District names placed around the map (used by the HUD location line).
NH.DISTRICTS = [
  { name: 'Marina Row', x: -120, z: 150 },
  { name: 'Old Market', x: 0, z: 60 },
  { name: 'Café Quarter', x: 130, z: 40 },
  { name: 'Pier Nine', x: -160, z: -40 },
  { name: 'Solano Heights', x: 90, z: -130 },
  { name: 'The Docks', x: -60, z: -170 },
  { name: 'Lumen Square', x: 20, z: -20 },
];
