/*!
 * Copyright (c) 2026 Indie Movement Art Project. All rights reserved.
 * Author: Prashant Nair. Proprietary - see LICENSE. Not open source.
 */
/**
 * iMAP payments — Google Apps Script backend.
 *
 * Takes an order from pay.html together with the payer's UPI screenshot,
 * re-prices the order from PRICES so the page cannot decide what is charged,
 * files the screenshot in Drive, records the order in a Sheet, and emails the
 * team and the payer.
 *
 * Deploy as a Web App ("Execute as: Me", "Who has access: Anyone").
 *
 * WHAT IS AND IS NOT CHECKED AUTOMATICALLY
 *
 *   Checked:     the prices. The server recomputes the total from PRICES and
 *                flags the row if the page claimed a different figure.
 *
 *   NOT checked: the screenshot. Nothing here opens the image, so a receipt
 *                for Rs 1 against an order for Rs 599 will arrive looking
 *                completely normal. Screenshot OCR was removed deliberately:
 *                it was unreliable, it hit Drive rate limits, and a screenshot
 *                only ever proves what an image says, not that money moved.
 *
 * So every row lands as PENDING and a human confirms the amount against the
 * UPI account before marking it VERIFIED. The team email states the exact
 * figure to look for.
 */

/* Bump this whenever you paste a new copy in. Visiting the /exec URL in a browser
   prints it, so you can always tell which version the web app is actually serving. */
var BUILD = '2026-08-26-a';

var CONFIG = {
  ADMIN_EMAIL:   'indiemovementartproject@gmail.com',
  /* Everyone who should hear about a payment. Add or remove freely — the first
     address is the To:, the rest are copied in. */
  NOTIFY: [
    'chikajain@gmail.com',                 // Ruchika — iMAP WhatsApp
    'rohitchoudhary91.rc@gmail.com',       // Rohit — the account being paid
    'indiemovementartproject@gmail.com'    // studio record
  ],
  BRAND: 'Indie Movement Art Project',
  SITE:  'https://indiemovementartproject.com',
  ENQUIRY_WHATSAPP: '918454880061',   // Ruchika — enquiries + screenshots
  PAYMENT_WHATSAPP: '919870538332',   // Rohit — money
  SHEET_NAME:   'Payments',
  /* Leave blank when the script lives inside the sheet (Extensions → Apps Script).
     If you made a STANDALONE script at script.google.com instead, paste the
     spreadsheet id here — it's the long string in the sheet's URL between
     /d/ and /edit. Everything else works exactly the same either way. */
  SHEET_ID:     '',
  DRIVE_FOLDER: 'iMAP payment screenshots',
  TZ:   'Asia/Kolkata',
  CYAN: '#0f9aa0'
};

