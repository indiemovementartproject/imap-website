/*
 * PDF engine: pdf.js to read and render, pdf-lib to write.
 *
 *   PDF  -> JPG / PNG / WebP   one image per page, zipped if there is more than one
 *   image -> PDF               a single page the size of the picture
 *   PDF  -> smaller PDF        see compress() - text stays text wherever possible
 */
import * as img from './image.js';

const LIB = new URL('../lib/', import.meta.url).href;
const loaded = {};

function script(name, global) {
  if (loaded[name]) return loaded[name];
  loaded[name] = new Promise((res, rej) => {
    if (window[global]) return res(window[global]);
    const s = document.createElement('script');
    s.src = LIB + name;
    s.onload = () => res(window[global]);
    s.onerror = () => rej(new Error(`Could not load ${name}.`));
    document.head.appendChild(s);
  });
  return loaded[name];
}

export async function pdfjs() {
  const lib = await script('pdf.min.js', 'pdfjsLib');
  lib.GlobalWorkerOptions.workerSrc = LIB + 'pdf.worker.min.js';
  return lib;
}
export const pdflib = () => script('pdf-lib.min.js', 'PDFLib');
export const zip = () => script('jszip.min.js', 'JSZip');

/* ------------------------------------------------------------------ */
/* PDF -> images                                                        */
/* ------------------------------------------------------------------ */

/**
 * Render every page. 2x scale is about 150 dpi, which reads crisply on screen
 * and prints decently, without making a 40-page PDF into 400 MB of PNGs.
 */
export async function toImages(file, target, onProgress, baseName) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const n = doc.numPages;
  const outs = [];
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   /* PDFs assume paper */
    await page.render({ canvasContext: g, viewport: vp }).promise;
    outs.push(await img.encode(c, target, 0.9));
    onProgress?.(i / n);
  }
  if (outs.length === 1) return { blob: outs[0], name: `${baseName}.${target.ext}` };

  const Z = await zip();
  const z = new Z();
  const pad = String(n).length;
  outs.forEach((b, i) => z.file(`${baseName}-page-${String(i + 1).padStart(pad, '0')}.${target.ext}`, b));
  return { blob: await z.generateAsync({ type: 'blob' }), name: `${baseName}-${n}-pages.zip`, pages: n };
}

/* ------------------------------------------------------------------ */
/* image -> PDF                                                          */
/* ------------------------------------------------------------------ */

