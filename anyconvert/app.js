/*
 * AnyConvert - the interface.
 *
 * Four steps and nothing else: pick a file, pick a format (or a size),
 * go, download. Everything the engines need to know is worked out behind
 * the scenes - including starting the 31 MB media engine download the
 * moment a video or audio file is picked, so it is usually ready before
 * the user has chosen what to turn it into.
 */
import { FORMATS, BY_ID, detect, targetsFor, canCompress, SUGGEST, KIND_LABEL, matrixStats } from './formats.js';
import * as router from './engines/router.js';
import * as media from './engines/media.js';

const $ = id => document.getElementById(id);
const MAC = !!router.native();

const S = {
  mode: 'convert',
  file: null, src: null, info: null, probing: null,
  target: null, unit: 'MB',
  job: 0, result: null, url: null,
};

/* ---------------------------------------------------------------- */
/* boot                                                              */
/* ---------------------------------------------------------------- */

const st = matrixStats({ mac: MAC });
$('stats').textContent = `${st.read} formats in · ${st.write} out · ${st.pairs.toLocaleString('en-IN')} conversions · ${st.compress} compressible`;
if (MAC) {
  $('kit').hidden = true;                           /* no website to link to inside the app */
  document.body.classList.add('mac');
}

/* the glow that follows the pointer - desktop only */
if (matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
  const c = $('cursor');
  let raf = 0, x = 0, y = 0;
  addEventListener('pointermove', e => {
    x = e.clientX; y = e.clientY;
    c.classList.add('on');
    if (!raf) raf = requestAnimationFrame(() => { c.style.transform = `translate(${x}px,${y}px)`; raf = 0; });
  }, { passive: true });
  document.addEventListener('pointerleave', () => c.classList.remove('on'));
}

/* ---------------------------------------------------------------- */
/* mode                                                              */
/* ---------------------------------------------------------------- */

function setMode(m) {
  S.mode = m;
  $('mConvert').setAttribute('aria-selected', m === 'convert');
  $('mCompress').setAttribute('aria-selected', m === 'compress');
  placePill();
  resetOutcome();
  render();
}
function placePill() {
  const btn = S.mode === 'convert' ? $('mConvert') : $('mCompress');
  $('pill').style.width = btn.offsetWidth + 'px';
  $('pill').style.transform = `translateX(${btn.offsetLeft - 4}px)`;
}
$('mConvert').onclick = () => setMode('convert');
$('mCompress').onclick = () => setMode('compress');
addEventListener('resize', placePill);
document.fonts?.ready.then(placePill);
placePill();

/* ---------------------------------------------------------------- */
/* 1 - picking a file                                                */
/* ---------------------------------------------------------------- */

$('drop').onclick = () => $('picker').click();
$('picker').onchange = e => { if (e.target.files[0]) take(e.target.files[0]); e.target.value = ''; };
$('fClear').onclick = () => { clearFile(); $('drop').focus(); };

const drop = $('drop');
let depth = 0;
addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; drop.classList.add('over'); e.preventDefault(); } });
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.classList.remove('over'); } });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); depth = 0; drop.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) take(f);
});
function hasFiles(e) { return [...(e.dataTransfer?.types || [])].includes('Files'); }

/* paste a screenshot straight in */
addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files || [])][0];
  if (f) { e.preventDefault(); take(f.name && f.name !== 'image.png' ? f : new File([f], 'pasted.png', { type: f.type })); }
});

