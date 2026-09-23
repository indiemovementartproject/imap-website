/*
 * Media engine: ffmpeg.wasm, for audio, video, animation and the long tail of
 * image formats the browser cannot decode (PSD, EXR, DDS, JPEG XL, TGA...).
 *
 * The core is 31 MB, so it is never loaded up front. It starts downloading the
 * moment someone picks a file that needs it, in the background, so it is
 * usually ready by the time they have chosen a format.
 *
 * Where the core comes from:
 *   - ./core/ next to the app, when present (the Mac app, and local dev)
 *   - jsDelivr otherwise (the website - 31 MB does not belong in the repo)
 */
import { FFmpeg } from '../lib/ffmpeg/index.js';
import { fetchFile } from '../lib/util/index.js';

/*
 * TWO BUILDS OF THE SAME ENGINE, chosen per browser.
 *
 *   multithreaded   Chrome, Edge, Firefox. Needs SharedArrayBuffer, so the page
 *                   must be cross-origin isolated (coi.js does that on GitHub
 *                   Pages). x264 runs ~2.5x faster than single-threaded.
 *   single-threaded Safari, every iPhone browser, and the Mac app - anything on
 *                   WebKit. No threads, no SharedArrayBuffer, no isolation.
 *
 * WHY WEBKIT GETS THE SLOWER ONE. The multithreaded build passes all 161
 * conversion tests in Chrome. Inside WebKit it hung intermittently, at a
 * different step each run - mid-encode, after a probe, before a file write -
 * past guards that should have caught it. Hangs that move are not a codec bug
 * to work around; they are WebKit's WebAssembly-threads support. A build with
 * no threads cannot hit them. Slower and dependable beats fast and occasionally
 * frozen - and it also means Safari users never need the one-time reload.
 */
