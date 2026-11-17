// Neon Harbor — hand-in program for make.fun's gta6-01 bounty.
//
// The game itself is the static site under game/ (open game/index.html in a
// browser and play; it loads nothing from the network). This program is the
// courier: it validates the entry against the gate's published caps, copies
// game/ and screenshots/ into the output directory, and writes dossier.json
// with the kit's vendored library (vendor/makefun-game.ts, untouched) so the
// judges read exactly the bytes this repository contains.
//
// Run locally the same way the grader does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import {
  cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, mirrored here so a bad entry fails loudly on my machine
// instead of quietly in the grader.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message: string): never {
  throw new Error(`neon-harbor hand-in: ${message}`);
}

function walk(dir: string, base: string, files: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) walk(full, rel, files);
    else files.push(rel);
  }
}

function validateEntry(): void {
  const gameDir = join(repoRoot, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  const files: string[] = [];
  walk(gameDir, '', files);
  if (files.length > CAPS.game_max_files) {
    fail(`game/ holds ${files.length} files, over the ${CAPS.game_max_files} cap`);
  }
  let bytes = 0;
  for (const rel of files) {
    if (Buffer.byteLength(rel, 'utf8') > CAPS.game_path_max_bytes) {
      fail(`game/${rel} has a path over ${CAPS.game_path_max_bytes} bytes`);
    }
    bytes += statSync(join(gameDir, rel)).size;
  }
  if (bytes > CAPS.game_max_bytes) fail(`game/ is ${bytes} bytes, over the cap`);

  const shotsDir = join(repoRoot, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((n) => !n.startsWith('.'))
    : [];
  if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
    fail(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > CAPS.screenshots.max_bytes) {
      fail(`screenshots/${name} is ${size} bytes, over ${CAPS.screenshots.max_bytes}`);
    }
  }
}

validateEntry();

// Start from an empty output directory so two runs write identical bytes.
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, CAPS));