function take(file) {
  const src = detect(file);
  resetOutcome();
  S.file = file; S.src = src; S.info = null; S.target = null;

  $('drop').hidden = true;
  $('file').hidden = false;
  $('fName').textContent = file.name;
  $('fIco').textContent = (src?.label || file.name.split('.').pop() || '?').slice(0, 4).toUpperCase();

  if (!src) {
    $('fSub').innerHTML = `${fmtBytes(file.size)}<span class="sep">·</span>not a format AnyConvert knows yet`;
    render();
    return;
  }
  describe();
  render();

  /* start the heavy engine now, not when they click Convert */
  const job = ++S.job;
  if (src.kind === 'audio' || src.kind === 'video' || (src.animated) ||
      (!['doc', 'office'].includes(src.kind) && router.needsFF(src, null, S.mode))) {
    if (src.kind === 'audio' || src.kind === 'video' || src.animated) {
      S.probing = media.probe(file, src.ext)
        .then(info => { if (job === S.job) { S.info = info; describe(); render(); } return info; })
        .catch(() => null);
    } else {
      media.ensureFF().catch(() => { /* reported if and when it is actually needed */ });
    }
  }
  if (src.kind === 'image' && !src.animated) sizeImage(file, job);
  if (file.size > 1.5 * 1024 ** 3 && !MAC) {
    $('stepHint').textContent = 'large file - the Mac app is faster';
  }
}

async function sizeImage(file, job) {
  try {
    const b = await createImageBitmap(file);
    if (job === S.job) { S.info = { width: b.width, height: b.height }; describe(); }
    b.close?.();
  } catch (e) { /* not decodable here - ffmpeg will manage */ }
}

function describe() {
  const f = S.file, s = S.src, i = S.info;
  const bits = [fmtBytes(f.size), `${s.label} ${KIND_LABEL[s.kind].toLowerCase()}`];
  if (i?.duration) bits.push(fmtDur(i.duration));
  if (i?.video?.width) bits.push(`${i.video.width}×${i.video.height}`);
  else if (i?.width) bits.push(`${i.width}×${i.height}`);
  if (!i && (s.kind === 'audio' || s.kind === 'video')) bits.push('reading…');
  $('fSub').innerHTML = bits.map(esc).join('<span class="sep">·</span>');
}

function clearFile() {
  S.job++;
  S.file = S.src = S.info = S.target = null;
  $('file').hidden = true;
  $('drop').hidden = false;
  $('stepHint').textContent = '';
  resetOutcome();
  render();
}

/* ---------------------------------------------------------------- */
/* 2 - what to make                                                  */
/* ---------------------------------------------------------------- */

function render() {
  const has = !!S.file;
  $('cTo').hidden = !has || S.mode !== 'convert';
  $('cSize').hidden = !has || S.mode !== 'compress';
  $('cGo').hidden = !has;
  if (!has) return;
  if (S.mode === 'convert') renderTargets(); else renderSize();
  updateGo();
}

