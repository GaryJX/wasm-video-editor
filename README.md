# Tiny Video Editor

Browser-only MP4 speed-up + burned-in timer, powered by ffmpeg.wasm. Files never leave your machine.

```sh
npm install
npm run dev      # open http://localhost:5173
```

- **Speed**: any factor 0.25–100×. Audio is tempo-shifted with pitch kept; untick to drop it.
- **Timer**: shows *source* time, so it speeds up with the video (12s clip at 4× → 3s, timer still ends at 00:12).
- **Fonts**: TTFs in `public/fonts`; add one there and list it in `src/fonts.js`.
- `npm run smoke` runs the ffmpeg args through the same wasm core in Node and writes frames to `/tmp/vidspeed-smoke`.

Limits: single-threaded wasm encode (roughly real-time or slower for 1080p); inputs over ~1.5 GB may run out of wasm memory.