/** Authoritative prices. Must match cart.js. */
var PRICES = (function () {
  var p = {
    'test-1':           { label: 'Test payment',                 amount: 1 },
    'xb-retro-member':  { label: 'Retro-Jazz Workshop · 27 Aug · CrossBox member',     amount: 199 },
    'xb-retro-guest':   { label: 'Retro-Jazz Workshop · 27 Aug · non-member',          amount: 599 },
    'ws-pass-vashi':    { label: 'All workshops — Vashi',        amount: 2000 },
    'ws-pass-seawoods': { label: 'All workshops — Seawoods',     amount: 3000 },
    'ws-pass-both':     { label: 'All workshops — both studios', amount: 4500 },
    'ws-v-17aug':   { label: 'Choreography Workshop (Chura Liya Hai) · 17 Aug Vashi',     amount: 500 },
    'ws-v-18aug':   { label: 'Kids Dance Workshop (Dance Ka Bhoot) · 18 Aug Vashi',       amount: 500 },
    'ws-v-19aug-a': { label: 'Bollywood Workshop (Gun Gun Guna Re) · 19 Aug Vashi',       amount: 500 },
    'ws-v-19aug-b': { label: 'Jazz Funk Workshop (Taki Taki) · 19 Aug Vashi',             amount: 500 },
    'ws-v-27aug':   { label: 'Contemporary Workshop (Ae Dil Hai Mushkil) · 27 Aug Vashi', amount: 500 },
    'ws-v-31aug':   { label: 'Hip Hop Workshop · 31 Aug Vashi',                           amount: 500 },
    'ws-s-23aug':   { label: 'Semi Classical Choreography (Vachindamma) · 23 Aug Seawoods', amount: 500 },
    'ws-s-27aug':   { label: 'Juniors Demo Class (Lut Put Gaya) · 27 Aug Seawoods',       amount: 500 },
    'ws-s-29aug-a': { label: 'Kids Ballet Demo Class · 29 Aug Seawoods',                  amount: 500 },
    'ws-s-29aug-b': { label: 'Bollywood Workshop (Just Chill) · 29 Aug Seawoods',         amount: 500 },
    'ws-s-29aug-c': { label: 'Jazz Choreography Workshop (Way I Are) · 29 Aug Seawoods',  amount: 500 },
    'ws-s-30aug-a': { label: 'Jazz Funk Choreography (Whine Up) · 30 Aug Seawoods',       amount: 500 },
    'ws-s-30aug-b': { label: 'Afro & Dancehall Workshop (Haseen) · 30 Aug Seawoods',      amount: 500 },
    'ws-s-30aug-c': { label: 'Open Style Choreography (Pal Pal) · 30 Aug Seawoods',       amount: 500 },
    'ws-s-06sep':   { label: 'Ballet Training Class · 6 Sept Seawoods',                   amount: 500 }
  };
  var BATCHES = {
    'contemporary-seawoods': 'Ballet Training (Seawoods)',
    'contemporary-vashi': 'Contemporary (Vashi)',
    'bollywood-seawoods': 'Bollywood (Seawoods)',
    'bollywood-advance-vashi': 'Bollywood Advance (Vashi)',
    'juniors-seawoods': 'Juniors (Seawoods)',
    'kids-vashi': 'Kids (Vashi)',
    'jazz-funk': 'Jazz Funk (Seawoods)',
    'jazz-training': 'Jazz Training (Seawoods)',
    'open-style': 'Open Style (Seawoods)',
    'afro-dancehall': 'Afro & Dancehall (Seawoods)'
  };
  var PLANS = { '1m': { label: '1 month', amount: 2800 }, '3m': { label: '3 months', amount: 7500 } };
  /* Batches that charge their own rates. Must match `fees` in cart.js. */
  var FEES = {
    'juniors-seawoods': { '1m': 2500, '3m': 6500 },
    'kids-vashi':       { '1m': 2000, '3m': 5400 }
  };
  for (var slug in BATCHES) {
    for (var k in PLANS) {
      p['rc-' + slug + '-' + k] = {
        label: BATCHES[slug] + ' — ' + PLANS[k].label,
        amount: (FEES[slug] && FEES[slug][k]) || PLANS[k].amount
      };
    }
  }
  return p;
})();

var HEADERS = ['Timestamp', 'Receipt', 'Status', 'Items', 'Item IDs', 'Qty',
               'Total (expected)', 'Total (claimed)', 'Flags',
               'Name', 'Phone', 'Email', 'UPI ref', 'Reference',
               'Screenshot', 'Auto-check', 'Verified by', 'Verified at', 'Notes'];

var COL = { STATUS: 3, SHOT: 15, CHECK: 16, VBY: 17, VAT: 18 };