function renderTargets() {
  const box = $('groups');
  const q = $('q').value.trim().toLowerCase();
  if (!S.src) {
    box.innerHTML = `<p class="none">AnyConvert does not recognise <b>.${esc(S.file.name.split('.').pop())}</b> files yet.</p>`;
    $('toCount').textContent = ''; $('q').hidden = true; $('more').hidden = true;
    return;
  }
  const all = targetsFor(S.src, { mac: MAC, info: S.info });
  $('q').hidden = all.length < 8;
  $('toCount').textContent = all.length ? `${all.length} formats` : '';
  /* a target picked before the probe landed may no longer make sense */
  if (S.target && !all.includes(S.target)) { S.target = null; updateGo(); }

  if (!all.length) {
    const why = S.src.kind === 'office'
      ? `${S.src.label} files can be <b>compressed</b> here - switch to Compress above. Converting them to other document formats needs the Mac app.`
      : `There is nothing to convert ${esc(S.src.label)} into yet.`;
    box.innerHTML = `<p class="none">${why}</p>`;
    $('more').hidden = true;
    return;
  }

  const match = t => !q || t.label.toLowerCase().includes(q) || t.id.includes(q) || t.ext.includes(q)
    || (t.note || '').toLowerCase().includes(q);
  const shown = all.filter(match);

  const sug = (SUGGEST[S.src.kind] || []).map(id => BY_ID[id]).filter(t => t && shown.includes(t));
  const rest = shown.filter(t => !sug.includes(t));
  const groups = [];
  if (sug.length && !q) groups.push(['Popular', sug, true]);
  const order = S.src.kind === 'video' ? ['video', 'audio', 'image', 'doc'] : ['audio', 'video', 'image', 'doc', 'office'];
  for (const k of order) {
    const g = (q ? shown : rest).filter(t => (t.animated ? 'image' : t.kind) === k);
    if (g.length) groups.push([groupName(k), g, false]);
  }

  box.innerHTML = groups.map(([h, list, isSug]) =>
    `<div class="grp"><div class="grp-h">${h}</div><div class="chips">${
      list.map(t => chip(t, isSug)).join('')}</div></div>`).join('')
    || `<p class="none">No format matches “${esc(q)}”.</p>`;

  box.querySelectorAll('.chip').forEach(b => b.onclick = () => pick(BY_ID[b.dataset.id]));

  /* say what is missing and why, rather than leave a gap to puzzle over */
  const notes = [];
  const i = S.info;
  if (S.src.kind === 'video' && i && i.duration > 0 && !i.audio) {
    notes.push('This video has no sound, so there is no audio to extract.');
  }
  if (S.src.kind === 'video' && i && i.duration > 0 && !i.video) {
    notes.push('This file only has sound in it, so it can only become audio.');
  }
  /* name the actual extras rather than promise a category that may not apply */
  const extra = MAC ? [] : targetsFor(S.src, { mac: true, info: S.info }).filter(t => !all.includes(t));
  if (extra.length) {
    const names = extra.map(t => t.label);
    const list = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
    notes.push(`${list} ${extra.length === 1 ? 'is' : 'are'} available in the AnyConvert Mac app.`);
  }
  $('more').hidden = !notes.length;
  $('more').textContent = notes.join(' ');
}

function groupName(k) {
  if (k === 'image' && (S.src.kind === 'video' || S.src.animated)) return 'Animation & stills';
  return { audio: 'Audio', video: 'Video', image: 'Image', doc: 'Document', office: 'Document' }[k];
}

function chip(t, sug) {
  const on = S.target === t;
  const sub = t.note && t.note.length < 18 ? `<small>${esc(t.note)}</small>` : '';
  return `<button type="button" class="chip${sug ? ' sug' : ''}" data-id="${t.id}" aria-pressed="${on}"
    title="${esc(t.label)}${t.note ? ' — ' + esc(t.note) : ''} (.${t.ext})">${esc(t.label)}${sub}</button>`;
}

function pick(t) {
  S.target = t;
  resetOutcome();
  document.querySelectorAll('#groups .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === t.id));
  updateGo();
  $('go').focus({ preventScroll: true });
  $('cGo').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('q').addEventListener('input', renderTargets);
$('q').addEventListener('keydown', e => {
  if (e.key === 'Enter') { const first = document.querySelector('#groups .chip'); if (first) pick(BY_ID[first.dataset.id]); }
});

/* ---- target size ---- */

function renderSize() {
  const src = S.src, f = S.file;
  const box = $('quick');
  if (!src || !canCompress(src, { mac: MAC })) {
    box.innerHTML = '';
    $('size').disabled = true;
    const why = !src ? 'This file type is not supported.'
      : src.write === null && !src.compress ? `${src.label} is a read-only format here - convert it first, then compress the result.`
      : src.mac ? `${src.label} compression needs the Mac app.`
      : `${src.label} cannot be compressed here.`;
    $('sizeHint').innerHTML = `<span class="bad">${esc(why)}</span>`;
    return;
  }
  $('size').disabled = false;

  const picks = [];
  for (const p of [0.75, 0.5, 0.25]) picks.push({ label: `${Math.round(p * 100)}%`, bytes: f.size * p });
  for (const mb of [25, 10, 5, 2, 1, 0.5]) {
    const b = mb * 1024 * 1024;
    if (b < f.size * 0.9 && b > f.size * 0.02) picks.push({ label: mb < 1 ? `${mb * 1000} KB` : `${mb} MB`, bytes: b });
  }
  box.innerHTML = picks.slice(0, 7).map(p =>
    `<button type="button" class="chip" data-b="${Math.round(p.bytes)}">${p.label}</button>`).join('');
  box.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    const n = +b.dataset.b;
    const useKB = n < 1024 * 1024;
    setUnit(useKB ? 'KB' : 'MB');
    $('size').value = trimNum(useKB ? n / 1024 : n / 1024 / 1024);
    sizeChanged();
    $('go').focus({ preventScroll: true });
  });
  sizeChanged();
}

