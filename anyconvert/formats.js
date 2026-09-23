/*
 * AnyConvert format registry.
 *
 * Every format the app knows, how it is read, how it is written, and how it
 * compresses. The conversion matrix is DERIVED from this table rather than
 * written by hand, so adding a format here is all it takes to make it reachable
 * from every compatible input.
 *
 * The ffmpeg capabilities behind this list were read out of the actual engine
 * (see engine-capabilities.json) - nothing here is assumed. Notable absences in
 * the wasm build: no AV1 encoder, no AMR encoder, no HEIC decoder. Formats that
 * need those are marked `mac` and only light up in the desktop app.
 *
 *   kind      audio | video | image | doc | office
 *   read      can be opened as input
 *   write     how to produce it, or null if input-only
 *   compress  strategy used by the Compress tab, or null
 *   mac       only available in the desktop app (needs native tools)
 */

/* x264 is capped at 4 threads. Left on auto, it asks for more threads than
   the engine's fixed 32-worker pool on an 8-core machine, and the engine's own
   error handler then crashes on the non-Error it throws. Four is also the
   fastest measured setting: 1.4 s for 5 s of 360p, against 3.2 s on one. */
const X264 = ['-c:v', 'libx264', '-threads', '4', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
/* ffmpeg's native Opus encoder. The libopus build writes out of bounds on any
   stereo input (mono works, which is how it hid) - so it is not used here. */
const OPUS = b => ['-c:a', 'opus', '-strict', '-2', '-b:a', b];
const AAC  = ['-c:a', 'aac', '-b:a', '160k'];

export const FORMATS = [
  /* ---------------- audio ---------------- */
  { id: 'mp3',  label: 'MP3',  kind: 'audio', ext: 'mp3',  mime: 'audio/mpeg',
    write: { mux: 'mp3',  args: ['-c:a', 'libmp3lame', '-q:a', '2'] }, compress: 'abr', codec: 'libmp3lame' },
  { id: 'wav',  label: 'WAV',  kind: 'audio', ext: 'wav',  mime: 'audio/wav',
    write: { mux: 'wav',  args: ['-c:a', 'pcm_s16le'] }, compress: 'pcm' },
  { id: 'aac',  label: 'AAC',  kind: 'audio', ext: 'aac',  mime: 'audio/aac',
    write: { mux: 'adts', args: ['-c:a', 'aac', '-b:a', '192k'] }, compress: 'abr', codec: 'aac' },
  { id: 'm4a',  label: 'M4A',  kind: 'audio', ext: 'm4a',  mime: 'audio/mp4',
    write: { mux: 'ipod', args: ['-c:a', 'aac', '-b:a', '192k', '-vn'] }, compress: 'abr', codec: 'aac' },
  { id: 'alac', label: 'ALAC', kind: 'audio', ext: 'm4a',  mime: 'audio/mp4', note: 'Apple Lossless',
    write: { mux: 'ipod', args: ['-c:a', 'alac', '-vn'] }, compress: 'pcm' },
  { id: 'flac', label: 'FLAC', kind: 'audio', ext: 'flac', mime: 'audio/flac',
    write: { mux: 'flac', args: ['-c:a', 'flac', '-compression_level', '8'] }, compress: 'pcm' },
  { id: 'ogg',  label: 'OGG',  kind: 'audio', ext: 'ogg',  mime: 'audio/ogg', note: 'Vorbis',
    write: { mux: 'ogg',  args: ['-c:a', 'libvorbis', '-q:a', '5', '-vn'] }, compress: 'abr', codec: 'libvorbis' },
  { id: 'opus', label: 'Opus', kind: 'audio', ext: 'opus', mime: 'audio/opus',
    write: { mux: 'opus', args: [...OPUS('128k'), '-vn'] }, compress: 'abr', codec: 'opus' },
  { id: 'aiff', label: 'AIFF', kind: 'audio', ext: 'aiff', mime: 'audio/aiff',
    write: { mux: 'aiff', args: ['-c:a', 'pcm_s16be'] }, compress: 'pcm' },
  { id: 'wma',  label: 'WMA',  kind: 'audio', ext: 'wma',  mime: 'audio/x-ms-wma',
    write: { mux: 'asf',  args: ['-c:a', 'wmav2', '-b:a', '192k', '-vn'] }, compress: 'abr', codec: 'wmav2' },
  { id: 'ac3',  label: 'AC3',  kind: 'audio', ext: 'ac3',  mime: 'audio/ac3', note: 'Dolby Digital',
    write: { mux: 'ac3',  args: ['-c:a', 'ac3', '-b:a', '384k'] }, compress: 'abr', codec: 'ac3', minKbps: 64 },
  { id: 'eac3', label: 'E-AC3', kind: 'audio', ext: 'eac3', mime: 'audio/eac3', note: 'Dolby Digital Plus',
    write: { mux: 'eac3', args: ['-c:a', 'eac3', '-b:a', '384k'] }, compress: 'abr', codec: 'eac3', minKbps: 32 },
  { id: 'mp2',  label: 'MP2',  kind: 'audio', ext: 'mp2',  mime: 'audio/mpeg',
    write: { mux: 'mp2',  args: ['-c:a', 'mp2', '-b:a', '256k'] }, compress: 'abr', codec: 'mp2', minKbps: 32 },
  { id: 'caf',  label: 'CAF',  kind: 'audio', ext: 'caf',  mime: 'audio/x-caf', note: 'Core Audio',
    write: { mux: 'caf',  args: ['-c:a', 'pcm_s16le'] }, compress: 'pcm' },
  { id: 'wv',   label: 'WavPack', kind: 'audio', ext: 'wv', mime: 'audio/wavpack',
    write: { mux: 'wv',   args: ['-c:a', 'wavpack'] }, compress: 'pcm' },
  { id: 'au',   label: 'AU',   kind: 'audio', ext: 'au',   mime: 'audio/basic',
    write: { mux: 'au',   args: ['-c:a', 'pcm_s16be'] }, compress: 'pcm' },
  { id: 'tta',  label: 'TTA',  kind: 'audio', ext: 'tta',  mime: 'audio/x-tta', note: 'True Audio',
    write: { mux: 'tta',  args: ['-c:a', 'tta'] }, compress: 'pcm' },
  { id: 'w64',  label: 'W64',  kind: 'audio', ext: 'w64',  mime: 'audio/x-w64', note: 'Wave64',
    write: { mux: 'w64',  args: ['-c:a', 'pcm_s16le'] }, compress: 'pcm' },
  { id: 'amr',  label: 'AMR',  kind: 'audio', ext: 'amr',  write: null, compress: null },
  { id: 'ape',  label: 'APE',  kind: 'audio', ext: 'ape',  write: null, compress: null, note: "Monkey's Audio" },
  { id: 'dsf',  label: 'DSF',  kind: 'audio', ext: 'dsf',  write: null, compress: null, note: 'DSD' },
  { id: 'mpc',  label: 'MPC',  kind: 'audio', ext: 'mpc',  write: null, compress: null, note: 'Musepack' },
  { id: 'mka',  label: 'MKA',  kind: 'audio', ext: 'mka',  mime: 'audio/x-matroska',
    write: { mux: 'matroska', args: [...OPUS('160k'), '-vn'] }, compress: 'abr', codec: 'opus' },
  { id: 'voc',  label: 'VOC',  kind: 'audio', ext: 'voc',  write: null, compress: null },

  /* ---------------- video ---------------- */
  { id: 'mp4',  label: 'MP4',  kind: 'video', ext: 'mp4',  mime: 'video/mp4',
    write: { mux: 'mp4',  args: [...X264, ...AAC, '-movflags', '+faststart'] }, compress: 'vbr' },
  { id: 'mov',  label: 'MOV',  kind: 'video', ext: 'mov',  mime: 'video/quicktime',
    write: { mux: 'mov',  args: [...X264, ...AAC, '-movflags', '+faststart'] }, compress: 'vbr' },
  { id: 'mkv',  label: 'MKV',  kind: 'video', ext: 'mkv',  mime: 'video/x-matroska',
    write: { mux: 'matroska', args: [...X264, ...AAC] }, compress: 'vbr' },
  /* VP8, not VP9: the VP9 build writes out of bounds at every thread count,
     including one. VP8 plays in every browser and is still a proper WebM,
     just a little less efficient per bit. */
  { id: 'webm', label: 'WebM', kind: 'video', ext: 'webm', mime: 'video/webm',
    write: { mux: 'webm', args: ['-c:v', 'libvpx', '-threads', '4', '-crf', '10', '-b:v', '1500k',
                                 '-deadline', 'realtime', '-cpu-used', '6', ...OPUS('128k')] },
    compress: 'vbr', vcodec: 'libvpx', acodec: 'opus' },
  { id: 'avi',  label: 'AVI',  kind: 'video', ext: 'avi',  mime: 'video/x-msvideo',
    write: { mux: 'avi',  args: ['-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '3'] },
    compress: 'vbr', vcodec: 'mpeg4', acodec: 'libmp3lame' },
  { id: 'flv',  label: 'FLV',  kind: 'video', ext: 'flv',  mime: 'video/x-flv',
    write: { mux: 'flv',  args: [...X264, ...AAC] }, compress: 'vbr' },
  { id: 'mpeg', label: 'MPEG', kind: 'video', ext: 'mpg',  mime: 'video/mpeg', alias: ['mpg', 'mpe'],
    write: { mux: 'mpeg', args: ['-c:v', 'mpeg2video', '-q:v', '4', '-c:a', 'mp2', '-b:a', '192k'] },
    compress: 'vbr', vcodec: 'mpeg2video', acodec: 'mp2' },
  { id: 'm4v',  label: 'M4V',  kind: 'video', ext: 'm4v',  mime: 'video/x-m4v',
    write: { mux: 'mp4',  args: [...X264, ...AAC, '-movflags', '+faststart'] }, compress: 'vbr' },
  { id: '3gp',  label: '3GP',  kind: 'video', ext: '3gp',  mime: 'video/3gpp',
    write: { mux: '3gp',  args: [...X264, '-c:a', 'aac', '-b:a', '96k', '-ac', '1'] }, compress: 'vbr' },
  { id: '3g2',  label: '3G2',  kind: 'video', ext: '3g2',  mime: 'video/3gpp2',
    write: { mux: '3g2',  args: [...X264, '-c:a', 'aac', '-b:a', '96k', '-ac', '1'] }, compress: 'vbr' },
  { id: 'ogv',  label: 'OGV',  kind: 'video', ext: 'ogv',  mime: 'video/ogg', note: 'Theora',
    write: { mux: 'ogg',  args: ['-c:v', 'libtheora', '-q:v', '7', '-c:a', 'libvorbis', '-q:a', '5'] },
    compress: 'vbr', vcodec: 'libtheora', acodec: 'libvorbis' },
  { id: 'wmv',  label: 'WMV',  kind: 'video', ext: 'wmv',  mime: 'video/x-ms-wmv',
    write: { mux: 'asf',  args: ['-c:v', 'wmv2', '-b:v', '2500k', '-c:a', 'wmav2', '-b:a', '160k'] },
    compress: 'vbr', vcodec: 'wmv2', acodec: 'wmav2' },
  { id: 'ts',   label: 'TS',   kind: 'video', ext: 'ts',   mime: 'video/mp2t', note: 'MPEG transport stream',
    write: { mux: 'mpegts', args: [...X264, ...AAC] }, compress: 'vbr' },
  { id: 'm2ts', label: 'M2TS', kind: 'video', ext: 'm2ts', mime: 'video/mp2t', alias: ['mts'],
    write: { mux: 'mpegts', args: [...X264, ...AAC, '-mpegts_m2ts_mode', '1'] }, compress: 'vbr' },
  { id: 'vob',  label: 'VOB',  kind: 'video', ext: 'vob',  mime: 'video/dvd',
    write: { mux: 'vob',  args: ['-c:v', 'mpeg2video', '-q:v', '3', '-c:a', 'mp2', '-b:a', '192k'] },
    compress: 'vbr', vcodec: 'mpeg2video', acodec: 'mp2' },
  { id: 'f4v',  label: 'F4V',  kind: 'video', ext: 'f4v',  mime: 'video/x-f4v',
    write: { mux: 'f4v',  args: [...X264, ...AAC] }, compress: 'vbr' },
  { id: 'asf',  label: 'ASF',  kind: 'video', ext: 'asf',  mime: 'video/x-ms-asf',
    write: { mux: 'asf',  args: ['-c:v', 'wmv2', '-b:v', '2500k', '-c:a', 'wmav2', '-b:a', '160k'] },
    compress: 'vbr', vcodec: 'wmv2', acodec: 'wmav2' },
  { id: 'mxf',  label: 'MXF',  kind: 'video', ext: 'mxf',  mime: 'application/mxf', note: 'Broadcast',
    write: { mux: 'mxf',  args: ['-c:v', 'mpeg2video', '-q:v', '3', '-pix_fmt', 'yuv422p', '-c:a', 'pcm_s16le', '-ar', '48000'] },
    compress: null },
  { id: 'rm',   label: 'RM',   kind: 'video', ext: 'rm',   alias: ['rmvb'], write: null, compress: null, note: 'RealMedia' },
  { id: 'wtv',  label: 'WTV',  kind: 'video', ext: 'wtv',  write: null, compress: null },
  { id: 'dv',   label: 'DV',   kind: 'video', ext: 'dv',   write: null, compress: null },

  /* animated - produced from video, and readable as video */
  { id: 'gif',  label: 'GIF',  kind: 'image', ext: 'gif',  mime: 'image/gif', animated: true,
    write: { anim: 'gif' }, compress: 'palette' },
  { id: 'apng', label: 'APNG', kind: 'image', ext: 'png',  mime: 'image/apng', animated: true, note: 'Animated PNG',
    write: { anim: 'apng' }, compress: null, writeOnly: true },
  { id: 'awebp', label: 'WebP (animated)', kind: 'image', ext: 'webp', mime: 'image/webp', animated: true,
    write: { anim: 'webp' }, compress: null, writeOnly: true },

  /* ---------------- still images ---------------- */
  { id: 'jpg',  label: 'JPG',  kind: 'image', ext: 'jpg',  mime: 'image/jpeg', alias: ['jpeg', 'jfif', 'jpe'],
    write: { canvas: 'image/jpeg', ff: ['-c:v', 'mjpeg', '-q:v', '2'] }, compress: 'quality' },
  { id: 'png',  label: 'PNG',  kind: 'image', ext: 'png',  mime: 'image/png',
    write: { canvas: 'image/png', ff: ['-c:v', 'png'] }, compress: 'palette' },
  { id: 'webp', label: 'WebP', kind: 'image', ext: 'webp', mime: 'image/webp',
    write: { canvas: 'image/webp', ff: ['-c:v', 'libwebp', '-q:v', '90'] }, compress: 'quality' },
  { id: 'bmp',  label: 'BMP',  kind: 'image', ext: 'bmp',  mime: 'image/bmp',
    write: { ff: ['-c:v', 'bmp'] }, compress: 'raster' },
  { id: 'tiff', label: 'TIFF', kind: 'image', ext: 'tiff', mime: 'image/tiff', alias: ['tif'],
    write: { ff: ['-c:v', 'tiff', '-compression_algo', 'deflate'] }, compress: 'raster' },
  { id: 'ico',  label: 'ICO',  kind: 'image', ext: 'ico',  mime: 'image/x-icon', note: 'Icon, max 256px',
    /* ffmpeg's ICO writer refuses PNG frames without alpha */
    write: { ff: ['-c:v', 'png', '-pix_fmt', 'rgba'], mux: 'ico', maxSide: 256 }, compress: null },
  { id: 'tga',  label: 'TGA',  kind: 'image', ext: 'tga',  mime: 'image/x-tga',
    write: { ff: ['-c:v', 'targa'] }, compress: 'raster' },
  { id: 'qoi',  label: 'QOI',  kind: 'image', ext: 'qoi',  mime: 'image/qoi',
    write: { ff: ['-c:v', 'qoi'] }, compress: 'raster' },
  { id: 'jp2',  label: 'JPEG 2000', kind: 'image', ext: 'jp2', mime: 'image/jp2', alias: ['j2k', 'jpf'],
    write: { ff: ['-c:v', 'jpeg2000'] }, compress: 'raster' },
  { id: 'ppm',  label: 'PPM',  kind: 'image', ext: 'ppm',  mime: 'image/x-portable-pixmap',
    write: { ff: ['-c:v', 'ppm'] }, compress: 'raster' },
  { id: 'pgm',  label: 'PGM',  kind: 'image', ext: 'pgm',  mime: 'image/x-portable-graymap', note: 'Greyscale',
    write: { ff: ['-c:v', 'pgm'] }, compress: 'raster' },
  { id: 'pcx',  label: 'PCX',  kind: 'image', ext: 'pcx',  mime: 'image/x-pcx',
    write: { ff: ['-c:v', 'pcx'] }, compress: 'raster' },
  { id: 'sgi',  label: 'SGI',  kind: 'image', ext: 'sgi',  mime: 'image/sgi', alias: ['rgb'],
    write: { ff: ['-c:v', 'sgi'] }, compress: 'raster' },
  { id: 'svg',  label: 'SVG',  kind: 'image', ext: 'svg',  mime: 'image/svg+xml', write: null, compress: null },
  { id: 'avif', label: 'AVIF', kind: 'image', ext: 'avif', mime: 'image/avif',  write: null, compress: null },
  { id: 'psd',  label: 'PSD',  kind: 'image', ext: 'psd',  write: null, compress: null, note: 'Photoshop' },
  { id: 'dds',  label: 'DDS',  kind: 'image', ext: 'dds',  write: null, compress: null },
  { id: 'exr',  label: 'EXR',  kind: 'image', ext: 'exr',  write: null, compress: null, note: 'OpenEXR' },
  { id: 'jxl',  label: 'JPEG XL', kind: 'image', ext: 'jxl', write: null, compress: null },
  { id: 'xbm',  label: 'XBM',  kind: 'image', ext: 'xbm',  write: null, compress: null },
  { id: 'xpm',  label: 'XPM',  kind: 'image', ext: 'xpm',  write: null, compress: null },
  { id: 'heic', label: 'HEIC', kind: 'image', ext: 'heic', alias: ['heif'], mac: true,
    write: { mac: 'heic' }, compress: 'quality', note: 'iPhone photos' },

  /* ---------------- documents ---------------- */
  { id: 'pdf',  label: 'PDF',  kind: 'doc', ext: 'pdf', mime: 'application/pdf',
    write: { pdf: true }, compress: 'pdf' },

  /* ---------------- office: compress in the browser, convert on the Mac ---------------- */
  { id: 'pptx', label: 'PPTX', kind: 'office', ext: 'pptx', compress: 'zipmedia', write: null, note: 'PowerPoint' },
  { id: 'docx', label: 'DOCX', kind: 'office', ext: 'docx', compress: 'zipmedia', note: 'Word',
    write: { mac: 'textutil' } },
  { id: 'xlsx', label: 'XLSX', kind: 'office', ext: 'xlsx', compress: 'zipmedia', write: null, note: 'Excel' },
  { id: 'odt',  label: 'ODT',  kind: 'office', ext: 'odt',  compress: 'zipmedia', note: 'OpenDocument text',
    write: { mac: 'textutil' } },
  { id: 'odp',  label: 'ODP',  kind: 'office', ext: 'odp',  compress: 'zipmedia', write: null, note: 'OpenDocument slides' },
  { id: 'ods',  label: 'ODS',  kind: 'office', ext: 'ods',  compress: 'zipmedia', write: null, note: 'OpenDocument sheet' },
  { id: 'epub', label: 'EPUB', kind: 'office', ext: 'epub', compress: 'zipmedia', write: null, note: 'E-book' },
  { id: 'rtf',  label: 'RTF',  kind: 'office', ext: 'rtf',  compress: null, mac: true, write: { mac: 'textutil' } },
  { id: 'doc',  label: 'DOC',  kind: 'office', ext: 'doc',  compress: null, mac: true, write: { mac: 'textutil' } },
  { id: 'html', label: 'HTML', kind: 'office', ext: 'html', alias: ['htm'], compress: null, mac: true, write: { mac: 'textutil' } },
  { id: 'txt',  label: 'TXT',  kind: 'office', ext: 'txt',  compress: null, mac: true, write: { mac: 'textutil' } },
];

/* Lookups ---------------------------------------------------------------- */

export const BY_ID = Object.fromEntries(FORMATS.map(f => [f.id, f]));

/* Extension -> format. `writeOnly` entries share an extension with a real
   input format (apng/awebp reuse .png/.webp), so they must never win here. */
const BY_EXT = {};
for (const f of FORMATS) {
  if (f.writeOnly) continue;
  for (const e of [f.ext, ...(f.alias || [])]) if (!BY_EXT[e]) BY_EXT[e] = f;
}

export function detect(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return BY_EXT[ext] || null;
}

/* The matrix -------------------------------------------------------------- */

/* A format can be produced if it has a writer, and that writer is available
   here. Checked at the WRITER, not the entry: DOCX compresses in the browser
   (JSZip) but can only be written by macOS textutil, so the entry itself is
   not Mac-only while its writer is. */
export function writable(f, mac = false) {
  if (!f || !f.write) return false;
  if (f.mac && !mac) return false;
  if (f.write.mac && !mac) return false;
  return true;
}

const TEXTUTIL = ['docx', 'doc', 'odt', 'rtf', 'html', 'txt'];

/**
 * What `src` can become. `mac` says whether native tools are available, which
 * unlocks HEIC and the document conversions.
 */
export function targetsFor(src, { mac = false, info = null } = {}) {
  if (!src) return [];
  const out = [];
  const ok = t => writable(t, mac) && t.id !== src.id;
  const add = t => { if (ok(t) && !out.includes(t)) out.push(t); };

  /* What is ACTUALLY in the file, once probed. A muted screen recording or a
     background loop has no soundtrack; offering nineteen audio formats for it
     just lets someone walk into "Output file does not contain any stream". */
  const noAudio = info && info.duration > 0 && !info.audio;
  const noVideo = info && info.duration > 0 && !info.video;

  switch (src.kind) {
    case 'audio':
      FORMATS.filter(t => t.kind === 'audio').forEach(add);
      break;

    case 'video':
      if (!noVideo) {
        FORMATS.filter(t => t.kind === 'video').forEach(add);
        FORMATS.filter(t => t.animated).forEach(add);              // gif / apng / animated webp
        ['jpg', 'png', 'webp'].forEach(id => add(BY_ID[id]));      // a still frame
      }
      if (!noAudio) FORMATS.filter(t => t.kind === 'audio').forEach(add);   // extract the soundtrack
      break;

    case 'image':
      if (src.animated) {                                          // a GIF is also a clip
        FORMATS.filter(t => t.kind === 'video').forEach(add);
        FORMATS.filter(t => t.animated).forEach(add);
      }
      FORMATS.filter(t => t.kind === 'image' && !t.animated).forEach(add);
      add(BY_ID.gif);                                              // a still GIF is still a GIF
      add(BY_ID.pdf);                                              // image -> 1-page PDF
      break;

    case 'doc':                                                    // PDF -> page images
      ['jpg', 'png', 'webp'].forEach(id => add(BY_ID[id]));
      break;

    case 'office':
      if (mac && TEXTUTIL.includes(src.id)) {
        TEXTUTIL.map(id => BY_ID[id]).forEach(add);
        add(BY_ID.pdf);
      }
      break;
  }
  return out;
}

export function canCompress(src, { mac = false } = {}) {
  return !!(src && src.compress && (mac || !src.mac));
}

/** Formats a user is most likely to want, shown first as one-tap chips. */
export const SUGGEST = {
  audio:  ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac'],
  video:  ['mp4', 'mp3', 'mov', 'webm', 'gif', 'wav'],
  image:  ['jpg', 'png', 'webp', 'pdf', 'gif', 'tiff'],
  doc:    ['jpg', 'png', 'webp'],
  office: ['pdf', 'docx', 'txt', 'html'],
};

export const KIND_LABEL = { audio: 'Audio', video: 'Video', image: 'Image', doc: 'Document', office: 'Office' };

/* Stats, for the About panel and the README. */
export function matrixStats({ mac = false } = {}) {
  let pairs = 0;
  const readable = FORMATS.filter(f => !f.writeOnly && (mac || !f.mac));
  const writers  = FORMATS.filter(f => writable(f, mac));
  for (const s of readable) pairs += targetsFor(s, { mac }).length;
  const compressible = FORMATS.filter(f => canCompress(f, { mac }));
  return { read: readable.length, write: writers.length, pairs, compress: compressible.length };
}
