/**
 * iMAP payment log — Google Apps Script backend.
 *
 * Receives a payment claim from pay.html, records it in a Google Sheet,
 * emails the payer a receipt and iMAP an alert. Deploy as a Web App
 * ("Execute as: Me", "Who has access: Anyone"). See SETUP.md.
 *
 * SECURITY NOTE: a UPI deep link cannot be verified by a web page, so every
 * row lands as PENDING. The amounts below — not the ones the browser sends —
 * are authoritative; a mismatch is flagged rather than trusted. Always
 * reconcile against your bank statement before marking a row VERIFIED.
 */

var CONFIG = {
  ADMIN_EMAIL: 'indiemovementartproject@gmail.com',
  BRAND: 'Indie Movement Art Project',
  SITE: 'https://indiemovementartproject.com',
  WHATSAPP: '918454880061',
  SHEET_NAME: 'Payments',
  CYAN: '#0f9aa0'                    // readable on white email backgrounds
};

/** Authoritative prices. MUST match the ITEMS table in pay.html. */
var PRICES = (function () {
  var p = {
    'ws-pass-vashi':    { label: 'All workshops — Vashi',        amount: 2000 },
    'ws-pass-seawoods': { label: 'All workshops — Seawoods',     amount: 3000 },
    'ws-pass-both':     { label: 'All workshops — both studios', amount: 4500 },
    'ws-v-17aug':   { label: 'Choreography Workshop (Chura Liya Hai) · 17 Aug Vashi',   amount: 500 },
    'ws-v-18aug':   { label: 'Kids Dance Workshop (Dance Ka Bhoot) · 18 Aug Vashi',     amount: 500 },
    'ws-v-19aug-a': { label: 'Bollywood Workshop (Gun Gun Guna Re) · 19 Aug Vashi',     amount: 500 },
    'ws-v-19aug-b': { label: 'Jazz Funk Workshop (Taki Taki) · 19 Aug Vashi',           amount: 500 },
    'ws-v-27aug':   { label: 'Contemporary Workshop (Ae Dil Hai Mushkil) · 27 Aug Vashi', amount: 500 },
    'ws-v-31aug':   { label: 'Hip Hop Workshop · 31 Aug Vashi',                         amount: 500 },
    'ws-s-23aug':   { label: 'Semi Classical Choreography (Vachindamma) · 23 Aug Seawoods', amount: 500 },
    'ws-s-27aug':   { label: 'Juniors Demo Class (Lut Put Gaya) · 27 Aug Seawoods',     amount: 500 },
    'ws-s-29aug-a': { label: 'Kids Ballet Demo Class · 29 Aug Seawoods',                amount: 500 },
    'ws-s-29aug-b': { label: 'Bollywood Workshop (Just Chill) · 29 Aug Seawoods',       amount: 500 },
    'ws-s-29aug-c': { label: 'Jazz Choreography Workshop (Way I Are) · 29 Aug Seawoods', amount: 500 },
    'ws-s-30aug-a': { label: 'Jazz Funk Choreography (Whine Up) · 30 Aug Seawoods',     amount: 500 },
    'ws-s-30aug-b': { label: 'Afro & Dancehall Workshop (Haseen) · 30 Aug Seawoods',    amount: 500 },
    'ws-s-30aug-c': { label: 'Open Style Choreography (Pal Pal) · 30 Aug Seawoods',     amount: 500 },
    'ws-s-06sep':   { label: 'Ballet Training Class · 6 Sept Seawoods',                 amount: 500 }
  };
  /* Regular classes, from September: ₹2800 for 1 month, ₹7500 for 3. */
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
               'Name', 'Phone', 'Email', 'UPI transaction ID', 'Reference',
               'Verified by', 'Verified at', 'Notes'];

/* ------------------------------------------------------------------ */

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'Bad request.' }); }

    var v = validate(body);
    if (!v.ok) return json({ ok: false, error: v.error });
    var d = v.data;

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (isDuplicate(d)) return json({ ok: false, error: 'We already have this transaction ID on file. Message us on WhatsApp if that looks wrong.' });
      var receipt = nextReceipt();
      appendRow(receipt, d);
      try { mailPayer(receipt, d); } catch (err) {}
      try { mailAdmin(receipt, d); } catch (err) {}
      return json({ ok: true, receipt: receipt });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: 'Server error. Please message us on WhatsApp.' });
  }
}

