/*
 * Image engine: the browser's own decoders and the canvas encoder.
 *
 * This is the fast path. Turning a PNG into a JPG, or shrinking a photo,
 * should never wait on the 31 MB media engine - it happens here in
 * milliseconds. Anything the browser cannot decode (PSD, EXR, DDS, TGA...)
 * or cannot encode (BMP, TIFF, ICO...) falls through to ffmpeg instead.
 */

import * as media from './media.js';

/* What the browser decodes by itself. TIFF is added by UTIF below. */
const NATIVE_IN = ['jpg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'ico'];
/* What canvas is asked to write. */
const CANVAS_OUT = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/* Safari - desktop, iPhone, and the WebKit inside the Mac app - cannot encode
   WebP from a canvas. It does not fail: it quietly hands back a PNG. Asking for
   WebP and naming the result .webp turned a 196 KB photo into a 1.9 MB PNG
   wearing the wrong extension. So ask once, honestly, and route WebP through
   the media engine's libwebp wherever the canvas cannot do it. */
export const CANVAS_WEBP = (() => {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 2;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch (e) { return false; }
})();

export function canDecode(src) {
  return NATIVE_IN.includes(src.id) || src.id === 'tiff';
}
export function canEncode(target) {
  if (target.id === 'webp') return CANVAS_WEBP;
  return !!CANVAS_OUT[target.id];
}
/** True when this engine can do the whole job without ffmpeg. */
export function handles(src, target) {
  return canDecode(src) && (canEncode(target) || target.id === 'pdf');
}

/* ------------------------------------------------------------------ */

let utif = null;
async function loadUTIF() {
  if (utif) return utif;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('../lib/UTIF.js', import.meta.url).href;
    s.onload = res; s.onerror = () => rej(new Error('Could not load the TIFF reader.'));
    document.head.appendChild(s);
  });
  utif = window.UTIF;
  return utif;
}

/**
 * Decode any supported image to a canvas.
 * SVG is rasterised at its own size, or 2048 px on the long side if it has none.
 */
export async function decode(file, src) {
  if (src.id === 'tiff') return decodeTIFF(file);
  if (src.id === 'svg') return decodeSVG(file);

  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch (e) {
    /* some formats (ICO in places, odd BMPs) only decode through <img> */
    bmp = await viaImg(file);
  }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  if (bmp.close) bmp.close();
  return c;
}

function viaImg(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This image could not be read.')); };
    img.src = url;
  });
}

async function decodeTIFF(file) {
  const U = await loadUTIF();
  const buf = await file.arrayBuffer();
  const ifds = U.decode(buf);
  if (!ifds.length) throw new Error('This TIFF has no image in it.');
  const page = ifds[0];
  U.decodeImage(buf, page);
  const rgba = U.toRGBA8(page);
  const c = document.createElement('canvas');
  c.width = page.width; c.height = page.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), page.width, page.height), 0, 0);
  return c;
}

async function decodeSVG(file) {
  const txt = await file.text();
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  const svg = doc.documentElement;
  let w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if ((!w || !h) && vb.length === 4) { w = vb[2]; h = vb[3]; }
  if (!w || !h) { w = 1024; h = 1024; }
  /* vector art should come out crisp - render at 2048 on the long side */
  const k = 2048 / Math.max(w, h);
  svg.setAttribute('width', String(Math.round(w * k)));
  svg.setAttribute('height', String(Math.round(h * k)));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const img = await viaImg(blob);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || Math.round(w * k);
  c.height = img.naturalHeight || Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/* ------------------------------------------------------------------ */

/** JPEG has no alpha: flatten onto white, or transparent areas turn black. */
function flatten(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(canvas, 0, 0);
  return c;
}

function scaled(canvas, k) {
  if (k >= 0.999) return canvas;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * k));
  c.height = Math.max(1, Math.round(canvas.height * k));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

export async function encode(canvas, target, quality = 0.92) {
  if (target.id === 'webp' && !CANVAS_WEBP) {
    const png = await canvasBlob(canvas, 'image/png');
    return media.encodeWebP(png, quality);
  }
  const mime = CANVAS_OUT[target.id];
  const src = target.id === 'jpg' ? flatten(canvas) : canvas;
  const blob = await canvasBlob(src, mime, target.id === 'png' ? undefined : quality);
  /* never ship a file whose contents disagree with its name */
  if (blob.type && blob.type !== mime) {
    throw new Error(`This browser cannot write ${target.label || target.id.toUpperCase()} images.`);
  }
  return blob;
}