function setUnit(u) {
  S.unit = u;
  document.querySelectorAll('.unit button').forEach(b => b.setAttribute('aria-pressed', b.dataset.u === u));
}
document.querySelectorAll('.unit button').forEach(b => b.onclick = () => {
  const bytes = targetBytes();
  setUnit(b.dataset.u);
  if (bytes) $('size').value = trimNum(S.unit === 'KB' ? bytes / 1024 : bytes / 1024 / 1024);
  sizeChanged();
});
$('size').addEventListener('input', () => {
  /* digits and one decimal point only */
  const v = $('size').value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  if (v !== $('size').value) $('size').value = v;
  sizeChanged();
});
$('size').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('go').disabled) go(); });

function targetBytes() {
  const n = parseFloat($('size').value);
  if (!n || n <= 0) return 0;
  return Math.round(n * (S.unit === 'KB' ? 1024 : 1024 * 1024));
}

function sizeChanged() {
  resetOutcome();
  const t = targetBytes(), f = S.file;
  const hint = $('sizeHint');
  document.querySelectorAll('#quick .chip').forEach(c =>
    c.setAttribute('aria-pressed', Math.abs(+c.dataset.b - t) < Math.max(1024, t * 0.01)));
  if (!f) return;
  if (!t) { hint.innerHTML = `Now <b>${fmtBytes(f.size)}</b>. Type the size you need, or pick one above.`; }
  else if (t >= f.size) { hint.innerHTML = `<span class="bad">That is bigger than the file already is (${fmtBytes(f.size)}).</span>`; }
  else {
    const pct = Math.round((1 - t / f.size) * 100);
    let warn = '';
    const floor = minimumFor(S.src, S.info);
    if (floor && t < floor) warn = ` <span class="bad">· below about ${fmtBytes(floor)} this can't sound or look right</span>`;
    hint.innerHTML = `<b>${fmtBytes(f.size)}</b> → <b class="good">${fmtBytes(t)}</b> · ${pct}% smaller${warn}`;
  }
  updateGo();
}

/* rough floors, so the warning shows before the work does */
function minimumFor(src, info) {
  if (!src || !info?.duration) return 0;
  const d = info.duration;
  if (src.compress === 'abr') return Math.round((src.minKbps || 8) * 1000 / 8 * d);
  if (src.compress === 'vbr') return Math.round((info.audio ? 32 + 30 : 30) * 1000 / 8 * d / 0.96);
  return 0;
}

/* ---------------------------------------------------------------- */
/* 3 - go                                                             */
/* ---------------------------------------------------------------- */

function updateGo() {
  const b = $('go');
  if (S.mode === 'convert') {
    b.disabled = !S.target;
    b.textContent = S.target ? `Convert to ${S.target.label}` : 'Choose a format';
  } else {
    const t = targetBytes();
    const ok = S.src && canCompress(S.src, { mac: MAC }) && t > 0 && t < S.file.size;
    b.disabled = !ok;
    b.textContent = ok ? `Compress to ${fmtBytes(t)}` : 'Set a target size';
  }
}

$('go').onclick = go;
$('eRetry').onclick = go;

