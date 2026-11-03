// Builds the ffmpeg CLI args for speed-up + optional burned-in timer.
// Shared by the browser (ffmpeg.wasm) and scripts/smoke-test.mjs (native ffmpeg).

// drawtext expansions. `t` is the *source* timestamp because drawtext runs
// before the speed-up, so the timer always shows real elapsed time and
// races along with the sped-up footage.
const two = (expr) => `%{eif\\:${expr}\\:d\\:2}`;
const C = '\\:'; // literal colon inside drawtext text
export const TIMER_FORMATS = {
  'mm:ss': () => `${two('floor(t/60)')}${C}${two('mod(floor(t)\\,60)')}`,
  'hh:mm:ss': () =>
    `${two('floor(t/3600)')}${C}${two('mod(floor(t/60)\\,60)')}${C}${two('mod(floor(t)\\,60)')}`,
  'mm:ss.cc': () =>
    `${two('floor(t/60)')}${C}${two('mod(floor(t)\\,60)')}.${two('mod(floor(t*100)\\,100)')}`,
  seconds: () => `%{eif\\:floor(t)\\:d}s`,
};

const POSITIONS = {
  'top-left': ['M', 'M'],
  'top-right': ['w-tw-M', 'M'],
  'bottom-left': ['M', 'h-th-M'],
  'bottom-right': ['w-tw-M', 'h-th-M'],
};

// atempo accepts 0.5..2 per instance on older builds, so chain it.
function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s > 2) { parts.push('atempo=2'); s /= 2; }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  parts.push(`atempo=${s.toFixed(6)}`);
  return parts.join(',');
}

/**
 * @param {object} o
 * @param {string} o.input  input filename
 * @param {string} o.output output filename
 * @param {number} o.speed  speed-up factor (e.g. 2 = twice as fast)
 * @param {number} o.fps    output frame rate
 * @param {boolean} o.keepAudio
 * @param {null|{fontFile:string,format:string,position:string,fontSize:number,color:string,box:boolean}} o.timer
 */
export function buildArgs({ input, output, speed, fps, keepAudio, timer }) {
  const vf = ['setpts=PTS-STARTPTS'];
  if (timer) {
    const [x, y] = POSITIONS[timer.position];
    const margin = Math.round(timer.fontSize * 0.5);
    const text = TIMER_FORMATS[timer.format]();
    let dt =
      `drawtext=fontfile=${timer.fontFile}:text='${text}'` +
      `:fontsize=${timer.fontSize}:fontcolor=${timer.color}` +
      `:x=${x.replaceAll('M', margin)}:y=${y.replaceAll('M', margin)}`;
    if (timer.box) dt += `:box=1:boxcolor=black@0.5:boxborderw=${Math.round(timer.fontSize * 0.25)}`;
    else dt += ':borderw=2:bordercolor=black@0.8';
    vf.push(dt);
  }
  vf.push(`setpts=PTS/${speed}`, `fps=${fps}`);

  const args = ['-i', input, '-vf', vf.join(',')];
  if (keepAudio) args.push('-af', atempoChain(speed), '-c:a', 'aac', '-b:a', '128k');
  else args.push('-an');
  args.push(
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', output,
  );
  return args;
}

const pad = (n) => String(Math.floor(n)).padStart(2, '0');
/** Same output as TIMER_FORMATS, in JS, for the live preview overlay. */
export function formatTime(t, format) {
  switch (format) {
    case 'mm:ss': return `${pad(t / 60)}:${pad(t % 60)}`;
    case 'hh:mm:ss': return `${pad(t / 3600)}:${pad((t / 60) % 60)}:${pad(t % 60)}`;
    case 'mm:ss.cc': return `${pad(t / 60)}:${pad(t % 60)}.${pad((t * 100) % 100)}`;
    case 'seconds': return `${Math.floor(t)}s`;
  }
}
