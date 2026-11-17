// take-screenshots.mjs — drives Neon Harbor in headless Chromium and captures
// the four entry screenshots. The game exposes ?shot=<name> setups (see
// game/src/main.js) and raises window.__NH_SHOT_READY when the staged frame
// is on screen; every capture is a real render of the running game.
//
//   node take-screenshots.mjs [shot ...]     (default: all four)

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire('/home/hatch/workspace/tools/puppeteer/package.json');
const puppeteer = require('puppeteer');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(repoRoot, 'game', path === '/' ? 'index.html' : path);
  try {
    const data = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const SHOTS = [
  { name: 'cover', file: '1-cover.jpg' },
  { name: 'start', file: '2-start.jpg' },
  { name: 'mission', file: '3-mission.jpg' },
  { name: 'chase', file: '4-chase.jpg' },
];
const wanted = process.argv.slice(2);
const shots = wanted.length ? SHOTS.filter((s) => wanted.includes(s.name)) : SHOTS;

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio',
  ],
});
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => { console.error(`[pageerror] ${e.message}`); failed = true; });
  page.on('console', (m) => {
    // The favicon 404 is a resource error, not a game error.
    if (m.type() === 'error' && !m.text().includes('404')) {
      console.error(`[console] ${m.text()}`); failed = true;
    }
  });
  for (const shot of shots) {
    const url = `http://127.0.0.1:${port}/index.html?shot=${shot.name}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    // Headless Chromium here renders in software (~2.5 fps at 720p), so the
    // staged 70 frames take a while; on a real GPU this is instant.
    await page.waitForFunction('window.__NH_SHOT_READY === true', { timeout: 240000 });
    await new Promise((r) => setTimeout(r, 350));
    const out = join(repoRoot, 'screenshots', shot.file);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    const kb = Math.round(statSync(out).size / 1024);
    console.log(`${shot.file}: ${kb} KiB ${kb > 256 ? '— OVER THE 256 KiB CAP' : ''}`);
    if (kb > 256) failed = true;
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