async function go() {
  const job = ++S.job;
  show('work');
  const file = S.file, src = S.src, mode = S.mode;
  const target = S.target, bytes = targetBytes();

  const heavy = router.needsFF(src, target, mode);
  label(mode === 'convert' ? `Converting to ${target.label}…` : `Compressing to ${fmtBytes(bytes)}…`);
  progress(null);

  try {
    /* the engine, if this job needs it and it is not already warm */
    if (heavy) {
      await media.ensureFF((p, msg) => {
        if (job !== S.job) return;
        if (msg && p < 1) { sub(msg); }
        if (p < 1) progress(p, 'engine');
      });
      if (job !== S.job) return;
      sub('');
    }
    /* compression needs the duration; wait for the probe if it is still out */
    let info = S.info;
    if (!info && (src.kind === 'audio' || src.kind === 'video' || src.animated)) {
      sub('Reading the file…');
      info = S.info = await (S.probing || media.probe(file, src.ext));
      sub('');
    }
    if (job !== S.job) return;

    const onP = p => { if (job === S.job) progress(p); };
    progress(0);
    const t0 = performance.now();
    const r = mode === 'convert'
      ? await router.convertJob(file, src, target, info, onP)
      : await router.compressJob(file, src, bytes, info, onP);
    if (job !== S.job) return;
    finish(r, performance.now() - t0);
  } catch (e) {
    if (job !== S.job) return;
    console.error(e);
    fail(e);
  }
}

$('cancel').onclick = () => {
  S.job++;
  media.cancel();                  /* kills the worker; the next job reloads it */
  resetOutcome();
};

function finish(r, ms) {
  S.result = r;
  if (S.url) URL.revokeObjectURL(S.url);
  S.url = URL.createObjectURL(r.blob);

  $('dName').textContent = r.name;
  const before = S.file.size, after = r.blob.size;
  if (S.mode === 'compress') {
    const pct = Math.round((1 - after / before) * 100);
    $('dSize').innerHTML = `${fmtBytes(before)} → <b>${fmtBytes(after)}</b> · ${pct > 0 ? pct + '% smaller' : 'no smaller'}`;
  } else {
    $('dSize').innerHTML = `<b>${fmtBytes(after)}</b>${r.pages ? ` · ${r.pages} pages` : ''} · done in ${fmtTime(ms)}`;
  }
  const note = $('dNote');
  note.textContent = r.note || '';
  note.hidden = !r.note;
  note.classList.toggle('warn', !!(r.over || r.lossy));

  preview(r);
  show('done');
  ev(S.mode === 'convert' ? 'anyconvert_convert' : 'anyconvert_compress',
     { from: S.src?.id, to: S.mode === 'convert' ? S.target?.id : S.src?.id });
  $('dl').focus({ preventScroll: true });
}

function preview(r) {
  const box = $('dPrev');
  box.innerHTML = '';
  const type = r.blob.type || '';
  const name = r.name.toLowerCase();
  const probe = document.createElement('video');
  if (/^image\/(jpeg|png|webp|gif|avif|apng|svg)/.test(type) || /\.(jpe?g|png|webp|gif)$/.test(name)) {
    const i = new Image(); i.src = S.url; i.alt = 'Preview'; box.appendChild(i);
  } else if (/^video\//.test(type) && probe.canPlayType(type)) {
    const v = document.createElement('video');
    v.src = S.url; v.controls = true; v.playsInline = true; v.preload = 'metadata';
    box.appendChild(v);
  } else if (/^audio\//.test(type) && probe.canPlayType(type)) {
    const a = document.createElement('audio');
    a.src = S.url; a.controls = true; a.preload = 'metadata';
    box.appendChild(a);
  }
}

$('dl').onclick = () => { save(S.result.blob, S.result.name); ev('anyconvert_download'); };