/* ------------------------------------------------------------------ */

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents); }
    catch (err) { return json({ ok: false, error: 'Bad request.' }); }

    var v = validate(body);
    if (!v.ok) return json({ ok: false, error: v.error });
    var d = v.data;

    /* File the screenshot, but never let a Drive hiccup fail an order that has
       already been paid — the record and the emails matter more than the filing. */
    var shot = null;
    try { shot = storeScreenshot(body.screenshot, d); } catch (err) { shot = null; }

    /* The screenshot check is advisory. A mismatch is the loud case — it is
       exactly the "paid Rs 1 against a Rs 599 order" situation. A failure to
       read is quiet, because that is our problem, not the payer's. */
    if (shot && shot.check) {
      if (shot.check.ran && shot.check.amountOK === false) {
        d.flags = (d.flags ? d.flags + ' | ' : '') +
          'AMOUNT MISMATCH: order is Rs ' + d.expected +
          (shot.check.seen ? ', screenshot appears to show Rs ' + shot.check.seen : ', screenshot does not show that figure');
      }
      if (shot.check.utr) d.utr = shot.check.utr;
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      var receipt = nextReceipt();
      appendRow(receipt, d, shot);
      try { mailTeam(receipt, d, shot); } catch (err) {}
      try { mailPayer(receipt, d); } catch (err) {}
      return json({ ok: true, receipt: receipt });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: 'Server error. Please message us on WhatsApp.' });
  }
}

function doGet() {
  return HtmlService.createHtmlOutput(
    '<p>iMAP payment endpoint is running.</p><p>build ' + BUILD +
    ' · items ' + Object.keys(PRICES).length + '</p>');
}

function json(obj) {
  /* Every reply carries the build, so which version handled an order is never
     a guess — a stale deployment shows up in the very first response. */
  obj.build = BUILD;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */

function validate(b) {
  function s(x, max) { return String(x == null ? '' : x).trim().slice(0, max || 120); }

  var raw = b.items;
  if (!(raw instanceof Array) || !raw.length) return { ok: false, error: 'Your cart is empty.' };
  if (raw.length > 30) return { ok: false, error: 'Too many items in one order.' };

  var lines = [], ids = [], qtys = [], expected = 0, i;
  for (i = 0; i < raw.length; i++) {
    var id = s(raw[i] && raw[i].id, 40);
    if (!PRICES.hasOwnProperty(id)) return { ok: false, error: 'One of the items is no longer available. Please reload and try again.' };
    var qty = parseInt(raw[i].qty, 10);
    if (!(qty >= 1 && qty <= 20)) qty = 1;
    expected += PRICES[id].amount * qty;
    lines.push(PRICES[id].label + (qty > 1 ? ' x' + qty : ''));
    ids.push(id); qtys.push(qty);
  }

  var name = s(b.name, 60);
  if (name.length < 2) return { ok: false, error: 'Please enter your name.' };

  var phone = s(b.phone, 14).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) return { ok: false, error: 'Please enter a valid 10-digit contact number.' };

  var email = s(b.email, 90);            /* optional */
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    return { ok: false, error: 'That email doesn\'t look right — fix it or leave it blank.' };
  }

  var ref = s(b.ref, 20).replace(/[^A-Za-z0-9\-]/g, '');
  var claimed = Number(b.totalShown);
  if (!isFinite(claimed)) claimed = 0;

  var flags = [];
  if (claimed !== expected) flags.push('TOTAL MISMATCH: page showed ' + claimed + ', expected ' + expected);

  return { ok: true, data: {
    lines: lines.join(' | '), ids: ids.join(', '), qty: qtys.join(', '),
    expected: expected, claimed: claimed, flags: flags.join(' | '),
    name: name, phone: phone, email: email, ref: ref
  }};
}

/* ---------------- screenshot ---------------- */

/** Save the screenshot to Drive, and try to read the amount off it.
 *
 *  The reading is ADVISORY ONLY. It never confirms a booking and the payer is
 *  never told what it found — that is what made the old version painful, when
 *  a Drive throttle told a paying customer their screenshot was "not readable".
 *  Every row still lands as PENDING for a human. All this does is put a loud
 *  warning in the team email when the figure on the image is not the figure
 *  that was ordered.
 */
