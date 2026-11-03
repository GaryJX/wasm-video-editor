// Runs buildArgs() through the same ffmpeg.wasm core the browser uses.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildArgs, TIMER_FORMATS } from '../src/buildArgs.js';

// The core is a web-targeted emscripten build; give it the globals it expects.
globalThis.self = globalThis;
globalThis.location = { href: import.meta.url };
const require = createRequire(import.meta.url);
const createCore = require('@ffmpeg/core');
const wasmBinary = readFileSync(require.resolve('@ffmpeg/core/wasm'));
const tmp = '/tmp/vidspeed-smoke';
mkdirSync(tmp, { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=12',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', `${tmp}/in.mp4`]);

for (const format of Object.keys(TIMER_FORMATS)) {
  const core = await createCore({ wasmBinary });
  const log = [];
  core.setLogger(({ message }) => log.push(message));
  core.FS.writeFile('in.mp4', readFileSync(`${tmp}/in.mp4`));
  core.FS.writeFile('font.ttf', readFileSync('public/fonts/Orbitron.ttf'));
  const args = buildArgs({
    input: 'in.mp4', output: 'out.mp4', speed: 4, fps: 30, keepAudio: true,
    timer: { fontFile: 'font.ttf', format, position: 'bottom-right', fontSize: 36, color: 'white', box: true },
  });
  const rc = core.exec(...args);
  if (rc !== 0) { console.error(log.slice(-15).join('\n')); process.exit(1); }
  const out = `${tmp}/out-${format.replaceAll(':', '_')}.mp4`;
  writeFileSync(out, core.FS.readFile('out.mp4'));
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2.5', '-i', out, '-frames:v', '1', `${out}.png`]);
  console.log(format, 'rc', rc, 'duration', dur, '->', `${out}.png`);
}