/* the tip jar - same wording and events as the other iMAP tools */
$('tipBtn').onclick = () => {
  const open = $('tip').hidden;
  $('tip').hidden = !open;
  $('tipBtn').innerHTML = open ? '\u2615\u00a0 Maybe later' : '\u2615\u00a0 Buy us a chai';
  if (open) ev('tip_open');
};
/* the UPI deep link only does anything on a phone */
$('upiOpen').hidden = !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
document.addEventListener('click', e => {
  if (e.target.closest('[data-tip="pay"]')) ev('tip_upi_open');
  if (e.target.closest('[data-outro="classes"]')) ev('outro_classes_click');
});

/* Usage events, through the site's analytics.js when it is loaded. Formats and
   modes only - never a file name, size or anything from inside a file. */
function ev(name, extra = {}) {
  if (window.track) window.track(name, { tool: 'AnyConvert', ...extra });
}
$('again').onclick = $('eAgain').onclick = () => { clearFile(); scrollTo({ top: 0, behavior: 'smooth' }); };

async function save(blob, name) {
  const n = router.native();
  if (n?.save) return n.save(blob, name);          /* the Mac app shows a real save panel */
  const a = document.createElement('a');
  a.href = S.url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

function fail(e) {
  let msg = e?.message || String(e);
  const t = S.target, s = S.src;
  if (/does not contain any stream|Output file is empty|matches no streams/i.test(msg)) {
    msg = t?.kind === 'audio'
      ? 'This file has no sound in it, so there is nothing to turn into audio.'
      : `There is nothing in this file that can become ${t ? t.label : 'that format'}.`;
  } else if (/Invalid data found|could not find codec|moov atom not found|Invalid argument|EBML header parsing failed/i.test(msg)) {
    msg = `This file could not be read. It may be damaged, cut short, or not really a ${s?.label || ''} file.`.replace('  ', ' ');
  } else if (/Decoder .* not found|unknown codec|Unsupported codec/i.test(msg)) {
    msg = 'This file uses a codec AnyConvert cannot read in the browser.'
      + (MAC ? '' : ' The Mac app can handle more.');
  } else if (/memory|out of bounds|RangeError|Aborted/i.test(msg)) {
    msg = 'This file is too large for the browser to hold in memory. '
      + (MAC ? 'Try a smaller target, or split it first.' : 'The AnyConvert Mac app handles big files much better.');
  } else if (/threads/i.test(msg)) {
    /* first visit: the isolation worker needs one reload to take control */
    msg += ' ';
  }
  $('eMsg').textContent = msg;
  show('err');
  ev('anyconvert_error', { mode: S.mode, from: S.src?.id, to: S.target?.id });
}

/* ---------------------------------------------------------------- */
/* state helpers                                                      */
/* ---------------------------------------------------------------- */

function show(which) {
  $('goIdle').hidden = which !== 'idle';
  $('goWork').hidden = which !== 'work';
  $('goDone').hidden = which !== 'done';
  $('goErr').hidden = which !== 'err';
  /* while working, nothing upstream can change under it */
  const lock = which === 'work';
  document.querySelectorAll('#cTo button, #cTo input, #cSize button, #cSize input, #fClear, .seg button')
    .forEach(el => { el.disabled = lock || (el.id === 'size' && S.src && !canCompress(S.src, { mac: MAC })); });
}
function resetOutcome() {
  if ($('goWork') && !$('goWork').hidden) return;
  show('idle');
  updateGo();
}
function label(t) { $('wLabel').textContent = t; }
function sub(t) { $('wSub').textContent = t; }
function progress(p, phase) {
  const bar = $('bar');
  if (p == null) { bar.classList.add('ind'); $('pct').textContent = ''; return; }
  bar.classList.remove('ind');
  $('barFill').style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
  $('pct').textContent = phase === 'engine' ? `${Math.round(p * 100)}% · one-time download` : `${Math.round(p * 100)}%`;
}

/* ---------------------------------------------------------------- */

function fmtBytes(n) { return media.fmtBytes(n); }
function fmtDur(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
function fmtTime(ms) { return ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : fmtDur(ms / 1000); }
function trimNum(n) { return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, ''); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

show('idle');