function storeScreenshot(dataUrl, d) {
  var m = /^data:(image\/[a-z.+-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1],
    'imap-' + d.ref + '-' + d.name.replace(/[^A-Za-z0-9]/g, '') + '.jpg');
  var url = '';
  try {
    var folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER);
    url = folder.createFile(blob).getUrl();
  } catch (err) {}

  var check = { ran: false, amountOK: null, seen: '', utr: '', note: '' };
  try { check = readAmount(blob, d.expected); }
  catch (err) { check.note = String((err && err.message) || err).slice(0, 140); }

  return { blob: blob, url: url, check: check };
}

/** Drive will OCR an image if asked to convert it to a Doc. Returns what it
 *  made of the amount. Never throws — a failure just means "could not read". */
function readAmount(blob, expected) {
  var out = { ran: false, amountOK: null, seen: '', utr: '', note: '' };
  var text = '', lastErr = '';

  /* Drive throttles OCR and a short limit clears in seconds. The payer is
     waiting, so try briefly and then give up quietly. */
  for (var attempt = 0; attempt < 2; attempt++) {
    try { text = ocrImage(blob); lastErr = ''; break; }
    catch (err) {
      lastErr = String((err && err.message) || err).slice(0, 140);
      if (!/rate limit|quota|timed out|try again|internal/i.test(lastErr)) break;
      if (attempt === 0) Utilities.sleep(1500);
    }
  }

  if (!text) { out.note = lastErr || 'no text found in the image'; return out; }

  out.ran = true;
  var t = String(text).toLowerCase().replace(/\s+/g, ' ');

  function nums(re) {
    var found = [], mm;
    while ((mm = re.exec(t)) !== null) {
      var v = Number(String(mm[1]).replace(/,/g, ''));
      /* anything this large is a transaction id or a phone number, not a fee */
      if (isFinite(v) && v > 0 && v < 1000000) found.push(v);
    }
    return found;
  }

  /* A currency marker must stand on its own, otherwise the "e" of "Note" turns
     the transaction id into an amount. OCR often reads the rupee sign as R or e. */
  var marked = nums(/(?:^|\s)(?:\u20b9|\u20ac|rs\.?|inr|r|e)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi);
  var loose  = nums(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g);

  function has(list) {
    for (var i = 0; i < list.length; i++) if (Math.abs(list[i] - expected) < 0.01) return true;
    return false;
  }
  out.amountOK = has(marked) || has(loose);

  if (!out.amountOK) {
    /* Only ever report a currency-marked figure. Guessing from bare numbers
       puts the transaction id in the email and destroys trust in the check. */
    var best = null;
    for (var k = 0; k < marked.length; k++) if (best === null || marked[k] > best) best = marked[k];
    out.seen = best === null ? '' : String(best);
  }

  var r = t.match(/(?:upi|utr|txn|transaction)[^0-9]{0,20}(\d{9,14})/) || t.match(/\b(\d{12})\b/);
  if (r) out.utr = r[1];
  return out;
}

/** v2 and v3 of the Drive advanced service take different arguments.
 *  v2: `ocr: true` already implies conversion, so naming the Doc mimeType
 *      makes Drive read it as the SOURCE type and refuse.
 *  v3: there is no `ocr` flag; conversion comes from the mimeType. */
function ocrImage(blob) {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw new Error('Drive advanced service is not switched on');
  }
  var file;
  if (Drive.Files.insert) {
    file = Drive.Files.insert({ title: 'imap-ocr-tmp' }, blob, { ocr: true, ocrLanguage: 'en' });
  } else if (Drive.Files.create) {
    file = Drive.Files.create({ name: 'imap-ocr-tmp', mimeType: 'application/vnd.google-apps.document' },
                              blob, { ocrLanguage: 'en' });
  } else {
    throw new Error('Drive service present but Files.insert/create missing');
  }
  var id = file.id || (file.getId && file.getId());
  if (!id) throw new Error('Drive returned no file id');
  var text = '';
  try { text = DocumentApp.openById(id).getBody().getText(); }
  finally { try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {} }
  return text;
}

