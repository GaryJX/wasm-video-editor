import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { buildArgs, formatTime } from './buildArgs.js';
import { FONTS } from './fonts.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(
  ['file', 'drop', 'previewWrap', 'preview', 'overlay', 'meta', 'speed', 'fps', 'keepAudio', 'timerOn',
    'timerOpts', 'font', 'format', 'position', 'size', 'color', 'box', 'export', 'progressWrap', 'progress',
    'status', 'cancel', 'error', 'result', 'output', 'download'].map((id) => [id, $(id)]),
);

// Site root: '/' locally, '/<repo>/' on GitHub Pages (set via BASE_PATH at build time).
const BASE = import.meta.env.BASE_URL;

let file = null;
let ffmpeg = null;
let outputUrl = null;

// ---- Fonts: register each TTF for the CSS preview, fill the picker ----
for (const f of FONTS) {
  document.fonts.add(new FontFace(f.family, `url(${BASE}fonts/${f.file})`));
  els.font.add(new Option(f.label, f.id));
}
const currentFont = () => FONTS.find((f) => f.id === els.font.value);

// ---- File selection ----
els.file.addEventListener('change', () => els.file.files[0] && loadFile(els.file.files[0]));
els.drop.addEventListener('dragover', (e) => { e.preventDefault(); els.drop.classList.add('over'); });
els.drop.addEventListener('dragleave', () => els.drop.classList.remove('over'));
els.drop.addEventListener('drop', (e) => {
  e.preventDefault();
  els.drop.classList.remove('over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

function loadFile(f) {
  file = f;
  URL.revokeObjectURL(els.preview.src);
  els.preview.src = URL.createObjectURL(f);
  els.drop.hidden = true;
  els.previewWrap.hidden = false;
  els.export.disabled = false;
  els.error.textContent = '';
}

function renderMeta() {
  const v = els.preview;
  if (!v.duration) return;
  const outDur = v.duration / speed();
  els.meta.textContent =
    `${file.name} · ${v.videoWidth}×${v.videoHeight} · ${v.duration.toFixed(1)}s → ${outDur.toFixed(1)}s at ${speed()}× · ` +
    `${(file.size / 1e6).toFixed(1)} MB`;
  els.meta.innerHTML += ' · <a href="#" id="change">change file</a>';
  $('change').onclick = (e) => { e.preventDefault(); els.file.click(); };
}
els.preview.addEventListener('loadedmetadata', () => { renderMeta(); updatePreview(); });

// ---- Live preview: playback rate + CSS overlay that mirrors the drawtext output ----
const speed = () => Math.max(0.25, Number(els.speed.value) || 1);
const sizePct = () => Number(els.size.value) / 100;

function updatePreview() {
  const v = els.preview;
  v.playbackRate = Math.min(speed(), 16); // browsers cap playbackRate at 16
  els.timerOpts.classList.toggle('disabled', !els.timerOn.checked);

  const o = els.overlay;
  o.hidden = !els.timerOn.checked || !v.videoHeight;
  if (o.hidden) return;
  const fontPx = v.clientHeight * sizePct();
  const margin = fontPx * 0.5;
  o.style.fontFamily = currentFont().family;
  o.style.fontSize = `${fontPx}px`;
  o.style.color = els.color.value;
  o.style.padding = els.box.checked ? `${fontPx * 0.25}px` : '0';
  o.classList.toggle('boxed', els.box.checked);
  o.classList.toggle('outlined', !els.box.checked);
  const [vert, horiz] = els.position.value.split('-');
  // The box padding sits outside the text in ffmpeg, so offset by it to line up.
  const edge = `${margin - (els.box.checked ? fontPx * 0.25 : 0)}px`;
  o.style.top = vert === 'top' ? edge : '';
  o.style.bottom = vert === 'bottom' ? edge : '';
  o.style.left = horiz === 'left' ? edge : '';
  o.style.right = horiz === 'right' ? edge : '';
  o.textContent = formatTime(v.currentTime || 0, els.format.value);
}

for (const el of [els.speed, els.timerOn, els.font, els.format, els.position, els.size, els.color, els.box]) {
  el.addEventListener('input', updatePreview);
}
els.speed.addEventListener('input', renderMeta);
els.preview.addEventListener('timeupdate', updatePreview);
els.preview.addEventListener('ratechange', () => {
  // Keep the native controls from silently resetting our rate.
  if (els.preview.playbackRate !== Math.min(speed(), 16)) updatePreview();
});
new ResizeObserver(updatePreview).observe(els.preview);
(function tick() { if (!els.preview.paused) updatePreview(); requestAnimationFrame(tick); })();

// ---- Export ----
async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  setStatus('Loading ffmpeg.wasm (~30 MB, first time only)…');
  const ff = new FFmpeg();
  const base = new URL(`${BASE}ffmpeg/`, location.href).href;
  await ff.load({
    coreURL: await toBlobURL(`${base}ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpeg = ff;
  return ff;
}

function setStatus(text, progress) {
  els.status.textContent = text;
  if (progress === undefined) els.progress.removeAttribute('value');
  else els.progress.value = progress;
}

els.export.addEventListener('click', async () => {
  const v = els.preview;
  els.export.disabled = true;
  els.progressWrap.hidden = false;
  els.error.textContent = '';
  const tail = []; // recent ffmpeg log lines, shown on failure

  try {
    const ff = await getFFmpeg();
    const ext = file.name.split('.').pop() || 'mp4';
    const input = `input.${ext}`;
    await ff.writeFile(input, await fetchFile(file));

    let timer = null;
    if (els.timerOn.checked) {
      const font = currentFont();
      await ff.writeFile(font.file, await fetchFile(`${BASE}fonts/${font.file}`));
      timer = {
        fontFile: font.file,
        format: els.format.value,
        position: els.position.value,
        fontSize: Math.max(8, Math.round(v.videoHeight * sizePct())),
        color: els.color.value.replace('#', '0x'),
        box: els.box.checked,
      };
    }

    const outDur = v.duration / speed();
    const onLog = ({ message }) => {
      tail.push(message);
      if (tail.length > 20) tail.shift();
      // ffmpeg's own progress line: "... time=00:00:03.20 ..." (output timeline)
      const m = message.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m && outDur) {
        const t = +m[1] * 3600 + +m[2] * 60 + +m[3];
        setStatus(`Encoding… ${Math.round((t / outDur) * 100)}%`, Math.min(1, t / outDur));
      }
    };
    ff.on('log', onLog);
    setStatus('Encoding…', 0);

    const args = buildArgs({
      input, output: 'output.mp4', speed: speed(), fps: Number(els.fps.value),
      keepAudio: els.keepAudio.checked, timer,
    });
    const rc = await ff.exec(args);
    ff.off('log', onLog);
    if (rc !== 0) throw new Error(`ffmpeg exited with code ${rc}\n${tail.slice(-8).join('\n')}`);

    const data = await ff.readFile('output.mp4');
    await ff.deleteFile(input);
    await ff.deleteFile('output.mp4');

    URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    els.output.src = outputUrl;
    els.download.href = outputUrl;
    els.download.download = `${file.name.replace(/\.[^.]+$/, '')}-${speed()}x.mp4`;
    els.result.hidden = false;
    els.progressWrap.hidden = true;
    els.result.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    if (!String(err?.message).includes('terminate')) {
      els.error.textContent = `Export failed: ${err?.message ?? err}`;
      console.error(err);
    }
    els.progressWrap.hidden = true;
  } finally {
    els.export.disabled = false;
  }
});

els.cancel.addEventListener('click', () => {
  // terminate() kills the worker; the next export reloads ffmpeg.
  ffmpeg?.terminate();
  ffmpeg = null;
  els.progressWrap.hidden = true;
  els.export.disabled = false;
});
