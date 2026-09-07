// Regression test for the clock-format bug that rejected IMAP-26-0023.
//
// Surabhi Gholap paid the right amount to the right person and uploaded the
// screenshot two minutes later. Drive's OCR read her phone's status-bar clock
// - a bare "1:58" on a 12-hour phone - before it reached the receipt line that
// said "1:57 PM". The bare time was parsed as 01:58, putting the payment 721
// minutes in the past, and the order was rejected.
//
// The parser now prefers a time carrying an AM/PM marker, and resolves a bare
// one against the upload time instead of assuming 24-hour.
//
//   node scripts/test-clock-formats.js
//
// It reads the live functions straight out of apps-script/Code.gs, so it fails
// if someone edits the parsing and forgets this case. Run it before deploying
// any change to readWhen, minutesOfDay or otherClockReading.

// Exercise the real readWhen / minutesOfDay / otherClockReading from Code.gs.
const fs = require('fs');
const src = fs.readFileSync('apps-script/Code.gs', 'utf8');
const pick = n => {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('missing ' + n);
  const j = src.indexOf('\n}', i);
  return src.slice(i, j + 2);
};
const MONTHSRC = src.match(/var MONTHS = \{[\s\S]*?\};/)[0];
eval(MONTHSRC + pick('readWhen') + pick('minutesOfDay') + pick('otherClockReading'));

const STALE = 15;
function verdict(ocr, uploadHHMM) {
  const t = ocr.toLowerCase().replace(/\s+/g, ' ');
  const when = readWhen(t);
  const shotMin = minutesOfDay(when.time);
  const [uh, um] = uploadHHMM.split(':').map(Number);
  const nowMin = uh * 60 + um;
  if (shotMin < 0) return { time: when.time, verdict: 'no time' };
  const readings = [shotMin];
  if (!when.timeMarked) { const a = otherClockReading(when.time); if (a >= 0) readings.push(a); }
  let best = null, bestMin = shotMin;
  for (const r of readings) { const d = nowMin - r; if (best === null || Math.abs(d) < Math.abs(best)) { best = d; bestMin = r; } }
  return { time: when.time, marked: when.timeMarked, diff: best,
           ok: best <= STALE && best >= -5,
           resolvedAs: bestMin !== shotMin ? Math.floor(bestMin/60)+':'+String(bestMin%60).padStart(2,'0') : '' };
}

// Surabhi's screenshot, as Drive OCR would flatten it: status-bar clock first,
// transaction time further down.
const surabhi = '1:58 57% amazon pay Thank You ROHIT RAJENDRA CHOUDHA... rohitchoudhary91.rc-1@okicici ' +
  '1500 Banking name: ROHIT RAJENDRA CHOUDHARY Payment of 1500 to ROHIT RAJENDRA CHOUDHARY ' +
  'is successful 29 Aug 2026, 1:57 PM View Details Pay Again';

const cases = [
  ['IMAP-26-0023 (the real one)',            surabhi,                                    '13:59', true ],
  ['same, but phone on 24h clock',           surabhi.replace('1:58','13:58').replace('1:57 PM','13:57'), '13:59', true ],
  ['bare 12h status bar only, no receipt',   '1:58 57% paid 1500 successful 29 aug 2026','13:59', true ],
  ['bare, genuinely early morning',          '1:58 paid 1500 29 aug 2026',               '02:00', true ],
  ['bare 12:30, uploaded 12:33 PM',          '12:30 paid 1500 29 aug 2026',              '12:33', true ],
  ['bare 12:30, uploaded 00:33 (12:30 AM)',  '12:30 paid 1500 29 aug 2026',              '00:33', true ],
  ['marked 9:15 AM, uploaded 9:17 AM',       '9:15 am paid 29 aug 2026 9:15 AM',         '09:17', true ],
  ['marked 9:15 PM, uploaded 9:17 PM',       '9:15 pm paid 29 aug 2026 9:15 PM',         '21:17', true ],
  ['24h 21:15, uploaded 21:17',              '21:15 paid 29 aug 2026 21:15',             '21:17', true ],
  ['genuinely stale: 10:00 AM at 3 PM',      '10:00 am paid 29 aug 2026 10:00 AM',       '15:00', false],
  ['genuinely stale: 24h 09:05 at 15:00',    '09:05 paid 29 aug 2026 15:05',             '15:00', false],
  ['stale by 40 min, marked',                '2:00 pm paid 29 aug 2026 2:00 PM',         '14:40', false],
];

let pass = 0;
for (const [name, ocr, up, want] of cases) {
  const r = verdict(ocr, up);
  const good = r.ok === want;
  if (good) pass++;
  console.log(
    (good ? '  ok   ' : '  FAIL ') +
    name.padEnd(34) + ' read=' + String(r.time).padEnd(10) +
    (r.marked ? 'marked ' : 'bare   ') +
    'diff=' + String(r.diff).padStart(5) + 'm ' +
    (r.ok ? 'ACCEPT' : 'REJECT') +
    (r.resolvedAs ? '  (as ' + r.resolvedAs + ')' : ''));
}
console.log('\n' + pass + '/' + cases.length + ' as expected');
process.exit(pass === cases.length ? 0 : 1);