/* ---------------- sheet ---------------- */

/** The spreadsheet, whether the script is bound to it or standalone. */
function book() {
  if (CONFIG.SHEET_ID) return SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('No spreadsheet. Set CONFIG.SHEET_ID for a standalone script.');
  return active;
}

function sheet() {
  var ss = book();
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0b2b2e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange(2, COL.STATUS, sh.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['PENDING', 'VERIFIED', 'REJECTED'], true).build());
  }
  return sh;
}

function nextReceipt() {
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty('receiptSeq') || '0') + 1;
  props.setProperty('receiptSeq', String(n));
  return 'IMAP-' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yy') + '-' + ('000' + n).slice(-4);
}

function appendRow(receipt, d, shot) {
  sheet().appendRow([
    Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'),
    receipt, 'PENDING',                    /* internal only — never shown to the payer */
    d.lines, d.ids, d.qty,
    d.expected, d.claimed, d.flags,
    d.name, "'" + d.phone, d.email,
    d.utr || '', d.ref,
    shot && shot.url ? shot.url : '',
    !shot ? 'no screenshot'
      : !shot.check || !shot.check.ran ? 'screenshot on file - not read (' + ((shot.check && shot.check.note) || 'unknown') + ')'
      : shot.check.amountOK ? 'screenshot on file - amount looks right'
      : 'screenshot on file - AMOUNT MISMATCH' + (shot.check.seen ? ' (reads Rs ' + shot.check.seen + ')' : ''),
    '', '', ''
  ]);
}

/* ---------------- email ---------------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/**
 * One field per row, label stacked above value.
 * A two-column layout cannot shrink below its widest cell, so a long item list
 * or email address pushed the whole card wider than a phone screen. Stacked
 * rows are a single column — there is nothing left that can overflow.
 */
function row(k, v) {
  return '<tr><td style="padding:11px 0;border-bottom:1px solid #eef1f2">' +
    '<div style="font:11px -apple-system,Segoe UI,sans-serif;color:#6b7b7d;' +
      'letter-spacing:.08em;text-transform:uppercase">' + esc(k) + '</div>' +
    '<div style="font:15px/1.45 -apple-system,Segoe UI,sans-serif;color:#12211f;' +
      'margin-top:4px;word-break:break-word;overflow-wrap:break-word">' + esc(v) + '</div>' +
    '</td></tr>';
}

function shell(title, badge, badgeColor, inner) {
  /* Without this meta the client guesses the encoding and UTF-8 arrives as
     mojibake — the rupee sign turned into 'Cp' and the middle dot into '¬∑'. */
  return '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +
    '<div style="margin:0;padding:16px 10px;background:#f4f7f7">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
      'style="width:100%;max-width:520px;margin:0 auto;border-collapse:collapse;' +
      'background:#ffffff;border-radius:16px;overflow:hidden">' +
      '<tr><td style="background:#08171a;padding:22px 20px">' +
        '<div style="font:11px -apple-system,Segoe UI,sans-serif;color:' + CONFIG.CYAN + ';' +
          'letter-spacing:.18em;text-transform:uppercase">' + esc(CONFIG.BRAND) + '</div>' +
        '<div style="font:24px/1.25 -apple-system,Segoe UI,sans-serif;color:#ffffff;margin-top:7px">' +
          esc(title) + '</div>' +
        (badge ? '<div style="display:inline-block;margin-top:11px;padding:5px 11px;border-radius:99px;' +
          'font:11px -apple-system,Segoe UI,sans-serif;letter-spacing:.1em;text-transform:uppercase;' +
          'background:' + badgeColor + '22;color:' + badgeColor + ';border:1px solid ' + badgeColor + '55">' +
          esc(badge) + '</div>' : '') +
      '</td></tr>' +
      '<tr><td style="padding:20px">' + inner + '</td></tr>' +
      '<tr><td style="padding:14px 20px 20px;border-top:1px solid #eceff0;' +
        'font:12px/1.6 -apple-system,Segoe UI,sans-serif;color:#8a9a9c;word-break:break-word">' +
        'Questions? WhatsApp +91 ' + esc(CONFIG.ENQUIRY_WHATSAPP.slice(2)) + '.<br>' +
        '<a href="' + esc(CONFIG.SITE) + '" style="color:' + CONFIG.CYAN + '">' + esc(CONFIG.SITE) + '</a>' +
      '</td></tr>' +
    '</table></div>';
}