export async function fromImage(file, src) {
  const P = await pdflib();
  const canvas = await img.decode(file, src);
  const doc = await P.PDFDocument.create();
  /* keep transparency as PNG; everything else goes in as a JPEG, much smaller */
  const alpha = ['png', 'webp', 'gif', 'svg', 'ico', 'avif'].includes(src.id) && hasAlpha(canvas);
  const bytes = new Uint8Array(await (await img.encode(canvas, { id: alpha ? 'png' : 'jpg' }, 0.92)).arrayBuffer());
  const im = alpha ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  /* 96 px per inch on screen, 72 points per inch in PDF */
  const w = canvas.width * 0.75, h = canvas.height * 0.75;
  const page = doc.addPage([w, h]);
  page.drawImage(im, { x: 0, y: 0, width: w, height: h });
  doc.setProducer('AnyConvert · iMAP'); doc.setCreator('AnyConvert');
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

function hasAlpha(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 255) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* PDF -> smaller PDF                                                    */
/* ------------------------------------------------------------------ */

/**
 * Three stages, stopping at the first that reaches the target:
 *
 *   1. Lossless re-save with object streams. Free, often 5-20%.
 *   2. Recompress the photos INSIDE the PDF - every JPEG image stream is
 *      decoded, resized and re-encoded, and written back in place. Text,
 *      vectors and fonts are untouched, so the PDF stays searchable and
 *      selectable. This is how real PDF compressors work, and for scanned or
 *      photo-heavy documents it is where nearly all the weight is.
 *   3. Only if that is still too big: flatten each page to an image. Always
 *      reaches the target, but text stops being text - and the result says so.
 */
export async function compress(file, target, onProgress) {
  const P = await pdflib();
  const original = new Uint8Array(await file.arrayBuffer());

  /* 1 ---------------------------------------------------------------- */
  onProgress?.(0.02);
  const doc0 = await P.PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
  const resaved = await doc0.save({ useObjectStreams: true });
  if (resaved.byteLength <= target) {
    return pack(resaved, target, 'Repacked losslessly - nothing about the content changed.');
  }

  /* 2 ---------------------------------------------------------------- */
  let best = resaved;
  const ladders = [
    { q: 0.75, k: 1 }, { q: 0.6, k: 0.85 }, { q: 0.5, k: 0.7 },
    { q: 0.42, k: 0.55 }, { q: 0.36, k: 0.42 },
  ];
  let reached = null, photos = 0;
  for (let i = 0; i < ladders.length; i++) {
    const { q, k } = ladders[i];
    const doc = await P.PDFDocument.load(original, { ignoreEncryption: true, updateMetadata: false });
    photos = await recompressImages(P, doc, q, k);
    if (!photos) break;                              /* no photos to squeeze - skip to 3 */
    const out = await doc.save({ useObjectStreams: true });
    onProgress?.(0.1 + 0.55 * (i + 1) / ladders.length);
    if (out.byteLength < best.byteLength) best = out;
    if (out.byteLength <= target) { reached = { q, k }; break; }
  }
  if (reached) {
    return pack(best, target, `Recompressed ${photos} image${photos === 1 ? '' : 's'} inside the PDF `
      + `(quality ${Math.round(reached.q * 100)}${reached.k < 1 ? `, ${Math.round(reached.k * 100)}% size` : ''}). `
      + 'Text is still selectable and searchable.');
  }

  /* 3 ---------------------------------------------------------------- */
  const flat = await rasterise(original, target, f => onProgress?.(0.65 + f * 0.35), best.byteLength);
  if (flat && flat.bytes.byteLength < best.byteLength) {
    return pack(flat.bytes, target,
      `Pages were flattened to images at ${flat.dpi} dpi to reach this size - the text is no longer `
      + 'selectable or searchable. Pick a larger target to keep it as text.', true);
  }
  return pack(best, target, photos
    ? `Recompressed ${photos} image${photos === 1 ? '' : 's'}; text is still selectable.`
    : 'Repacked losslessly. This PDF is mostly text and fonts, which cannot shrink much further.');
}

/**
 * Re-encode every JPEG image XObject in `doc` in place.
 * Returns how many it touched. Only DCTDecode (JPEG) streams are handled -
 * they can be decoded by the browser as-is, and they are the bulk of any
 * scanned or photo-heavy PDF.
 */
async function recompressImages(P, doc, quality, scale) {
  const { PDFName, PDFRawStream, PDFNumber } = P;
  let n = 0;
  const jobs = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    const filter = d.get(PDFName.of('Filter'));
    const isJpeg = filter === PDFName.of('DCTDecode')
      || (filter?.asArray && filter.asArray().length === 1 && filter.asArray()[0] === PDFName.of('DCTDecode'));
    if (!isJpeg) continue;
    if (obj.contents.byteLength < 24 * 1024) continue;               /* not worth it */
    jobs.push({ ref, obj });
  }

  for (const { ref, obj } of jobs) {
    try {
      const bmp = await createImageBitmap(new Blob([obj.contents], { type: 'image/jpeg' }));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      const blob = await img.canvasBlob(c, 'image/jpeg', quality);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.byteLength >= obj.contents.byteLength) continue;     /* never make it bigger */

      const dict = obj.dict.clone(doc.context);
      dict.set(PDFName.of('Width'), PDFNumber.of(w));
      dict.set(PDFName.of('Height'), PDFNumber.of(h));
      dict.set(PDFName.of('Length'), PDFNumber.of(bytes.byteLength));
      /* the browser hands back RGB whatever went in, including CMYK - so the
         stream has to say RGB now, and drop any Decode array meant for the
         old colour space, or the colours come out inverted */
      dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
      dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      dict.delete(PDFName.of('Decode'));
      doc.context.assign(ref, PDFRawStream.of(dict, bytes));
      n++;
    } catch (e) { /* a stream the browser can't decode - leave it exactly as it was */ }
  }
  return n;
}

async function rasterise(original, target, onProgress, beat = Infinity) {
  const lib = await pdfjs();
  const P = await pdflib();
  const src = await lib.getDocument({ data: original.slice() }).promise;
  const n = src.numPages;

  /* Flattening a text PDF usually makes it BIGGER - a page of vector text is
     a few KB, the same page as a JPEG is tens. Rendering all 65 pages at four
     resolutions just to find that out took most of a minute. So render a few
     pages once at the smallest setting, extrapolate, and skip the whole stage
     if even that cannot beat what stage 2 already has. Several pages, spread
     out: page 1 is often a near-empty title page and made the estimate
     hopelessly optimistic. */
  {
    const picks = [...new Set([1, Math.ceil(n / 2), n])];
    let sum = 0;
    for (const i of picks) {
      const page = await src.getPage(i);
      const vp = page.getViewport({ scale: 60 / 72 });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      sum += (await img.canvasBlob(c, 'image/jpeg', 0.36)).size;
    }
    if (sum / picks.length * n * 1.05 >= beat) return null;
  }

  let best = null;
  const steps = [[110, 0.6], [90, 0.5], [72, 0.42], [60, 0.36]];
  for (const [si, [dpi, q]] of steps.entries()) {
    const out = await P.PDFDocument.create();
    for (let i = 1; i <= n; i++) {
      const page = await src.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: dpi / 72 });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const jpg = new Uint8Array(await (await img.canvasBlob(c, 'image/jpeg', q)).arrayBuffer());
      const im = await out.embedJpg(jpg);
      const pg = out.addPage([base.width, base.height]);            /* same physical page size */
      pg.drawImage(im, { x: 0, y: 0, width: base.width, height: base.height });
      onProgress?.((si + i / n) / steps.length);
    }
    const bytes = await out.save({ useObjectStreams: true });
    if (!best || bytes.byteLength < best.bytes.byteLength) best = { bytes, dpi };
    if (bytes.byteLength <= target) break;
  }
  return best;
}

function pack(bytes, target, note, lossy = false) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const over = blob.size > target;
  return { blob, over, lossy, note: over ? note + ' This is the smallest it can go.' : note };
}
