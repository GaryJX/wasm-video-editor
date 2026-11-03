// Unit tests for buildArgs / TIMER_FORMATS (pure string building, no ffmpeg needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArgs, TIMER_FORMATS } from '../src/buildArgs.js';

const base = { input: 'in.mp4', output: 'out.mp4', speed: 2, fps: 30, keepAudio: true, timer: null };
const timer = { fontFile: 'f.ttf', format: 'mm:ss', position: 'bottom-right', fontSize: 40, color: '0xffffff', box: true };
const opt = (args, flag) => args[args.indexOf(flag) + 1];

test('buildArgs_noTimer_vfSpeedsUpAndSetsFps', () => {
  // Arrange/Act
  const args = buildArgs({ ...base, speed: 4, fps: 24 });
  // Assert
  assert.equal(opt(args, '-vf'), 'setpts=PTS-STARTPTS,setpts=PTS/4,fps=24');
});

test('buildArgs_inputAndOutput_placedFirstAndLast', () => {
  const args = buildArgs(base);
  assert.deepEqual(args.slice(0, 2), ['-i', 'in.mp4']);
  assert.equal(args.at(-1), 'out.mp4');
});

for (const [speed, expected] of [
  [1, 'atempo=1.000000'],
  [2, 'atempo=2.000000'],
  [8, 'atempo=2,atempo=2,atempo=2.000000'],
  [3, 'atempo=2,atempo=1.500000'],
  [0.25, 'atempo=0.5,atempo=0.500000'],
]) {
  test(`buildArgs_keepAudio_speed${speed}_chainsAtempo`, () => {
    const args = buildArgs({ ...base, speed });
    assert.equal(opt(args, '-af'), expected);
    assert.equal(opt(args, '-c:a'), 'aac');
  });
}

test('buildArgs_dropAudio_usesAnAndNoAf', () => {
  const args = buildArgs({ ...base, keepAudio: false });
  assert.ok(args.includes('-an'));
  assert.ok(!args.includes('-af'));
});

test('buildArgs_timer_drawtextRunsAfterFrameDropWithSourceTime', () => {
  // Arrange/Act
  const vf = opt(buildArgs({ ...base, speed: 3, timer }), '-vf');
  // Assert: drawtext only sees kept frames, and scales `t` back to source time.
  assert.ok(vf.startsWith('setpts=PTS-STARTPTS,setpts=PTS/3,fps=30,drawtext='));
  assert.ok(vf.includes(`text='${TIMER_FORMATS['mm:ss']('t*3')}'`));
});

test('buildArgs_noHeight_noScaleAndNoFastDecode', () => {
  const args = buildArgs(base);
  assert.doesNotMatch(opt(args, '-vf'), /scale=/);
  assert.ok(!args.includes('-skip_loop_filter'));
});

test('buildArgs_height_scalesWithoutUpscalingAndEnablesFastDecode', () => {
  // Arrange/Act
  const args = buildArgs({ ...base, height: 720 });
  // Assert
  assert.equal(opt(args, '-vf'), 'setpts=PTS-STARTPTS,setpts=PTS/2,fps=30,scale=-2:min(720\\,ih):flags=bilinear');
  assert.deepEqual(args.slice(0, 4), ['-skip_loop_filter', 'all', '-i', 'in.mp4']);
});

test('buildArgs_heightAndTimer_scaleRunsBeforeDrawtext', () => {
  const vf = opt(buildArgs({ ...base, height: 480, timer }), '-vf');
  assert.ok(vf.indexOf('scale=') < vf.indexOf('drawtext='));
});

test('buildArgs_timer_includesFontSizeColorAndText', () => {
  const vf = opt(buildArgs({ ...base, timer }), '-vf');
  assert.match(vf, /fontfile=f\.ttf/);
  assert.match(vf, /fontsize=40:fontcolor=0xffffff/);
  assert.ok(vf.includes(`text='${TIMER_FORMATS['mm:ss']('t*2')}'`));
});

for (const [position, x, y] of [
  ['top-left', '20', '20'],
  ['top-right', 'w-tw-20', '20'],
  ['bottom-left', '20', 'h-th-20'],
  ['bottom-right', 'w-tw-20', 'h-th-20'],
]) {
  test(`buildArgs_timer_${position}_marginIsHalfFontSize`, () => {
    const vf = opt(buildArgs({ ...base, timer: { ...timer, position } }), '-vf');
    assert.ok(vf.includes(`:x=${x}:y=${y}`), vf);
  });
}

test('buildArgs_timerBox_addsBoxWithQuarterFontPadding', () => {
  const vf = opt(buildArgs({ ...base, timer }), '-vf');
  assert.match(vf, /:box=1:boxcolor=black@0\.5:boxborderw=10/);
  assert.doesNotMatch(vf, /borderw=2/);
});

test('buildArgs_timerNoBox_addsOutlineInstead', () => {
  const vf = opt(buildArgs({ ...base, timer: { ...timer, box: false } }), '-vf');
  assert.match(vf, /:borderw=2:bordercolor=black@0\.8/);
  assert.doesNotMatch(vf, /box=1/);
});

test('buildArgs_video_encodesH264Yuv420Faststart', () => {
  const args = buildArgs(base);
  assert.equal(opt(args, '-c:v'), 'libx264');
  assert.equal(opt(args, '-pix_fmt'), 'yuv420p');
  assert.equal(opt(args, '-movflags'), '+faststart');
});

test('TIMER_FORMATS_allFormats_escapeColonsAndCommas', () => {
  for (const [name, fn] of Object.entries(TIMER_FORMATS)) {
    const text = fn('t*2.5');
    // Unescaped ':' or ',' would split the drawtext option / filter chain.
    assert.doesNotMatch(text, /(?<!\\)[:,]/, name);
    assert.ok(text.includes('%{eif'), name);
  }
});

test('TIMER_FORMATS_keys_matchUiFormats', () => {
  assert.deepEqual(Object.keys(TIMER_FORMATS), ['mm:ss', 'hh:mm:ss', 'mm:ss.cc', 'seconds']);
});