/** To the team: everything needed to confirm the payment and reach the payer. */
/* Subjects go out as a raw mail header, and MailApp will not encode them, so
   anything above plain ASCII arrives as mojibake (Rs became 'Çπ', the middle
   dot became '¬∑'). Keep every subject ASCII. Bodies are HTML and are fine. */
function mailTeam(receipt, d, shot) {
  var body =
    '<div style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#eef6f7;border:1px solid #bcd9dc;' +
      'color:#134e52;font:13px/1.6 -apple-system,Segoe UI,sans-serif">' +
      'Confirm the screenshot shows <b>exactly &#8377;' + d.expected + '</b> paid into the iMAP UPI account. ' +
      'If it shows any other amount, or you cannot find the payment, <b>do not mark this VERIFIED</b> &mdash; ' +
      'message them first. Nothing here reads the screenshot for you.' +
    '</div>' +
    (d.flags ? '<div style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#fdecea;border:1px solid #f0a9a1;' +
        'color:#8a2018;font:13px/1.6 -apple-system,Segoe UI,sans-serif"><b>Check this:</b> ' + esc(d.flags) + '</div>' : '') +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed">' +
      row('Name', d.name) + row('Contact', '+91 ' + d.phone) +
      row('Email', d.email || '— not given —') +
      row('Screenshot must show', '<b style="font-size:17px">&#8377;' + d.expected + '</b>' +
        (!shot || !shot.check ? ''
          : !shot.check.ran
            ? '<div style="font:12px -apple-system,Segoe UI,sans-serif;color:#8a9a9c;margin-top:4px">'
              + 'We could not read the screenshot automatically - please check it yourself.</div>'
          : shot.check.amountOK
            ? '<div style="font:12px -apple-system,Segoe UI,sans-serif;color:#1a7f4b;margin-top:4px">'
              + 'The screenshot appears to show this amount.</div>'
            : '<div style="font:12px -apple-system,Segoe UI,sans-serif;color:#8a2018;margin-top:4px">'
              + '<b>The screenshot does NOT show this amount'
              + (shot.check.seen ? ' - it reads &#8377;' + esc(shot.check.seen) : '')
              + '.</b></div>')) +
      row('For', d.lines) +
      row('Receipt', receipt) + row('Reference', d.ref) +
    '</table>' +
    '<p style="font:12px/1.6 -apple-system,Segoe UI,sans-serif;color:#8a9a9c;margin:14px 0 0">' +
      (shot && shot.blob ? 'Their payment screenshot is attached.' : 'No screenshot came through.') + '</p>' +
    '<p style="margin:20px 0 0"><a href="https://wa.me/91' + esc(d.phone) + '?text=' +
      encodeURIComponent('Hi ' + d.name.split(/\s+/)[0] + '! Thanks for registering with iMAP — ' +
        'we have your payment of Rs ' + d.expected + ' for ' + d.lines + ' (reference ' + receipt + '). ') + '" ' +
      'style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 20px;' +
      'border-radius:10px;font:14px -apple-system,Segoe UI,sans-serif;word-break:break-word">WhatsApp ' + esc(d.name.split(/\s+/)[0]) + '</a></p>' +
    (shot && shot.url ? '<p style="font:12px -apple-system,Segoe UI,sans-serif;margin:14px 0 0">' +
      '<a href="' + esc(shot.url) + '" style="color:' + CONFIG.CYAN + '">Open the screenshot in Drive</a></p>' : '');

  var to = CONFIG.NOTIFY.slice(0);
  var opts = {
    to: to.shift(),
    subject: (d.flags ? '[CHECK] ' : '') + 'Payment Rs ' + d.expected + ' - ' + d.name + ' - ' + receipt,
    htmlBody: shell('New payment', '', '', body),
    name: 'iMAP Payments',
    replyTo: d.email || CONFIG.ADMIN_EMAIL
  };
  if (to.length) opts.cc = to.join(',');
  if (shot && shot.blob) opts.attachments = [shot.blob];
  MailApp.sendEmail(opts);
}

