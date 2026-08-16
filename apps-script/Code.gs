/**
 * iMAP payments — Google Apps Script backend.
 *
 * Takes an order from pay.html together with the payer's UPI screenshot,
 * reads the screenshot with Google Drive's OCR, checks the amount and the
 * date, records everything in a Sheet, and forwards the screenshot to
 * whoever is on the iMAP WhatsApp.
 *
 * Deploy as a Web App ("Execute as: Me", "Who has access: Anyone").
 * See SETUP.md — the Drive advanced service must be switched on for OCR.
 *
 * WHAT THE CHECK IS AND ISN'T: reading a screenshot proves what the image
 * says, not that money moved. Images can be edited. Treat a pass as "very
 * probably fine, and worth a glance" rather than proof — which is exactly
 * why every screenshot still reaches a human.
 */

/* Bump this whenever you paste a new copy in. Visiting the /exec URL in a browser
   prints it, so you can always tell which version the web app is actually serving. */
var BUILD = '2026-08-16-a';

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
    'contemporary-seawoods': 'Contemporary (Seawoods)',
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
  for (var slug in BATCHES) {
    for (var k in PLANS) {
      p['rc-' + slug + '-' + k] = { label: BATCHES[slug] + ' — ' + PLANS[k].label, amount: PLANS[k].amount };
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

    /* Read the screenshot before taking the lock — OCR is the slow part. */
    var shot = null;
    try { shot = readScreenshot(body.screenshot, d); } catch (err) { shot = null; }

    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      /* One transaction can only pay for one booking. */
      if (shot && shot.utr && utrAlreadyUsed(shot.utr)) {
        shot.verified = false;
        shot.summary = (shot.summary || '') + ' · DUPLICATE TXN';
        shot.reason = 'This transaction has already been used for another booking.';
        d.flags = (d.flags ? d.flags + ' | ' : '') + 'DUPLICATE TRANSACTION ID ' + shot.utr;
      }
      var receipt = nextReceipt();
      appendRow(receipt, d, shot);
      try { mailAdmin(receipt, d, shot); } catch (err) {}
      if (shot && shot.verified) { try { sendConfirmation(receipt, d); } catch (err) {} }
      return json({
        ok: true,
        receipt: receipt,
        verified: !!(shot && shot.verified),
        /* customer-safe wording only — never a raw API error */
        message: (shot && shot.verified)
          ? 'Amount and date check out.'
          : (shot && shot.deferred)
            ? 'We’re still checking your screenshot and will confirm very shortly.'
            : 'The studio is checking your screenshot.'
      });
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

/* ---------------- screenshot: store, read, judge ---------------- */

function readScreenshot(dataUrl, d) {
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

  /* Drive throttles OCR. A short limit clears in seconds, so try again before
     giving up — the payer is waiting, so keep the total under a few seconds. */
  var text = '', ocrError = '', attempt;
  for (attempt = 0; attempt < 3; attempt++) {
    try { text = ocrImage(blob); ocrError = ''; break; }
    catch (err) {
      ocrError = String((err && err.message) || err).slice(0, 160);
      if (!/rate limit|quota|timed out|try again/i.test(ocrError)) break;   /* not transient */
      if (attempt < 2) Utilities.sleep(attempt === 0 ? 1200 : 2500);
    }
  }

  var verdict = judge(text, d.expected, d.ref);
  verdict.deferred = false;
  if (!text && ocrError) {
    verdict.summary = 'not readable — ' + ocrError;          /* technical, for the sheet + team */
    verdict.reason  = ocrError;
    /* A throttle is our problem, not theirs: queue it for a retry in the background. */
    verdict.deferred = /rate limit|quota|timed out|try again/i.test(ocrError);
  }
  verdict.blob = blob;
  verdict.url = url;
  verdict.text = text;
  return verdict;
}

/**
 * Google Drive will OCR an image if you ask it to convert to a Doc.
 * v2 and v3 of the advanced service take different arguments — v3 has no `ocr`
 * flag and rejects it, so passing one there quietly produced no text at all.
 * Throws with a readable reason rather than returning '' so the cause reaches
 * the sheet instead of a bare "not readable".
 */
function ocrImage(blob) {
  if (typeof Drive === 'undefined' || !Drive.Files) {
    throw new Error('Drive advanced service is not switched on');
  }
  var file;
  if (Drive.Files.insert) {
    /* Drive v2: `ocr: true` already implies conversion to a Doc. Naming the Doc
       mimeType here makes Drive read it as the SOURCE type and refuse with
       "OCR is not supported for files of type application/vnd.google-apps.document". */
    file = Drive.Files.insert(
      { title: 'imap-ocr-tmp' },
      blob, { ocr: true, ocrLanguage: 'en' });
  } else if (Drive.Files.create) {                /* Drive v3 — conversion comes from the mimeType */
    file = Drive.Files.create(
      { name: 'imap-ocr-tmp', mimeType: 'application/vnd.google-apps.document' },
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

/** Does this screenshot show the right amount, paid today? */
function judge(text, expected, ref) {
  if (!text) {
    return { verified: false, amountOK: false, dateOK: false, statusOK: false, utr: '', refState: 'absent',
             reason: 'The screenshot could not be read automatically.', summary: 'not readable' };
  }
  var t = String(text).toLowerCase().replace(/\s+/g, ' ');

  /* amount — prefer a currency-marked number, fall back to any number */
  var amountOK = hasAmount(t, expected, true) || hasAmount(t, expected, false);

  /* date — today, in any of the shapes UPI apps use */
  var dateOK = false, i;
  var todays = dateStrings(new Date());
  for (i = 0; i < todays.length; i++) { if (t.indexOf(todays[i]) !== -1) { dateOK = true; break; } }

  var statusOK = /success|completed|complete|paid|payment done|sent|transferred/.test(t);

  var utr = '';
  var r = t.match(/(?:upi|utr|txn|transaction)[^0-9]{0,20}(\d{9,14})/) || t.match(/\b(\d{12})\b/);
  if (r) utr = r[1];

  /* Payment apps copy our reference into the note, so when it's legible it ties
     the screenshot to THIS order. A different iMAP reference means a recycled
     image from another booking, which must never auto-confirm. */
  var refState = 'absent', seen = t.match(/imap-[a-z0-9]{6}/gi);
  if (seen && ref) {
    var want = String(ref).toLowerCase(), hit = false, other = false;
    for (i = 0; i < seen.length; i++) {
      if (seen[i].toLowerCase() === want) hit = true; else other = true;
    }
    refState = hit ? 'match' : (other ? 'mismatch' : 'absent');
  }

  var verified = amountOK && dateOK && refState !== 'mismatch';
  var why = [];
  if (!amountOK) why.push('the amount on the screenshot doesn\'t match the order total');
  if (!dateOK) why.push('we couldn\'t see today\'s date on it');
  if (refState === 'mismatch') why.push('it carries a different payment reference');

  return {
    verified: verified, amountOK: amountOK, dateOK: dateOK, statusOK: statusOK,
    utr: utr, refState: refState,
    reason: verified ? 'Amount and date check out.' : ('We couldn\'t auto-confirm: ' + why.join(', ') + '.'),
    summary: (amountOK ? 'amount ✓' : 'amount ✗') + ' · ' + (dateOK ? 'date ✓' : 'date ✗') +
             ' · ' + (statusOK ? 'success ✓' : 'success ?') +
             (refState === 'match' ? ' · ref ✓' : refState === 'mismatch' ? ' · REF MISMATCH' : '')
  };
}

function hasAmount(t, expected, currencyOnly) {
  /* OCR routinely reads ₹ as € or R, so treat those as rupee marks too */
  var re = currencyOnly ? /(?:₹|€|rs\.?|inr|r)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi
                        : /([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g;
  var m;
  while ((m = re.exec(t)) !== null) {
    var v = Number(String(m[1]).replace(/,/g, ''));
    if (isFinite(v) && Math.abs(v - expected) < 0.01) return true;
  }
  return false;
}

/** Every way a UPI app might print today's date. */
function dateStrings(now) {
  var tz = CONFIG.TZ, f = function (p) { return Utilities.formatDate(now, tz, p).toLowerCase(); };
  var d = f('d'), dd = f('dd'), mon = f('MMM'), month = f('MMMM'), mm = f('MM'), m1 = f('M'), yyyy = f('yyyy'), yy = f('yy');
  return ['today',
    d + ' ' + mon, dd + ' ' + mon, d + ' ' + month, dd + ' ' + month,
    mon + ' ' + d, mon + ' ' + dd, month + ' ' + d, month + ' ' + dd,
    d + ' ' + mon + ' ' + yyyy, dd + ' ' + mon + ' ' + yyyy,
    dd + '/' + mm + '/' + yyyy, d + '/' + m1 + '/' + yyyy,
    dd + '-' + mm + '-' + yyyy, d + '-' + m1 + '-' + yyyy,
    dd + '.' + mm + '.' + yyyy,
    dd + '/' + mm + '/' + yy, dd + '-' + mm + '-' + yy,
    yyyy + '-' + mm + '-' + dd];
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

/** Has this UPI transaction already paid for something? */
function utrAlreadyUsed(utr) {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return false;
  var seen = sh.getRange(2, 13, last - 1, 1).getValues();   /* column M — UPI ref */
  var want = String(utr).replace(/^'/, '').trim();
  for (var i = 0; i < seen.length; i++) {
    if (String(seen[i][0]).replace(/^'/, '').trim() === want) return true;
  }
  return false;
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
    receipt, shot && shot.verified ? 'VERIFIED' : 'PENDING',
    d.lines, d.ids, d.qty,
    d.expected, d.claimed, d.flags,
    d.name, "'" + d.phone, d.email,
    shot && shot.utr ? "'" + shot.utr : '', d.ref,
    shot && shot.url ? shot.url : '',
    shot ? shot.summary : 'no screenshot',
    shot && shot.verified ? 'auto · screenshot' : '',
    shot && shot.verified ? Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss') : '',
    ''
  ]);
}

/* ---------------- email ---------------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function row(k, v) {
  return '<tr><td style="padding:9px 0;color:#6b7b7d;font:12px -apple-system,Segoe UI,sans-serif;' +
         'text-transform:uppercase;letter-spacing:.08em">' + esc(k) + '</td>' +
         '<td style="padding:9px 0;text-align:right;font:15px -apple-system,Segoe UI,sans-serif;color:#12211f">' +
         esc(v) + '</td></tr>';
}

function shell(title, badge, badgeColor, inner) {
  return '<div style="background:#f4f7f7;padding:28px 16px;font-family:-apple-system,Segoe UI,sans-serif">' +
    '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.08)">' +
      '<div style="background:#08171a;padding:26px 28px">' +
        '<div style="color:' + CONFIG.CYAN + ';font-size:11px;letter-spacing:.22em;text-transform:uppercase">' + esc(CONFIG.BRAND) + '</div>' +
        '<div style="color:#fff;font-size:26px;margin-top:8px">' + esc(title) + '</div>' +
        '<div style="display:inline-block;margin-top:12px;padding:5px 12px;border-radius:99px;font-size:11px;' +
          'letter-spacing:.12em;text-transform:uppercase;background:' + badgeColor + '22;color:' + badgeColor +
          ';border:1px solid ' + badgeColor + '55">' + esc(badge) + '</div>' +
      '</div>' +
      '<div style="padding:24px 28px">' + inner + '</div>' +
      '<div style="padding:16px 28px 24px;border-top:1px solid #eceff0;color:#8a9a9c;font-size:12px;line-height:1.6">' +
        'Questions? WhatsApp +91 ' + esc(CONFIG.ENQUIRY_WHATSAPP.slice(2)) + '.<br>' +
        '<a href="' + esc(CONFIG.SITE) + '" style="color:' + CONFIG.CYAN + '">' + esc(CONFIG.SITE) + '</a>' +
      '</div>' +
    '</div></div>';
}

/** Goes to whoever is on the iMAP WhatsApp, with the screenshot attached. */
function mailAdmin(receipt, d, shot) {
  var passed = shot && shot.verified;
  var body =
    (passed
      ? '<div style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#e8f7ee;border:1px solid #9ad9b4;' +
        'color:#186c40;font:13px/1.6 -apple-system,Segoe UI,sans-serif"><b>Auto-checked and confirmed.</b> ' +
        esc(shot.summary) + ' — the customer has already been told they\'re confirmed.</div>'
      : '<div style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#fff4e5;border:1px solid #f0c188;' +
        'color:#8a5510;font:13px/1.6 -apple-system,Segoe UI,sans-serif"><b>Needs your eyes.</b> ' +
        esc(shot ? shot.reason : 'No screenshot was attached.') + '</div>') +
    (d.flags ? '<div style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#fdecea;border:1px solid #f0a9a1;' +
        'color:#8a2018;font:13px/1.6 -apple-system,Segoe UI,sans-serif"><b>Check this:</b> ' + esc(d.flags) + '</div>' : '') +
    '<table style="width:100%;border-collapse:collapse">' +
      row('Name', d.name) + row('Contact', '+91 ' + d.phone) +
      row('Email', d.email || '— not given —') +
      row('Paid', '₹' + d.expected) + row('For', d.lines) +
      row('Receipt', receipt) +
      (shot && shot.utr ? row('UPI ref (read off image)', shot.utr) : '') +
      row('Reference', d.ref) +
    '</table>' +
    '<p style="font:12px/1.6 -apple-system,Segoe UI,sans-serif;color:#8a9a9c;margin:14px 0 0">' +
      (shot && shot.blob ? 'Their payment screenshot is attached.' : 'No screenshot came through.') + '</p>' +
    '<p style="margin:20px 0 0"><a href="https://wa.me/91' + esc(d.phone) + '?text=' +
      encodeURIComponent('Hi ' + d.name.split(/\s+/)[0] + '! Thanks for your payment of ₹' + d.expected +
        ' for ' + d.lines + '. Your booking is confirmed — receipt ' + receipt + '. See you in the studio!') + '" ' +
      'style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:12px 20px;' +
      'border-radius:10px;font:14px -apple-system,Segoe UI,sans-serif">WhatsApp ' + esc(d.name.split(/\s+/)[0]) +
      ' — message ready</a></p>' +
    (shot && shot.url ? '<p style="font:12px -apple-system,Segoe UI,sans-serif;margin:14px 0 0">' +
      '<a href="' + esc(shot.url) + '" style="color:' + CONFIG.CYAN + '">Open the screenshot in Drive</a></p>' : '');

  var to = CONFIG.NOTIFY.slice(0);
  var opts = {
    to: to.shift(),
    subject: (passed ? '✅ ' : '⚠️ ') + 'Payment · ₹' + d.expected + ' · ' + d.name + ' · ' + receipt,
    htmlBody: shell(passed ? 'Payment confirmed' : 'Payment needs checking',
                    passed ? 'Auto-verified' : 'Needs a look',
                    passed ? '#1c8f5a' : '#c07a20', body),
    name: 'iMAP Payments',
    replyTo: d.email || CONFIG.ADMIN_EMAIL
  };
  if (to.length) opts.cc = to.join(',');
  if (shot && shot.blob) opts.attachments = [shot.blob];
  MailApp.sendEmail(opts);
}

/** The customer's "you're confirmed" email. Only possible if they gave one. */
function sendConfirmation(receipt, d) {
  if (!d.email) return;
  var body = '<p style="font:15px/1.65 -apple-system,Segoe UI,sans-serif;color:#12211f;margin:0 0 18px">' +
      'Hi ' + esc(String(d.name).split(/\s+/)[0]) + ', your payment is confirmed and your spot is booked. See you in the studio!</p>' +
    '<table style="width:100%;border-collapse:collapse">' +
      row('Receipt', receipt) + row('For', d.lines) + row('Total', '₹' + d.expected) + row('Reference', d.ref) +
    '</table>';
  MailApp.sendEmail({
    to: d.email,
    subject: 'Confirmed! Your iMAP booking · ' + receipt,
    htmlBody: shell('Payment confirmed', 'Confirmed', '#1c8f5a', body),
    name: CONFIG.BRAND,
    replyTo: CONFIG.ADMIN_EMAIL
  });
}

/** Marking a row VERIFIED by hand emails the customer, same as the auto path. */
function onStatusEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== CONFIG.SHEET_NAME) return;
    if (e.range.getColumn() !== COL.STATUS || e.range.getRow() < 2) return;
    if (String(e.value).toUpperCase() !== 'VERIFIED') return;

    var r = e.range.getRow();
    if (String(sh.getRange(r, COL.VBY).getValue()).indexOf('auto') === 0) return;   /* already done */
    sh.getRange(r, COL.VBY).setValue(Session.getActiveUser().getEmail() || 'admin');
    sh.getRange(r, COL.VAT).setValue(Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'));

    var v = sh.getRange(r, 1, 1, HEADERS.length).getValues()[0];
    sendConfirmation(v[1], { lines: v[3], expected: v[6], name: v[9], email: v[11], ref: v[13] });
  } catch (err) {}
}

/* ------------------------------------------------------------------ */
/**
 * Anything the OCR could not read at the time of payment gets picked up here
 * a few minutes later, when Drive's throttle has cleared. If it passes, the
 * row becomes VERIFIED and the customer is emailed their confirmation — so a
 * Google rate limit delays a confirmation instead of losing it.
 *
 * Install once with installRecheckTrigger().
 */
function recheckPending() {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return;
  var rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var done = 0;

  for (var i = 0; i < rows.length && done < 5; i++) {      /* a few per run, to stay inside quota */
    var r = i + 2;
    if (String(rows[i][COL.STATUS - 1]).toUpperCase() !== 'PENDING') continue;
    if (String(rows[i][COL.CHECK - 1]).indexOf('not readable') !== 0) continue;

    var link = String(rows[i][COL.SHOT - 1]);
    var m = /[-\w]{25,}/.exec(link);
    if (!m) continue;

    var expected = Number(rows[i][6]), ref = String(rows[i][13]);
    try {
      var text = ocrImage(DriveApp.getFileById(m[0]).getBlob());
      done++;
      if (!text) continue;
      var v = judge(text, expected, ref);
      sh.getRange(r, COL.CHECK).setValue(v.summary + ' (rechecked)');
      if (v.utr) sh.getRange(r, 13).setValue("'" + v.utr);
      if (v.verified) {
        sh.getRange(r, COL.STATUS).setValue('VERIFIED');
        sh.getRange(r, COL.VBY).setValue('auto · screenshot (recheck)');
        sh.getRange(r, COL.VAT).setValue(Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'));
        try {
          sendConfirmation(String(rows[i][1]), {
            lines: String(rows[i][3]), expected: expected,
            name: String(rows[i][9]), email: String(rows[i][11]), ref: ref
          });
        } catch (err) {}
      }
    } catch (err) {
      done++;                                  /* still throttled — leave it for the next run */
    }
  }
}

/** Run once: retries unreadable screenshots every 10 minutes. */
function installRecheckTrigger() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'recheckPending') ScriptApp.deleteTrigger(all[i]);
  }
  ScriptApp.newTrigger('recheckPending').timeBased().everyMinutes(10).create();
  Logger.log('Recheck trigger installed — unreadable screenshots retry every 10 minutes.');
}

/* ---------------- setup + self-test ---------------- */

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

/**
 * Run this from the editor if Auto-check says "not readable".
 * It takes the most recent screenshot a customer actually uploaded, pushes it
 * through the real OCR path, and prints what Drive could read plus the verdict.
 * Read the output under Execution log.
 */
function testOcr() {
  Logger.log('build ' + BUILD);

  if (typeof Drive === 'undefined' || !Drive.Files) {
    Logger.log('FAIL — the Drive advanced service is not switched on.');
    Logger.log('Fix: editor sidebar > Services > + > Drive API > Add, then re-deploy.');
    return;
  }
  Logger.log('Drive service: ' + (Drive.Files.insert ? 'v2 (Files.insert)' : 'v3 (Files.create)'));

  var folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER);
  if (!folders.hasNext()) {
    Logger.log('No "' + CONFIG.DRIVE_FOLDER + '" folder yet — take a payment first, then run this.');
    return;
  }
  var files = folders.next().getFiles(), newest = null;
  while (files.hasNext()) {
    var f = files.next();
    if (!newest || f.getDateCreated() > newest.getDateCreated()) newest = f;
  }
  if (!newest) { Logger.log('The folder is empty — no screenshot has arrived yet.'); return; }
  Logger.log('Testing on: ' + newest.getName() + ' (' + Math.round(newest.getSize() / 1024) + ' KB)');

  try {
    var text = ocrImage(newest.getBlob());
    if (!text || !text.replace(/\s/g, '')) {
      Logger.log('FAIL — Drive accepted the image but read no text from it.');
      Logger.log('Try a full, uncropped screenshot rather than a photo of a screen.');
      return;
    }
    Logger.log('Drive read this:');
    Logger.log(text.slice(0, 500));
    Logger.log('---');
    Logger.log('Verdict against ₹500: ' + JSON.stringify(judge(text, 500, '')));
    Logger.log('If amount/date show ✗ above, the wording just needs matching — send me this log.');
  } catch (err) {
    Logger.log('FAIL — ' + ((err && err.message) || err));
  }
}

/** Check the screenshot reader without spending a real payment. */
function testJudge() {
  var today = Utilities.formatDate(new Date(), CONFIG.TZ, 'd MMM yyyy');
  var samples = [
    ['good GPay',   '₹500 Paid to Rohit Choudhary Completed ' + today + ' 7:42 pm UPI transaction ID 419988776655', 500],
    ['wrong amount','₹200 Paid Completed ' + today + ' 7:42 pm', 500],
    ['old date',    '₹500 Paid Completed 2 Jan 2020 7:42 pm', 500],
    ['no text',     '', 500]
  ];
  for (var i = 0; i < samples.length; i++) {
    Logger.log(samples[i][0] + ' -> ' + JSON.stringify(judge(samples[i][1], samples[i][2])));
  }
}
