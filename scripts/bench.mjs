// Times buildArgs() variants through the ffmpeg.wasm core (single thread, like the browser).
// Usage: node scripts/bench.mjs [height ...]   e.g. `node scripts/bench.mjs 0 720 480` (0 = original)
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildArgs } from '../src/buildArgs.js';

globalThis.self = globalThis;
globalThis.location = { href: import.meta.url };
const require = createRequire(import.meta.url);
const createCore = require('@ffmpeg/core');
const wasmBinary = readFileSync(require.resolve('@ffmpeg/core/wasm'));

const tmp = '/tmp/vidspeed-smoke';
const src = `${tmp}/bench-1080p.mp4`;
mkdirSync(tmp, { recursive: true });
if (!existsSync(src)) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=20',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', src]);
}

const heights = process.argv.slice(2).map(Number);
for (const height of heights.length ? heights : [0]) {
  const core = await createCore({ wasmBinary, print: () => {}, printErr: () => {} });
  core.FS.writeFile('in.mp4', readFileSync(src));
  core.FS.writeFile('font.ttf', readFileSync('public/fonts/Orbitron.ttf'));
  const outH = height || 1080;
  const args = buildArgs({
    input: 'in.mp4', output: 'out.mp4', speed: 4, fps: 30, keepAudio: true, height: height || null,
    timer: { fontFile: 'font.ttf', format: 'mm:ss', position: 'bottom-right', fontSize: Math.round(outH * 0.07), color: 'white', box: true },
  });
  const start = performance.now();
  const rc = core.exec(...args);
  const secs = (performance.now() - start) / 1000;
  console.log(`${height ? `${height}p` : 'original'}: ${secs.toFixed(1)}s (rc ${rc}, ${(core.FS.readFile('out.mp4').length / 1e6).toFixed(1)} MB)`);
}