function doGet() {
  return HtmlService.createHtmlOutput('<p>iMAP payment endpoint is running.</p>');
}

function json(obj) {
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

  /* email is optional; validated only when supplied */
  var email = s(b.email, 90);
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { ok: false, error: 'That email doesn\'t look right — fix it or leave it blank.' };

  var utr = s(b.utr, 24).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9]{8,24}$/.test(utr)) return { ok: false, error: 'Please enter the UPI transaction ID from your payment app.' };

  var ref = s(b.ref, 20).replace(/[^A-Za-z0-9\-]/g, '');
  var claimed = Number(b.totalShown);
  if (!isFinite(claimed)) claimed = 0;

  var flags = [];
  if (claimed !== expected) flags.push('TOTAL MISMATCH: page showed ' + claimed + ', expected ' + expected);

  return { ok: true, data: {
    lines: lines.join(' | '), ids: ids.join(', '), qty: qtys.join(', '),
    expected: expected, claimed: claimed, flags: flags.join(' | '),
    name: name, phone: phone, email: email, utr: utr, ref: ref
  }};
}

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0b2b2e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('C2:C').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['PENDING', 'VERIFIED', 'REJECTED'], true).build());
  }
  return sh;
}

function isDuplicate(d) {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return false;
  var utrs = sh.getRange(2, 13, last - 1, 1).getValues();   // column M
  for (var i = 0; i < utrs.length; i++) {
    if (String(utrs[i][0]).trim().toLowerCase() === d.utr.toLowerCase()) return true;
  }
  return false;
}

function nextReceipt() {
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty('receiptSeq') || '0') + 1;
  props.setProperty('receiptSeq', String(n));
  var yr = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yy');
  return 'IMAP-' + yr + '-' + ('000' + n).slice(-4);
}

function appendRow(receipt, d) {
  sheet().appendRow([
    Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss'),
    receipt, 'PENDING', d.lines, d.ids, d.qty,
    d.expected, d.claimed, d.flags,
    d.name, "'" + d.phone, d.email, "'" + d.utr, d.ref,
    '', '', ''
  ]);
}

/* ------------------------------------------------------------------ */

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
    '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.08)">' +
      '<div style="background:#08171a;padding:26px 28px">' +
        '<div style="color:' + CONFIG.CYAN + ';font-size:11px;letter-spacing:.22em;text-transform:uppercase">' +
          esc(CONFIG.BRAND) + '</div>' +
        '<div style="color:#fff;font-size:26px;margin-top:8px">' + esc(title) + '</div>' +
        '<div style="display:inline-block;margin-top:12px;padding:5px 12px;border-radius:99px;font-size:11px;' +
          'letter-spacing:.12em;text-transform:uppercase;background:' + badgeColor + '22;color:' + badgeColor +
          ';border:1px solid ' + badgeColor + '55">' + esc(badge) + '</div>' +
      '</div>' +
      '<div style="padding:24px 28px">' + inner + '</div>' +
      '<div style="padding:16px 28px 24px;border-top:1px solid #eceff0;color:#8a9a9c;font-size:12px;line-height:1.6">' +
        'Questions? WhatsApp us on +91 ' + esc(CONFIG.WHATSAPP.slice(2)) + '.<br>' +
        '<a href="' + esc(CONFIG.SITE) + '" style="color:' + CONFIG.CYAN + '">' + esc(CONFIG.SITE) + '</a>' +
      '</div>' +
    '</div></div>';
}

function mailPayer(receipt, d) {
  if (!d.email) return;                       /* email is optional — nothing to send to */
  var body = '<p style="font:15px/1.65 -apple-system,Segoe UI,sans-serif;color:#12211f;margin:0 0 18px">' +
      'Hi ' + esc(d.name.split(/\s+/)[0]) + ', thanks for your payment. Here’s your receipt. ' +
      'We’re checking it against our records and will confirm your spot shortly — usually within a few hours.</p>' +
    '<table style="width:100%;border-collapse:collapse">' +
      row('Receipt', receipt) + row('For', d.lines) +
      row('Total', '₹' + d.expected) + row('UPI transaction ID', d.utr) + row('Reference', d.ref) +
    '</table>';
  MailApp.sendEmail({
    to: d.email,
    subject: 'Your iMAP receipt · ' + receipt,
    htmlBody: shell('Payment received', 'Pending verification', '#c07a20', body),
    name: CONFIG.BRAND,
    replyTo: CONFIG.ADMIN_EMAIL
  });
}