/**
 * canvas.toBlob, but one that always comes back.
 *
 * Chrome encodes large canvases in idle time, and a hidden page (a minimised
 * window, a collapsed side pane) can go without idle time indefinitely - a
 * PDF job froze for good that way, mid-page. toDataURL encodes on the spot
 * and works hidden, so it takes over when the page is hidden, or when toBlob
 * has not answered in a generous time for the canvas's size.
 */
export function canvasBlob(canvas, mime, q) {
  if (document.visibilityState === 'hidden') {
    try { return Promise.resolve(viaDataURL(canvas, mime, q)); } catch (e) { return Promise.reject(e); }
  }
  return new Promise((res, rej) => {
    let settled = false;
    const wait = 4000 + canvas.width * canvas.height / 5000;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { res(viaDataURL(canvas, mime, q)); } catch (e) { rej(e); }
    }, wait);
    canvas.toBlob(b => {
      if (settled) return;
      settled = true; clearTimeout(t);
      b ? res(b) : rej(new Error('Encoding failed.'));
    }, mime, q);
  });
}

function viaDataURL(canvas, mime, q) {
  const url = canvas.toDataURL(mime, q);
  const comma = url.indexOf(',');
  if (comma < 0) throw new Error('Encoding failed.');
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  /* the type the browser actually wrote - encode() checks it against the name */
  return new Blob([bytes], { type: url.slice(5, url.indexOf(';')) });
}

export async function convert(file, src, target) {
  const c = await decode(file, src);
  return encode(c, target, target.id === 'webp' ? 0.9 : 0.92);
}

/* ------------------------------------------------------------------ */

/**
 * Compress to a target size.
 *
 * JPG / WebP: binary-search the quality dial first. If even the lowest
 *   acceptable quality is too big, the image has too many pixels, so shrink
 *   it and search again. Quality alone below ~0.35 looks worse than a smaller
 *   image at a decent quality.
 * PNG: lossless in canvas, so pixels are the only lever.
 */
export async function compress(file, fmt, target, onProgress) {
  const c = await decode(file, fmt);
  const W = c.width, H = c.height;

  if (fmt.id === 'png') {
    let k = 1, best = await encode(c, fmt);
    if (best.size <= target) return done(best, fmt, target, 'Already under the target at full size.');
    k = Math.sqrt(target / best.size) * 0.97;
    for (let i = 0; i < 4; i++) {
      onProgress?.(i / 4);
      const b = await encode(scaled(c, k), fmt);
      if (b.size < best.size) best = b;
      if (b.size <= target) break;
      k *= Math.sqrt(target / b.size) * 0.95;
    }
    return done(best, fmt, target, `Resized to ${Math.round(k * W)} x ${Math.round(k * H)} px - PNG is lossless, so size is the only lever.`);
  }

  const FLOOR = 0.35;
  let k = 1, best = null, q = 0.9;
  for (let round = 0; round < 5; round++) {
    const cv = scaled(c, k);
    let lo = FLOOR, hi = 0.95, pick = null;
    for (let i = 0; i < 7; i++) {
      onProgress?.((round * 7 + i) / 35);
      const mid = (lo + hi) / 2;
      const b = await encode(cv, fmt, mid);
      if (b.size <= target) { pick = { b, q: mid }; lo = mid; } else hi = mid;
    }
    if (pick) { best = pick.b; q = pick.q; break; }
    const floor = await encode(cv, fmt, FLOOR);
    if (!best || floor.size < best.size) { best = floor; q = FLOOR; }
    k *= Math.sqrt(target / floor.size) * 0.95;
    if (k < 0.04) break;
  }
  const parts = [`quality ${Math.round(q * 100)}`];
  if (k < 0.999) parts.push(`${Math.round(k * W)} x ${Math.round(k * H)} px`);
  return done(best, fmt, target, `Saved at ${parts.join(', ')}.`);
}

function done(blob, fmt, target, note) {
  const over = blob.size > target;
  return { blob, over, note: over ? note + ' This is as small as it goes and still looks like a picture.' : note };
}