/**
 * To the payer: warm, but truthful. A screenshot is not proof of payment, so
 * this says the studio is checking rather than claiming the money has landed.
 */
function mailPayer(receipt, d) {
  if (!d.email) return;
  var query = 'Hi, I have a query about the payment ' + receipt + ' for ' + d.lines + '.';
  var wa = 'https://wa.me/' + CONFIG.ENQUIRY_WHATSAPP + '?text=' + encodeURIComponent(query);
  var body = '<p style="font:15px/1.65 -apple-system,Segoe UI,sans-serif;color:#12211f;margin:0 0 18px">' +
      'Hi ' + esc(String(d.name).split(/\s+/)[0]) + ', thank you! Your screenshot has been sent to the ' +
      'studio for verification, and our team will reach out to you on WhatsApp shortly.</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed">' +
      row('Reference', receipt) + row('For', d.lines) + row('Amount', '&#8377;' + d.expected) +
    '</table>' +
    '<p style="margin:20px 0 0"><a href="' + esc(wa) + '" ' +
      'style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 20px;' +
      'border-radius:10px;font:14px -apple-system,Segoe UI,sans-serif">Question about this payment?</a></p>' +
    '<p style="font:13px/1.6 -apple-system,Segoe UI,sans-serif;color:#8a9a9c;margin:18px 0 0">' +
      'Keep this for your records. See you in the studio!</p>';
  MailApp.sendEmail({
    to: d.email,
    subject: "We've got your payment - " + receipt + ' - iMAP',
    htmlBody: shell('Screenshot received', 'Being verified', '#0f9aa0', body),
    name: CONFIG.BRAND,
    replyTo: CONFIG.ADMIN_EMAIL
  });
}

/**
 * Marking a row VERIFIED stamps who did it and when. Nothing is sent to the
 * payer — they were thanked and given their receipt at checkout.
 */
function onStatusEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== CONFIG.SHEET_NAME) return;
    if (e.range.getColumn() !== COL.STATUS || e.range.getRow() < 2) return;
    if (String(e.value).toUpperCase() !== 'VERIFIED') return;
    var r = e.range.getRow();
    sh.getRange(r, COL.VBY).setValue(Session.getActiveUser().getEmail() || 'admin');
    sh.getRange(r, COL.VAT).setValue(Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'));
  } catch (err) {}
}

/* ---------------- setup ---------------- */

/** Run once from the editor to create the sheet and grant permissions. */
function setup() {
  var sh = sheet();
  Logger.log('Payments sheet ready: ' + sh.getParent().getUrl());
  try { SpreadsheetApp.getActiveSpreadsheet().toast('Payments sheet ready.'); } catch (err) {}
}

/**
 * Standalone scripts can't use a simple onEdit trigger, so run this once to
 * attach the "mark VERIFIED → email the customer" trigger to the sheet.
 * Harmless to run for a bound script too.
 */
function installEditTrigger() {
  var id = CONFIG.SHEET_ID || book().getId();
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'onStatusEdit') ScriptApp.deleteTrigger(all[i]);
  }
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(id).onEdit().create();
  Logger.log('Edit trigger installed on ' + id);
}