function mailAdmin(receipt, d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var flagBlock = d.flags
    ? '<div style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#fff4e5;border:1px solid #f0c188;' +
      'color:#8a5510;font:13px/1.6 -apple-system,Segoe UI,sans-serif"><b>Check this one:</b> ' + esc(d.flags) + '</div>'
    : '';
  var body = flagBlock +
    '<table style="width:100%;border-collapse:collapse">' +
      row('Receipt', receipt) + row('For', d.lines) +
      row('Total', '₹' + d.expected) + row('Name', d.name) + row('Phone', d.phone) +
      row('Email', d.email || '— not given —') + row('UPI transaction ID', d.utr) + row('Reference', d.ref) +
    '</table>' +
    '<p style="margin:20px 0 0"><a href="' + esc(ss.getUrl()) + '" ' +
      'style="display:inline-block;background:#08171a;color:#fff;text-decoration:none;padding:12px 20px;' +
      'border-radius:10px;font:14px -apple-system,Segoe UI,sans-serif">Open the payments sheet</a></p>' +
    '<p style="font:12px/1.6 -apple-system,Segoe UI,sans-serif;color:#8a9a9c;margin:16px 0 0">' +
      'Match this against your bank statement, then set the row’s status to VERIFIED (or REJECTED). ' +
      'Setting VERIFIED emails the payer a confirmation automatically.</p>';
  MailApp.sendEmail({
    to: CONFIG.ADMIN_EMAIL,
    subject: (d.flags ? '⚠️ ' : '') + 'New payment · ₹' + d.expected + ' · ' + d.name,
    htmlBody: shell('New payment claim', d.flags ? 'Needs a look' : 'Pending verification', d.flags ? '#c0392b' : '#c07a20', body),
    name: 'iMAP Payments',
    replyTo: d.email || CONFIG.ADMIN_EMAIL
  });
}

/* ------------------------------------------------------------------ */
/** Installable onEdit trigger: emails the payer when you mark a row VERIFIED. */
function onStatusEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== CONFIG.SHEET_NAME) return;
    if (e.range.getColumn() !== 3 || e.range.getRow() < 2) return;
    if (String(e.value).toUpperCase() !== 'VERIFIED') return;

    var r = e.range.getRow();
    var vals = sh.getRange(r, 1, 1, HEADERS.length).getValues()[0];
    var receipt = vals[1], label = vals[3], amount = vals[6],
        name = vals[9], email = vals[11], utr = String(vals[12]).replace(/^'/, '');
    if (!email) return;                        /* nothing to confirm to; tell them on WhatsApp */

    sh.getRange(r, 15).setValue(Session.getActiveUser().getEmail() || 'admin');
    sh.getRange(r, 16).setValue(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss'));

    var body = '<p style="font:15px/1.65 -apple-system,Segoe UI,sans-serif;color:#12211f;margin:0 0 18px">' +
        'Hi ' + esc(String(name).split(/\s+/)[0]) + ', your payment is confirmed and your spot is booked. See you in the studio!</p>' +
      '<table style="width:100%;border-collapse:collapse">' +
        row('Receipt', receipt) + row('For', label) +
        row('Total', '₹' + amount) + row('UPI transaction ID', utr) +
      '</table>';
    MailApp.sendEmail({
      to: email,
      subject: 'Confirmed! Your iMAP booking · ' + receipt,
      htmlBody: shell('Payment confirmed', 'Confirmed', '#1c8f5a', body),
      name: CONFIG.BRAND,
      replyTo: CONFIG.ADMIN_EMAIL
    });
  } catch (err) {}
}

/** Run once from the editor to create the sheet and grant permissions. */
function setup() {
  sheet();
  SpreadsheetApp.getActiveSpreadsheet().toast('Payments sheet ready.');
}
