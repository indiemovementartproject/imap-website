#!/usr/bin/env node
/*!
 * Copyright (c) 2026 Indie Movement Art Project. All rights reserved.
 * Author: Prashant Nair. Proprietary - see LICENSE. Not open source.
 */
/**
 * The countdown for everything dated on the site. For us, not for visitors.
 *
 *   node scripts/events.js
 *
 * Finds every end date the site knows about:
 *   - data-until="..." on any page (event cards, sections, nav links, JSON-LD)
 *   - until: '...' in SPECIALS in cart.js and PRICES in apps-script/Code.gs
 *   - demoUntil in the batch data in batch.html
 * and prints how long each has left. Ended ones are already hidden from
 * visitors and refused at checkout; they are listed so the source can be
 * cleaned up (RUNBOOK.md, "The featured slot"). Exits 1 if any date is
 * malformed, because a malformed date is NOT enforced anywhere.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?([+-]\d\d:\d\d|Z)$/;
const now = Date.now();
const found = [];

function lineOf(text, index) { return text.slice(0, index).split('\n').length; }
function add(file, text, index, iso, what) {
  found.push({ where: `${file}:${lineOf(text, index)}`, iso, what: what.replace(/\s+/g, ' ').trim().slice(0, 60) });
}

/* pages */
for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /<([a-z]+)([^>]*?)\sdata-until="([^"]*)"([^>]*)>/gi;
  let m;
  while ((m = re.exec(t))) {
    if (t.lastIndexOf('<!--', m.index) > t.lastIndexOf('-->', m.index)) continue;  /* inside a comment (templates) */
    const attrs = m[2] + m[4];
    const id = /\sid="([^"]+)"/.exec(attrs), cls = /\sclass="([^"]+)"/.exec(attrs), href = /\shref="([^"]+)"/.exec(attrs);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 400).replace(/<[^>]+>/g, ' ');
    const label = /application\/ld\+json/.test(attrs) ? 'Event JSON-LD ' + ((/"name":\s*"([^"]+)"/.exec(after) || [])[1] || '')
      : `<${m[1]}${id ? '#' + id[1] : cls ? '.' + cls[1].split(' ')[0] : ''}${href ? ' → ' + href[1] : ''}> ${after}`;
    add(f, t, m.index, m[3], label);
  }
}

/* catalogues */
for (const [f, what] of [['cart.js', 'SPECIALS'], ['apps-script/Code.gs', 'PRICES']]) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /'([a-z0-9-]+)':\s*\{[^}]*?until:\s*'([^']*)'|\{\s*id:\s*'([a-z0-9-]+)'[^}]*?until:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(t))) {
    if (t.lastIndexOf('/*', m.index) > t.lastIndexOf('*/', m.index)) continue;       /* the example in a comment */
    add(f, t, m.index, m[2] || m[4], `${what} ${m[1] || m[3]}`);
  }
}

/* batch demos */
{
  const t = fs.readFileSync(path.join(ROOT, 'batch.html'), 'utf8');
  const re = /"([a-z0-9-]+)":\s*\{[^{}]*?"demoUntil":\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(t))) add('batch.html', t, m.index, m[2], `free demo on batch ${m[1]}`);
}

/* report */
function span(ms) {
  const h = Math.abs(ms) / 3600000;
  return h >= 48 ? `${Math.round(h / 24)} days` : h >= 1 ? `${Math.round(h)} h` : `${Math.round(h * 60)} min`;
}
if (!found.length) {
  console.log('Nothing dated on the site right now.');
  process.exit(0);
}
let bad = 0;
found.sort((a, b) => (Date.parse(a.iso) || 0) - (Date.parse(b.iso) || 0));
for (const e of found) {
  let status;
  if (!ISO.test(e.iso)) { status = `BAD DATE "${e.iso}" - not enforced, fix it`; bad++; }
  else {
    const left = Date.parse(e.iso) - now;
    const grace = 12 * 3600000;                              /* UNTIL_GRACE_MS in Code.gs */
    status = left > 0 ? `ends in ${span(left)}`
      : e.where.startsWith('apps-script') && -left < grace ? `ENDED ${span(left)} ago - late orders OK ${span(grace + left)} more`
      : `ENDED ${span(left)} ago - hidden; delete from source`;
  }
  console.log(`${status.padEnd(44)} ${e.what.padEnd(62)} ${e.where}`);
}
process.exit(bad ? 1 : 0);
