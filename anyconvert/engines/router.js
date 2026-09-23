/*
 * Picks the engine for a job. The rule is: the lightest engine that can do
 * the whole thing well.
 *
 *   canvas   instant, no download - common image-to-image work
 *   pdf.js   PDF pages to pictures, pictures to PDF, PDF compression
 *   JSZip    Office and EPUB compression
 *   ffmpeg   everything with a timeline, plus the image formats the
 *            browser cannot read or write. 31 MB, loaded on demand.
 *   native   the Mac app only: HEIC, and document conversion via textutil
 */
import * as media from './media.js';
import * as image from './image.js';
import * as pdf from './pdf.js';
import * as office from './office.js';
import { BY_ID } from '../formats.js';

export const native = () => (typeof window !== 'undefined' && window.AnyConvertNative?.available) ? window.AnyConvertNative : null;

/** Does this job need the 31 MB media engine? Used to start the download early. */
export function needsFF(src, target, mode) {
  if (!src) return false;
  if (native() && (src.mac || target?.mac)) return false;
  if (mode === 'compress') {
    if (['pdf', 'zipmedia', 'quality'].includes(src.compress)) return false;
    return true;                                   /* abr, pcm, vbr, palette, raster */
  }
  if (src.kind === 'audio' || src.kind === 'video') return true;
  if (src.animated && target && target.kind !== 'image') return true;
  if (src.kind === 'image') {
    if (!target) return !image.canDecode(src);
    if (target.id === 'pdf') return !image.canDecode(src);
    if (target.animated) return true;
    return !image.handles(src, target);
  }
  return false;
}

export async function convertJob(file, src, target, info, onProgress) {
  try { return await convertInner(file, src, target, info, onProgress); }
  finally { media.finishJob(); }
}

async function convertInner(file, src, target, info, onProgress) {
  const base = baseName(file.name);
  const n = native();

  /* ---- the Mac app's native primitives, composed here ----
     macOS provides only "HEIC -> PNG", "image -> HEIC" and "document -> document".
     Everything else is the web pipeline, so HEIC reaches every format it knows. */
  const needNative = src.kind === 'office' || src.id === 'heic' || target.id === 'heic' || target.write?.mac;
  if (needNative && !n) throw new Error(`${src.label} to ${target.label} needs the AnyConvert Mac app.`);

  if (src.kind === 'office') {
    onProgress?.(0.3);
    return { blob: await n.doc(file, src.id, target.id), name: `${base}.${target.ext}` };
  }
  if (src.id === 'heic') {
    const png = await n.heicDecode(file);
    onProgress?.(0.5);
    if (target.id === 'png') return { blob: png, name: `${base}.png` };
    return convertInner(new File([png], `${base}.png`, { type: 'image/png' }), BY_ID.png, target, null,
      f => onProgress?.(0.5 + f / 2));
  }
  if (target.id === 'heic') {
    /* get to PNG through the normal pipeline, then let macOS encode it */
    const png = src.id === 'png' ? file
      : (await convertInner(file, src, BY_ID.png, info, f => onProgress?.(f * 0.6))).blob;
    return { blob: await n.heicEncode(png, 0.82), name: `${base}.heic` };
  }

  /* PDF -> page images */
  if (src.id === 'pdf') return pdf.toImages(file, target, onProgress, base);

  /* image -> PDF: decode however we can, then pdf-lib */
  if (target.id === 'pdf') {
    if (image.canDecode(src)) return { blob: await pdf.fromImage(file, src), name: `${base}.pdf` };
    const png = await media.convert(file, src, BY_ID.png, info, f => onProgress?.(f * 0.8));
    return { blob: await pdf.fromImage(new File([png], base + '.png'), BY_ID.png), name: `${base}.pdf` };
  }

  /* image -> image, when the browser can do it alone */
  if (src.kind === 'image' && !src.animated && image.handles(src, target)) {
    return { blob: await image.convert(file, src, target), name: `${base}.${target.ext}` };
  }
  /* a GIF to a still picture: first frame, via canvas */
  if (src.animated && target.kind === 'image' && !target.animated && image.canEncode(target)) {
    return { blob: await image.convert(file, src, target), name: `${base}.${target.ext}` };
  }

  /* everything else has a timeline, or an exotic pixel format */
  const blob = await media.convert(file, src, target, info, onProgress);
  return { blob, name: `${base}.${target.ext}` };
}

export async function compressJob(file, src, targetBytes, info, onProgress) {
  try { return await compressInner(file, src, targetBytes, info, onProgress); }
  finally { media.finishJob(); }
}

async function compressInner(file, src, targetBytes, info, onProgress) {
  const base = baseName(file.name);
  const name = `${base}-compressed.${src.ext}`;
  const n = native();

  let r;
  if (src.id === 'heic') {
    if (!n) throw new Error('HEIC needs the AnyConvert Mac app.');
    r = await n.heicCompress(file, targetBytes);
  } else if (src.compress === 'pdf') {
    r = await pdf.compress(file, targetBytes, onProgress);
  } else if (src.compress === 'zipmedia') {
    r = await office.compress(file, src, targetBytes, onProgress);
  } else if (src.compress === 'quality') {
    r = await image.compress(file, src, targetBytes, onProgress);
  } else if (src.id === 'png') {
    /* palette reduction beats resizing at the same size - but if the media
       engine will not load, resizing is still better than failing */
    try { r = await media.compress(file, src, targetBytes, info, onProgress); }
    catch (e) { if (/threads|load/i.test(e.message)) r = await image.compress(file, src, targetBytes, onProgress); else throw e; }
  } else {
    r = await media.compress(file, src, targetBytes, info, onProgress);
  }
  return { ...r, name };
}

export function baseName(name) {
  const i = name.lastIndexOf('.');
  return (i > 0 ? name.slice(0, i) : name).replace(/[\\/:*?"<>|]+/g, '-') || 'file';
}
