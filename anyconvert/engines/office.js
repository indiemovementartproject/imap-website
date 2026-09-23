/*
 * Office engine: compress PPTX, DOCX, XLSX, ODT, ODP, ODS and EPUB.
 *
 * Every one of these is a ZIP of XML plus a folder of media. When a deck is
 * 180 MB it is never the text - it is thirty full-resolution phone photos
 * dropped onto slides at the size of a postage stamp. So:
 *
 *   - re-encode each photo at a lower quality and a sensible size
 *   - repack the ZIP at maximum compression
 *
 * The layout lives in the XML as physical dimensions (EMUs, cm), not pixels,
 * so shrinking an image's pixels does not move or resize anything on the
 * slide. File names never change either - they are referenced from the XML,
 * and [Content_Types].xml maps extensions to types, so a PNG stays a PNG.
 */
import { zip } from './pdf.js';
import { canvasBlob } from './image.js';

const MEDIA = /\.(jpe?g|png)$/i;
const ODF_OR_EPUB = ['odt', 'odp', 'ods', 'epub'];

export async function compress(file, fmt, target, onProgress) {
  const Z = await zip();
  const src = await Z.loadAsync(await file.arrayBuffer());

  /* measure the photos once, so every pass works from the originals */
  const media = [];
  for (const [path, entry] of Object.entries(src.files)) {
    if (entry.dir || !MEDIA.test(path)) continue;
    const bytes = await entry.async('uint8array');
    media.push({ path, bytes, png: /\.png$/i.test(path) });
  }
  const mediaBytes = media.reduce((s, m) => s + m.bytes.byteLength, 0);

  /* pass 0: repack only - often worth 5-15% on its own */
  let best = await repack(Z, src, fmt, new Map());
  onProgress?.(0.1);
  if (best.size <= target || !media.length) {
    return done(best, target, media.length
      ? 'Repacked at maximum compression - the images did not need touching.'
      : `Repacked at maximum compression. This ${fmt.label} has no photos in it, which is where the weight usually is.`);
  }

  const ladder = [
    { q: 0.8, max: 2400 }, { q: 0.7, max: 1920 }, { q: 0.6, max: 1600 },
    { q: 0.5, max: 1280 }, { q: 0.42, max: 1024 }, { q: 0.36, max: 800 },
  ];
  let used = null;
  for (let i = 0; i < ladder.length; i++) {
    const step = ladder[i];
    const replaced = new Map();
    for (const m of media) {
      const out = await shrink(m, step);
      if (out && out.byteLength < m.bytes.byteLength) replaced.set(m.path, out);
    }
    const blob = await repack(Z, src, fmt, replaced);
    onProgress?.(0.1 + 0.9 * (i + 1) / ladder.length);
    if (blob.size < best.size) { best = blob; used = { ...step, n: replaced.size }; }
    if (blob.size <= target) break;
  }

  const pct = Math.round((1 - best.size / file.size) * 100);
  const note = used
    ? `Recompressed ${used.n} image${used.n === 1 ? '' : 's'} (quality ${Math.round(used.q * 100)}, `
      + `at most ${used.max} px) and repacked. Layout, text and slides are unchanged. `
      + `${pct}% smaller overall.`
    : 'Repacked at maximum compression.';
  return done(best, target, note, mediaBytes);
}

async function shrink(m, { q, max }) {
  try {
    const bmp = await createImageBitmap(new Blob([m.bytes]));
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (!m.png) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    /* PNGs keep their format (they are referenced by name, and may carry
       transparency); only their pixel count can come down */
    if (m.png && k >= 0.999) return null;
    const blob = await canvasBlob(c, m.png ? 'image/png' : 'image/jpeg', m.png ? undefined : q);
    return new Uint8Array(await blob.arrayBuffer());
  } catch (e) {
    return null;                                  /* unreadable - leave it alone */
  }
}

async function repack(Z, src, fmt, replaced) {
  const out = new Z();
  /* ODF and EPUB require `mimetype` to be the FIRST entry and stored
     uncompressed, or LibreOffice and e-readers refuse to open the file */
  if (ODF_OR_EPUB.includes(fmt.id) && src.files.mimetype) {
    out.file('mimetype', await src.files.mimetype.async('uint8array'), { compression: 'STORE', createFolders: false });
  }
  /* createFolders:false - otherwise JSZip invents a directory entry for every
     parent path (16 of them in a typical deck). Harmless to most readers, but
     Office is strict about package structure, so the output keeps exactly the
     entries the original had and nothing else. */
  for (const [path, entry] of Object.entries(src.files)) {
    if (path === 'mimetype' && ODF_OR_EPUB.includes(fmt.id)) continue;
    const opts = { date: entry.date, createFolders: false };
    if (entry.dir) { out.file(path, null, { ...opts, dir: true }); continue; }
    const data = replaced.get(path) || await entry.async('uint8array');
    out.file(path, data, { ...opts, compression: 'DEFLATE', compressionOptions: { level: 9 } });
  }
  return out.generateAsync({
    type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 },
    mimeType: 'application/zip',
  });
}

function done(blob, target, note) {
  const over = blob.size > target;
  return { blob, over, note: over ? note + ' This is as small as it gets without removing content.' : note };
}