const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const WEBKIT = (typeof window !== 'undefined' && !!window.AnyConvertNative)   /* the Mac app */
  || /iPhone|iPad|iPod/.test(UA)                                                  /* every iOS browser */
  || (/Macintosh/.test(UA) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) /* iPadOS */
  || (/Safari\//.test(UA) && !/Chrome|Chromium|Edg|OPR|Firefox|FxiOS|CriOS/.test(UA));    /* Mac Safari */

const THREADED = !WEBKIT;
const CDN = THREADED
  ? 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm'
  : 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const LOCAL = new URL(THREADED ? '../core' : '../core-st', import.meta.url).href;

/** Which build is in use - shown nowhere, but useful when a report comes in. */
export const engineKind = () => (THREADED ? 'multithreaded' : 'single-threaded');

let ff = null;
let loading = null;
let logTail = [];
let urls = null;            /* the three core files as blob URLs - fetched once, reused */
let dirty = false;          /* true once this instance has run a real job */
let lastActivity = 0;       /* last log line or progress tick, for the watchdog */

/** The last few hundred lines ffmpeg printed - for error messages and debugging. */
export const lastLog = () => logTail.slice();

/** True when the multithreaded core can run (needs cross-origin isolation). */
export const canThread = () => typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
/* single-threaded needs no isolation at all */
const canRun = () => !THREADED || canThread();

async function coreBase() {
  /* a local copy only exists in development and inside the Mac app, both
     served from this machine - on the website, don't even ask */
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return CDN;
  try {
    const r = await fetch(LOCAL + '/ffmpeg-core.wasm', { method: 'HEAD' });
    if (r.ok) return LOCAL;
  } catch (e) { /* fall through */ }
  return CDN;
}

/**
 * Fetch a file into a blob: URL, reporting bytes as they arrive.
 *
 * Not @ffmpeg/util's toBlobURL: with progress on, it compares the bytes it
 * read against Content-Length - but jsDelivr serves the engine compressed,
 * so Content-Length is the COMPRESSED size and never matches. It then
 * "falls back" to re-reading a body it has already consumed, and every
 * first visit to the website failed with "body stream already read". The
 * local copy is served uncompressed, which is why no local test caught it.
 */
async function blobURL(url, type, onBytes) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not download the converter (${r.status}). Check your connection and try again.`);
  let parts;
  if (onBytes && r.body) {
    parts = [];
    const reader = r.body.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      received += value.length;
      onBytes({ received });
    }
  } else {
    parts = [await r.arrayBuffer()];
  }
  return URL.createObjectURL(new Blob(parts, { type }));
}

/**
 * An engine instance that has not run a job yet.
 *
 * WHY A FRESH ONE EVERY JOB. The multithreaded ffmpeg.wasm core carries
 * state between runs that it should not: a particular mix of codecs
 * (MP3, AAC, ALAC, FLAC and Vorbis, then Opus) deadlocks the eighth call
 * with no output at all. Capping threads does not help; the same codec
 * repeated fourteen times never trips it. Rather than chase which pair of
 * codecs poisons which, every conversion gets an instance nothing else has
 * touched, and the instance is retired afterwards.
 *
 * WHY NOT A WARM SPARE. Each instance reserves a fixed 1 GB of shared
 * memory and pre-spawns 32 worker threads. Two at once is 2 GB, which a
 * phone will not give a tab. So: one at a time, and the 31 MB download is
 * cached, so a fresh instance costs a recompile (~0.7 s), not a re-download.
 * The app starts one the moment a file is picked, so it is normally ready.
 *
 * `onStatus(fraction, label)` reports the one-time download.
 */
export function ensureFF(onStatus = () => {}) {
  if (ff && !dirty) return Promise.resolve(ff);
  if (dirty) retire();
  if (loading) return loading;
  loading = (async () => {
    if (!canRun()) {
      throw new Error('This browser is not letting the converter use threads. Reload the page once - '
        + 'AnyConvert switches that on the first time it runs.');
    }
    if (!urls) {
      const base = await coreBase();
      const local = base === LOCAL;
      onStatus(0, local ? 'Starting the converter…' : 'Downloading the converter (31 MB, once)…');
      const TOTAL = 32_700_000;
      const track = ({ received }) => { if (received) onStatus(Math.min(0.98, received / TOTAL), null); };
      const [coreURL, wasmURL, workerURL] = await Promise.all([
        blobURL(base + '/ffmpeg-core.js', 'text/javascript'),
        blobURL(base + '/ffmpeg-core.wasm', 'application/wasm', local ? null : track),
        THREADED ? blobURL(base + '/ffmpeg-core.worker.js', 'text/javascript') : Promise.resolve(null),
      ]);
      urls = THREADED ? { coreURL, wasmURL, workerURL } : { coreURL, wasmURL };
    } else {
      onStatus(0.99, 'Starting the converter…');
    }

    const inst = new FFmpeg();
    inst.on('log', ({ message }) => {
      lastActivity = performance.now();
      logTail.push(message);
      if (logTail.length > 400) logTail.splice(0, logTail.length - 400);
    });
    await inst.load(urls);
    onStatus(1, 'Ready');
    ff = inst;
    dirty = false;
    return inst;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** Throw the current instance away. The next ensureFF() builds a new one. */
function retire() {
  if (ff) { try { ff.terminate(); } catch (e) { /* already dead */ } }
  ff = null; loading = null; dirty = false;
}

/** Call when a real job finishes, pass or fail: the instance is spent. */
function spent() { dirty = true; }

/* Work done on behalf of ANOTHER engine (WebP for the image engine on Safari)
   runs many small encodes of one codec on one instance - which is safe; it is
   mixing codecs that poisons it. So it does not retire per encode. The router
   calls finishJob() once the whole user-facing job is over. */
let touched = false;
export function finishJob() { if (touched) { touched = false; spent(); } }

/** PNG in, WebP out, via libwebp. For browsers whose canvas cannot write WebP. */
export async function encodeWebP(png, quality = 0.9) {
  await ensureFF();
  touched = true;
  const inName = await put(png, 'png');
  const outName = tmp('webp');
  try {
    await run(['-i', inName, '-frames:v', '1', '-c:v', 'libwebp', '-q:v', String(Math.round(quality * 100)),
               '-f', 'webp', outName]);
    return new Blob([await take(outName)], { type: 'image/webp' });
  } finally {
    if (ff) await drop(inName, outName);
  }
}

/* ------------------------------------------------------------------ */
/* Files in and out of ffmpeg's in-memory filesystem                   */
/* ------------------------------------------------------------------ */

let seq = 0;
const tmp = ext => `f${++seq}.${ext}`;

async function put(file, ext) {
  const name = tmp(ext);
  await ff.writeFile(name, await fetchFile(file));
  return name;
}

async function take(name) {
  const data = await ff.readFile(name);
  try { await ff.deleteFile(name); } catch (e) { /* already gone */ }
  return data;
}

async function drop(...names) {
  for (const n of names) { try { await ff.deleteFile(n); } catch (e) { /* ok */ } }
}

/**
 * Run ffmpeg. Throws with the last useful log lines if it fails.
 *
 * `-loglevel info` is explicit because ffprobe's `-v error` leaks into the
 * next ffmpeg run on the same instance - it silenced every later job down to
 * one line, which would leave a failure with no message to show.
 *
 * The watchdog: ffmpeg prints a stats line every half second while it works.
 * If it says nothing at all for 45 s it is not working, it is stuck - kill it
 * rather than leave someone watching a bar that will never move.
 */
const STALL_MS = 45_000;
async function run(args, onProgress) {
  logTail = [];
  lastActivity = performance.now();
  const cb = ({ progress }) => {
    lastActivity = performance.now();
    if (progress >= 0 && progress <= 1) onProgress?.(progress);
  };
  ff.on('progress', cb);
  let timer = 0;
  const stall = new Promise((_, rej) => {
    timer = setInterval(() => {
      if (performance.now() - lastActivity > STALL_MS) {
        clearInterval(timer);
        retire();
        rej(new Error('The converter stopped responding. Please try again - it restarts fresh each time.'));
      }
    }, 2000);
  });
  try {
    const code = await Promise.race([ff.exec(['-hide_banner', '-loglevel', 'info', '-y', ...forBuild(args)]), stall]);
    if (code !== 0) {
      const why = logTail.filter(l => /error|invalid|not |unable|fail|unsupported|could not/i.test(l))
        .slice(-3).join(' · ');
      throw new Error(why || 'The converter could not process this file.');
    }
  } finally {
    clearInterval(timer);
    ff?.off('progress', cb);
  }
}

/* The single-threaded build has no threads to give. Rather than trust every
   encoder to ignore a thread count it cannot honour, drop the options. */
function forBuild(args) {
  if (THREADED) return args;
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-threads' || args[i] === '-filter_threads') { i++; continue; }
    if (args[i] === '-row-mt') { i++; continue; }
    out.push(args[i]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Probing                                                              */
/* ------------------------------------------------------------------ */

/**
 * What is actually in the file: duration, streams, size. Everything the
 * compressor needs to turn a target size into a bitrate.
 */
export async function probe(file, ext) {
  await ensureFF();
  const name = await put(file, ext);
  const out = tmp('json');
  try {
    await ff.ffprobe(['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', name, '-o', out]);
    const txt = new TextDecoder().decode(await take(out));
    const j = JSON.parse(txt || '{}');
    const streams = j.streams || [];
    const v = streams.find(s => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
    const a = streams.find(s => s.codec_type === 'audio');
    const fps = v ? parseRate(v.avg_frame_rate || v.r_frame_rate) : 0;
    return {
      duration: parseFloat(j.format?.duration) || 0,
      bitrate: parseInt(j.format?.bit_rate) || 0,
      video: v ? { codec: v.codec_name, width: v.width, height: v.height, fps } : null,
      audio: a ? { codec: a.codec_name, rate: +a.sample_rate, channels: a.channels,
                   bits: a.bits_per_raw_sample ? +a.bits_per_raw_sample : bitsOf(a.sample_fmt) } : null,
    };
  } finally {
    if (ff) await drop(name, out);
  }
}

function parseRate(r) {
  if (!r) return 0;
  const [n, d] = String(r).split('/').map(Number);
  return d ? n / d : n || 0;
}
function bitsOf(fmt = '') {
  if (/64/.test(fmt)) return 64;
  if (/32|flt/.test(fmt)) return 32;
  if (/24/.test(fmt)) return 24;
  if (/u8/.test(fmt)) return 8;
  return 16;
}

/* ------------------------------------------------------------------ */
/* Conversion                                                           */
/* ------------------------------------------------------------------ */

/**
 * Convert `file` (detected as `src`) into `target`. Returns a Blob.
 */
export async function convert(file, src, target, info, onProgress) {
  await ensureFF();
  const inName = await put(file, src.ext);
  const outName = tmp(target.ext);
  try {
    await run([...inputArgs(src), '-i', inName, ...outputArgs(src, target, info), '-f', muxOf(target), outName], onProgress);
    return new Blob([await take(outName)], { type: target.mime || 'application/octet-stream' });
  } finally {
    if (ff) await drop(inName, outName);
    spent();
  }
}

function inputArgs(src) {
  return src.kind === 'image' && !src.animated ? [] : [];
}

function muxOf(t) {
  if (t.write?.mux) return t.write.mux;
  if (t.write?.anim === 'gif') return 'gif';
  if (t.write?.anim === 'apng') return 'apng';
  if (t.write?.anim === 'webp') return 'webp';
  return 'image2';                                   /* stills */
}

function outputArgs(src, t, info) {
  const w = t.write;

  /* a still picture to GIF: one frame, a palette built from that picture,
     no frame-rate or width limit - those are for clips, not photos */
  if (w.anim === 'gif' && src.kind === 'image' && !src.animated) {
    return ['-vf', 'split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a', '-frames:v', '1'];
  }

  /* animation from a clip: 12 fps, 640 px wide, a real palette for GIF */
  if (w.anim) {
    const scale = 'fps=12,scale=\'min(640,iw)\':-2:flags=lanczos';
    if (w.anim === 'gif') {
      return ['-an', '-vf', `${scale},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`, '-loop', '0'];
    }
    if (w.anim === 'apng') return ['-an', '-vf', scale, '-plays', '0', '-c:v', 'apng'];
    return ['-an', '-vf', scale, '-c:v', 'libwebp_anim', '-q:v', '70', '-loop', '0'];
  }

  /* a still image */
  if (t.kind === 'image') {
    const from = src.kind === 'video' || src.animated;
    const seek = from && info?.duration > 2 ? ['-ss', String((info.duration / 2).toFixed(2))] : [];
    const filters = [];
    if (w.maxSide) filters.push(`scale='min(${w.maxSide},iw)':'min(${w.maxSide},ih)':force_original_aspect_ratio=decrease`);
    if (t.id === 'pgm') filters.push('format=gray');
    if (t.id === 'jpg') filters.push('format=yuvj420p');
    /* -ss after -i is slower but works for every container */
    return [...seek, '-frames:v', '1', ...(filters.length ? ['-vf', filters.join(',')] : []), ...(w.ff || [])];
  }

  /* audio out of anything */
  if (t.kind === 'audio') return ['-vn', ...w.args];

  /* video: an audio-only source can't become video */
  const args = [...w.args];
  if (src.kind === 'image' && src.animated) {
    /* GIF -> video: even dimensions (x264 insists), and no audio to encode */
    return ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', ...stripAudio(args)];
  }
  if (!info?.audio) return [...stripAudio(args), '-an'];
  return args;
}

function stripAudio(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (/^-(c:a|b:a|q:a|ac|ar)$/.test(args[i])) { i++; continue; }
    out.push(args[i]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Compression to a target size                                         */
/* ------------------------------------------------------------------ */

/**
 * Make `file` as close to `target` bytes as it can without going over.
 * Returns { blob, note } - `note` explains what was traded away, in words.
 *
 * Bitrate maths gets within a few percent, but encoders overshoot. So this
 * measures what came out and, if it is over, tries once more with the bitrate
 * scaled by how far it missed. Two passes at most.
 */
export async function compress(file, fmt, target, info, onProgress) {
  await ensureFF();
  try {
    switch (fmt.compress) {
      case 'abr':     return await compressAudio(file, fmt, target, info, onProgress);
      case 'pcm':     return await compressPCM(file, fmt, target, info, onProgress);
      case 'vbr':     return await compressVideo(file, fmt, target, info, onProgress);
      case 'palette': return await compressPalette(file, fmt, target, info, onProgress);
      case 'raster':  return await compressRaster(file, fmt, target, info, onProgress);
      default: throw new Error(`${fmt.label} cannot be compressed here.`);
    }
  } finally {
    spent();       /* several passes share one instance - same codec each time, which is safe */
  }
}

async function attempt(file, fmt, args, onProgress) {
  const inName = await put(file, fmt.ext);
  const outName = tmp(fmt.ext);
  try {
    await run(['-i', inName, ...args, '-f', muxOf(fmt), outName], onProgress);
    return await take(outName);
  } finally {
    if (ff) await drop(inName, outName);
  }
}

/* aim, measure, correct - up to three passes. Most land on the first;
   the older encoders (MPEG-4 Part 2, MPEG-2) treat a bitrate as a
   suggestion and can need the third. Each correction aims a little
   further under than the miss, so it converges instead of oscillating. */
const PASSES = 3;
async function aimed(target, build, onProgress) {
  let factor = 1;
  let best = null;
  for (let pass = 0; pass < PASSES; pass++) {
    const p0 = pass / PASSES;
    const data = await build(factor, f => onProgress?.(p0 + f / PASSES));
    if (!best || data.byteLength < best.byteLength) best = data;
    if (data.byteLength <= target) return { data, passes: pass + 1 };
    factor *= (target / data.byteLength) * (pass === 0 ? 0.94 : 0.88);
  }
  return { data: best, passes: PASSES, over: true };
}

const MAX_KBPS = { libmp3lame: 320, aac: 320, libvorbis: 500, opus: 510, wmav2: 320, ac3: 640, eac3: 1536, mp2: 384 };
const MIN_KBPS = { libmp3lame: 8, aac: 12, libvorbis: 32, opus: 16, wmav2: 24, ac3: 64, eac3: 32, mp2: 32 };

async function compressAudio(file, fmt, target, info, onProgress) {
  const d = info.duration || 1;
  const want = (target * 8 / 1000 / d) * 0.97;
  const codec = fmt.codec;
  const lo = fmt.minKbps || MIN_KBPS[codec] || 8;
  const hi = MAX_KBPS[codec] || 320;

  const { data, over } = await aimed(target, (factor, prog) => {
    const kbps = Math.round(Math.max(lo, Math.min(hi, want * factor)));
    /* at very low rates, mono and a lower sample rate sound far better
       than stereo at full rate squeezed into the same bits */
    const extra = [];
    if (kbps < 64 && codec !== 'ac3' && codec !== 'eac3') extra.push('-ac', '1');
    /* Opus always runs at 48 kHz internally, so resampling it gains nothing */
    if (kbps < 40 && codec !== 'opus' && codec !== 'ac3' && codec !== 'eac3') extra.push('-ar', kbps < 24 ? '16000' : '22050');
    const strict = codec === 'opus' ? ['-strict', '-2'] : [];
    return attempt(file, fmt, ['-vn', '-map_metadata', '0', '-c:a', codec, ...strict, '-b:a', kbps + 'k', ...extra], prog);
  }, onProgress);

  return result(data, fmt, target, over,
    `Re-encoded at about ${Math.round(Math.max(lo, Math.min(hi, want)))} kbps.`);
}

/* uncompressed / lossless audio: size is sample rate x channels x bit depth.
   Walk down that ladder until it fits, best quality first. */
const RATES = [48000, 44100, 32000, 22050, 16000, 11025, 8000];

async function compressPCM(file, fmt, target, info, onProgress) {
  const d = info.duration || 1;
  const a = info.audio || { rate: 44100, channels: 2, bits: 16 };
  const lossless = ['flac', 'alac', 'wv', 'tta'].includes(fmt.id);
  const bitsOpts = fmt.id === 'wav' ? [24, 16, 8] : [24, 16];
  const srcBits = Math.min(24, a.bits || 16), srcCh = Math.min(2, a.channels || 2), srcRate = a.rate || 44100;

  const plans = [];
  for (const ch of [srcCh, 1].filter((v, i, x) => x.indexOf(v) === i)) {
    for (const bits of bitsOpts.filter(b => b <= srcBits)) {
      for (const sr of RATES.filter(r => r <= srcRate)) plans.push({ ch, bits, sr, raw: d * sr * ch * bits / 8 });
    }
  }
  plans.sort((x, y) => y.raw - x.raw);

  const enc = (plan, prog) => attempt(file, fmt,
    ['-vn', '-ac', String(plan.ch), '-ar', String(plan.sr), ...pcmCodec(fmt, plan.bits)], prog);

  /* Raw PCM sizes are exact, so the ladder can be read straight off. Lossless
     codecs are not: how well they pack depends entirely on the material - a
     pure tone packs to ~20% of PCM, dense music to ~65%. Guessing a fixed
     ratio overshot by half on test tones and needlessly downsampled. So encode
     once at the original settings and MEASURE the ratio, then choose. */
  let ratio = 1;
  if (lossless) {
    const first = await enc(plans[0], f => onProgress?.(f * 0.4));
    if (first.byteLength <= target) {
      return result(first, fmt, target, false, `Stays lossless ${fmt.label} at the original quality - repacking alone was enough.`);
    }
    ratio = first.byteLength / plans[0].raw;
  }

  let i = plans.findIndex(p => p.raw * ratio <= target * 0.97);
  if (i < 0) i = plans.length - 1;
  let data = await enc(plans[i], f => onProgress?.((lossless ? 0.4 : 0) + f * (lossless ? 0.4 : 0.8)));
  /* the measured ratio is for the original settings; a downsampled signal
     packs a little differently, so step down once more if it still misses */
  while (data.byteLength > target && i < plans.length - 1) {
    i++;
    data = await enc(plans[i], f => onProgress?.(0.85 + f * 0.15));
  }
  const plan = plans[i];

  const parts = [];
  if (plan.sr < srcRate) parts.push(`${(plan.sr / 1000).toFixed(plan.sr % 1000 ? 1 : 0)} kHz`);
  if (plan.ch < srcCh) parts.push('mono');
  if (plan.bits < srcBits) parts.push(`${plan.bits}-bit`);
  return result(data, fmt, target, data.byteLength > target,
    parts.length ? `Stays lossless ${fmt.label}, reduced to ${parts.join(', ')}.` : `Stays lossless ${fmt.label}.`);
}

function pcmCodec(fmt, bits) {
  const be = ['aiff', 'au'].includes(fmt.id);
  switch (fmt.id) {
    case 'flac': return ['-c:a', 'flac', '-compression_level', '12', '-sample_fmt', bits > 16 ? 's32' : 's16'];
    case 'alac': return ['-c:a', 'alac', '-sample_fmt', bits > 16 ? 's32p' : 's16p'];
    case 'wv':   return ['-c:a', 'wavpack'];
    case 'tta':  return ['-c:a', 'tta'];
  }
  if (bits === 8) return ['-c:a', 'pcm_u8'];
  return ['-c:a', `pcm_s${bits}${be ? 'be' : 'le'}`];
}

async function compressVideo(file, fmt, target, info, onProgress) {
  const d = info.duration || 1;
  const total = (target * 8 / 1000 / d) * 0.96;           /* kbps, 4% for the container */
  const hasA = !!info.audio;
  const aK = hasA ? Math.round(Math.max(32, Math.min(128, total * 0.12))) : 0;
  const vq = fmt.vcodec || 'libx264';
  const ac = fmt.acodec || 'aac';

  if (total - aK < 30) {
    throw new Error(`That is too small for ${fmtDur(d)} of video - under 30 kbps would be unwatchable. `
      + `Try at least ${fmtBytes(Math.ceil((aK + 60) * 1000 / 8 * d / 0.96))}.`);
  }

  const src = info.video || { width: 1280, height: 720, fps: 30 };
  const fps = Math.min(src.fps || 30, 30);

  const { data, over } = await aimed(target, (factor, prog) => {
    const vK = Math.max(30, Math.round((total - aK) * factor));
    /* keep enough bits per pixel to look like video, not soup:
       shrink the frame rather than starve it */
    const bpp = 0.075;
    let h = src.height || 720;
    while (h > 144 && (vK * 1000) / ((src.width * h / (src.height || h)) * h * fps) < bpp) h = Math.round(h * 0.8);
    h = Math.max(144, h - (h % 2));

    const vf = [];
    if (h < (src.height || h)) vf.push(`scale=-2:${h}`);
    if ((src.fps || 30) > 30) vf.push('fps=30');

    const v = vq === 'libx264'
      ? ['-c:v', 'libx264', '-threads', '4', '-preset', 'veryfast', '-b:v', vK + 'k',
         '-maxrate', Math.round(vK * 1.3) + 'k', '-bufsize', vK * 2 + 'k', '-pix_fmt', 'yuv420p']
      : vq === 'libvpx'
        ? ['-c:v', 'libvpx', '-threads', '4', '-b:v', vK + 'k', '-deadline', 'realtime', '-cpu-used', '6']
        /* MPEG-4 Part 2 and MPEG-2 only respect a bitrate if the buffer model
           is set; without -maxrate/-bufsize they drift over by a few percent */
        : ['-c:v', vq, '-b:v', vK + 'k', '-maxrate', vK + 'k', '-bufsize', Math.round(vK * 1.5) + 'k',
           ...(vq === 'mpeg4' ? ['-vtag', 'xvid'] : [])];
    const a = hasA ? ['-c:a', ac, ...(ac === 'opus' ? ['-strict', '-2'] : []), '-b:a', aK + 'k'] : ['-an'];
    const mov = ['mp4', 'mov', 'm4v'].includes(fmt.id) ? ['-movflags', '+faststart'] : [];
    return attempt(file, fmt, [...(vf.length ? ['-vf', vf.join(',')] : []), ...v, ...a, ...mov], prog);
  }, onProgress);

  return result(data, fmt, target, over, `Re-encoded to fit - about ${Math.round(total)} kbps overall.`);
}

async function compressPalette(file, fmt, target, info, onProgress) {
  /* PNG and GIF shrink by fewer colours, then by fewer pixels */
  const steps = [
    { colors: 256, scale: 1 }, { colors: 128, scale: 1 }, { colors: 64, scale: 1 },
    { colors: 128, scale: 0.75 }, { colors: 64, scale: 0.6 }, { colors: 32, scale: 0.5 },
    { colors: 32, scale: 0.35 }, { colors: 16, scale: 0.25 },
  ];
  let best = null, used = null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const sc = s.scale < 1 ? `scale=trunc(iw*${s.scale}/2)*2:-2:flags=lanczos,` : '';
    const anim = fmt.id === 'gif';
    const vf = `${sc}split[a][b];[a]palettegen=max_colors=${s.colors}${anim ? ':stats_mode=diff' : ''}[p];`
             + `[b][p]paletteuse=dither=${s.colors < 64 ? 'bayer:bayer_scale=3' : 'sierra2_4a'}`;
    const extra = anim ? ['-loop', '0'] : ['-frames:v', '1', '-c:v', 'png', '-pred', 'mixed'];
    const data = await attempt(file, fmt, ['-vf', vf, ...extra], f => onProgress?.((i + f) / steps.length));
    if (!best || data.byteLength < best.byteLength) { best = data; used = s; }
    if (data.byteLength <= target) break;
  }
  const how = [];
  if (used.colors < 256) how.push(`${used.colors} colours`);
  if (used.scale < 1) how.push(`${Math.round(used.scale * 100)}% of the original size`);
  return result(best, fmt, target, best.byteLength > target,
    how.length ? `Reduced to ${how.join(', ')}.` : 'Re-encoded with an optimised palette.');
}

async function compressRaster(file, fmt, target, info, onProgress) {
  /* formats with no quality dial: size is pixels, so shrink the pixels */
  const probeData = await attempt(file, fmt, ['-frames:v', '1', ...(fmt.write.ff || [])], null);
  const full = probeData.byteLength;
  if (full <= target) return result(probeData, fmt, target, false, 'Re-encoded - already under the target.');

  let scale = Math.sqrt(target / full) * 0.97;
  let data = null;
  for (let pass = 0; pass < 3; pass++) {
    const sc = Math.max(0.05, Math.min(1, scale));
    /* resize only. Stacking a quality cut on top (as JPEG 2000 once did here)
       overshot to 6% of the original when asked for 45% - smaller than
       anyone wanted, and far worse looking than it needed to be */
    data = await attempt(file, fmt,
      ['-vf', `scale=trunc(iw*${sc.toFixed(3)}/2)*2:-2:flags=lanczos`, '-frames:v', '1', ...(fmt.write.ff || [])],
      f => onProgress?.((pass + f) / 3));
    if (data.byteLength <= target) break;
    scale = sc * Math.sqrt(target / data.byteLength) * 0.95;
  }
  return result(data, fmt, target, data.byteLength > target,
    `${fmt.label} has no quality setting, so it was resized to fit.`);
}

function result(data, fmt, target, over, note) {
  const blob = new Blob([data], { type: fmt.mime || 'application/octet-stream' });
  return {
    blob,
    note: over ? `${note} This is as small as it can get without breaking the file.` : note,
    over,
  };
}

/* ------------------------------------------------------------------ */

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 / 1024).toFixed(n < 10485760 ? 2 : 1) + ' MB';
  return (n / 1024 ** 3).toFixed(2) + ' GB';
}
function fmtDur(s) {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m}m ${r}s` : `${r}s`;
}

/** Abandon whatever is running. The next call reloads the engine. */
export function cancel() { retire(); }
