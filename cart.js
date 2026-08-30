/*!
 * Copyright (c) 2026 Indie Movement Art Project. All rights reserved.
 * Author: Prashant Nair. Proprietary - see LICENSE. Not open source.
 */
/**
 * iMAP cart — shared by index.html, batches.html, batch.html and pay.html.
 *
 * Holds the single source of truth for what can be bought and for how much.
 * The Apps Script backend keeps its own copy of these prices and re-checks
 * every order, so editing this file cannot change what someone is charged.
 *
 * Keep PRICES in apps-script/Code.gs in step with the amounts below.
 */
(function (global) {
  'use strict';

  var KEY = 'imapCart.v1';
  var PAY_WHATSAPP = '919870538332';   /* payments only */
  var ENQ_WHATSAPP = '918454880061';   /* enquiries, unchanged */

  /* ---------------- catalogue ---------------- */

  /* Orientation Series workshops — ₹500 each, on until the end of August. */
  var WORKSHOPS = [
    { id: 'ws-v-17aug',   title: 'Choreography Workshop',      song: 'Chura Liya Hai',      when: '17 Aug', region: 'Vashi',    who: 'Rohit Choudhary' },
    { id: 'ws-v-18aug',   title: 'Kids Dance Workshop',        song: 'Dance Ka Bhoot',      when: '18 Aug', region: 'Vashi',    who: 'Jeevak' },
    { id: 'ws-v-19aug-a', title: 'Bollywood Workshop',         song: 'Gun Gun Guna Re',     when: '19 Aug', region: 'Vashi',    who: 'Ruchika' },
    { id: 'ws-v-19aug-b', title: 'Jazz Funk Workshop',         song: 'Taki Taki',           when: '19 Aug', region: 'Vashi',    who: 'Ruchika' },
    { id: 'ws-v-27aug',   title: 'Contemporary Workshop',      song: 'Ae Dil Hai Mushkil',  when: '27 Aug', region: 'Vashi',    who: 'Shreya' },
    { id: 'ws-v-31aug',   title: 'Hip Hop Workshop',           song: '',                    when: '31 Aug', region: 'Vashi',    who: 'Rohit Mankar' },
    { id: 'ws-s-23aug',   title: 'Semi Classical Choreography', song: 'Vachindamma',        when: '23 Aug', region: 'Seawoods', who: 'Anamika' },
    { id: 'ws-s-27aug',   title: 'Juniors Demo Class',         song: 'Lut Put Gaya',        when: '27 Aug', region: 'Seawoods', who: 'Jeevak' },
    { id: 'ws-s-29aug-a', title: 'Kids Ballet Demo Class',     song: '',                    when: '29 Aug', region: 'Seawoods', who: 'Shreya' },
    { id: 'ws-s-29aug-b', title: 'Bollywood Workshop',         song: 'Just Chill',          when: '29 Aug', region: 'Seawoods', who: 'Ruchika' },
    { id: 'ws-s-29aug-c', title: 'Jazz Choreography Workshop', song: 'Way I Are',           when: '29 Aug', region: 'Seawoods', who: 'Rohit Choudhary' },
    { id: 'ws-s-30aug-a', title: 'Jazz Funk Choreography',     song: 'Whine Up',            when: '30 Aug', region: 'Seawoods', who: 'Ruchika' },
    { id: 'ws-s-30aug-b', title: 'Afro & Dancehall Workshop',  song: 'Haseen',              when: '30 Aug', region: 'Seawoods', who: 'Tanvi' },
    { id: 'ws-s-30aug-c', title: 'Open Style Choreography',    song: 'Pal Pal',             when: '30 Aug', region: 'Seawoods', who: 'Tej' },
    { id: 'ws-s-06sep',   title: 'Ballet Training Class',      song: '',                    when: '6 Sept', region: 'Seawoods', who: 'Akash' }
  ];
  var WORKSHOP_PRICE = 500;

  /* Orientation Series passes. "All classes" on the standee means all workshops. */
  var PASSES = [
    { id: 'ws-pass-vashi',    title: 'All workshops — Vashi',        detail: 'Orientation Series · every Vashi workshop',    amount: 2000 },
    { id: 'ws-pass-seawoods', title: 'All workshops — Seawoods',     detail: 'Orientation Series · every Seawoods workshop', amount: 3000 },
    { id: 'ws-pass-both',     title: 'All workshops — both studios', detail: 'Orientation Series · Vashi + Seawoods',        amount: 4500 }
  ];

  /* One-off workshops, sold with a direct pay.html?buy=<id> link rather than
     through the cart. Empty between workshops - the Retro-Jazz pair lived here
     until 27 Aug 2026. Clearing this stops the old links taking money for an
     event that has already happened; the server still holds matching prices in
     PRICES, so drop them there too when you retire a workshop for good. */
  var SPECIALS = [];

  /* Regular classes. */
  var BATCHES = {
    'contemporary-seawoods':      { name: 'Ballet Training', region: 'Seawoods', who: 'Akash Jathar' },
    'kids-ballet-seawoods':       { name: 'Kids Ballet', region: 'Seawoods', who: 'Shreya Rastogi',
                                    fees: { '1m': 1500, '3m': 4000 } },
    'contemporary-vashi':         { name: 'Contemporary', region: 'Vashi', who: 'Shreya Rastogi' },
    'bollywood-seawoods':         { name: 'Bollywood Weekends', region: 'Seawoods', who: 'Ruchika Jain' },
    'bollywood-beginners-vashi':  { name: 'Bollywood Beginners', region: 'Vashi', who: 'Ruchika Jain' },
    'bollywood-advance-vashi':    { name: 'Bollywood Advance', region: 'Vashi', who: 'Rohit Choudhary' },
    'juniors-seawoods':           { name: 'Juniors', region: 'Seawoods', who: 'Jeevak Gaikwad',
                                    fees: { '1m': 2500, '3m': 6500 } },
    'kids-vashi':                 { name: 'Kids', region: 'Vashi', who: 'Jeevak Gaikwad',
                                    fees: { '1m': 2000, '3m': 5400 } },
    'jazz-funk':                  { name: 'Jazz Funk', region: 'Seawoods', who: 'Ruchika Jain' },
    'jazz-funk-vashi':            { name: 'Jazz Funk', region: 'Vashi', who: 'Ruchika Jain' },
    'jazz-training':              { name: 'Jazz Training', region: 'Seawoods', who: 'Rohit Choudhary' },
    'open-style':                 { name: 'Open Style', region: 'Seawoods', who: 'Tej' },
    'afro-dancehall':             { name: 'Afro & Dancehall', region: 'Seawoods', who: 'Tanvi Palande' }
  };
  /* Default plan prices. A batch may override them with its own `fees`. */
  var PLANS = [
    { id: '1m', label: '1 month',  amount: 2800 },
    { id: '3m', label: '3 months', amount: 7500 }
  ];

  /** What this batch charges for this plan. */
  function planPrice(slug, planId) {
    var b = BATCHES[slug];
    if (b && b.fees && b.fees[planId]) return b.fees[planId];
    for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === planId) return PLANS[i].amount;
    return 0;
  }

  /** Resolve any purchasable id to {id, title, detail, amount, type}. */
  function lookup(id) {
    var i;
    for (i = 0; i < SPECIALS.length; i++) {
      if (SPECIALS[i].id === id) {
        return { id: id, type: 'workshop', title: SPECIALS[i].title,
                 detail: SPECIALS[i].detail, amount: SPECIALS[i].amount };
      }
    }
    for (i = 0; i < PASSES.length; i++) {
      if (PASSES[i].id === id) {
        return { id: id, type: 'workshop', title: PASSES[i].title, detail: PASSES[i].detail, amount: PASSES[i].amount };
      }
    }
    for (i = 0; i < WORKSHOPS.length; i++) {
      if (WORKSHOPS[i].id === id) {
        var w = WORKSHOPS[i];
        return { id: id, type: 'workshop',
                 title: w.title + (w.song ? ' · ' + w.song : ''),
                 detail: w.when + ' · ' + w.region + ' · ' + w.who,
                 amount: WORKSHOP_PRICE };
      }
    }
    if (id === 'test-1') {
      return { id: id, type: 'test', title: 'Test payment',
               detail: 'Checking the checkout works — not a real booking', amount: 1 };
    }
    var m = /^rc-(.+)-(1m|3m)$/.exec(id);
    if (m && BATCHES[m[1]]) {
      var b = BATCHES[m[1]], p = null;
      for (i = 0; i < PLANS.length; i++) if (PLANS[i].id === m[2]) p = PLANS[i];
      if (p) {
        return { id: id, type: 'class',
                 title: b.name + ' (' + b.region + ') — ' + p.label,
                 detail: 'Regular class · ' + b.who,
                 amount: planPrice(m[1], p.id) };
      }
    }
    return null;
  }

  /* ---------------- storage ---------------- */

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!(raw instanceof Array)) return [];
      var out = [];
      for (var i = 0; i < raw.length; i++) {
        var it = lookup(raw[i] && raw[i].id);          /* re-price from the catalogue every load */
        if (!it) continue;                              /* drop anything no longer sold */
        var q = Math.max(1, Math.min(20, parseInt(raw[i].qty, 10) || 1));
        it.qty = q;
        out.push(it);
      }
      return out;
    } catch (e) { return []; }
  }

  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items.map(function (i) {
        return { id: i.id, qty: i.qty };
      })));
    } catch (e) {}
    paint();
    try { global.dispatchEvent(new CustomEvent('cart:change')); } catch (e) {}
  }

  var Cart = {
    items: read,
    count: function () { return read().reduce(function (n, i) { return n + i.qty; }, 0); },
    total: function () { return read().reduce(function (n, i) { return n + i.amount * i.qty; }, 0); },
    has: function (id) { return read().some(function (i) { return i.id === id; }); },
    add: function (id, qty) {
      var it = lookup(id); if (!it) return false;
      var items = read(), found = null;
      for (var i = 0; i < items.length; i++) if (items[i].id === id) found = items[i];
      if (found) found.qty = Math.min(20, found.qty + (qty || 1));
      else { it.qty = qty || 1; items.push(it); }
      write(items);
      toast(it.title, found ? 'Quantity updated' : 'Added to cart');
      return true;
    },
    remove: function (id) { write(read().filter(function (i) { return i.id !== id; })); },
    setQty: function (id, q) {
      var items = read();
      for (var i = 0; i < items.length; i++) if (items[i].id === id) items[i].qty = Math.max(1, Math.min(20, q));
      write(items);
    },
    clear: function () { write([]); },
    lookup: lookup,
    catalogue: { workshops: WORKSHOPS, passes: PASSES, specials: SPECIALS, batches: BATCHES, plans: PLANS, workshopPrice: WORKSHOP_PRICE },
    planPrice: planPrice,
    payWhatsApp: PAY_WHATSAPP,
    enquiryWhatsApp: ENQ_WHATSAPP
  };

  /* ---------------- nav badge + toast ---------------- */

  var CSS =
    '.nav-cart{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border-cyan,rgba(92,225,230,.28));' +
      'color:var(--cyan,#5ce1e6)!important;padding:7px 14px;border-radius:10px;text-decoration:none;font-size:14px;' +
      'transition:.18s;position:relative}' +
    '.nav-cart:hover{background:var(--cyan,#5ce1e6);color:#04181a!important}' +
    '.nav-cart .cart-n{font-family:"Space Mono",monospace;font-size:11px;min-width:19px;height:19px;border-radius:99px;' +
      'background:var(--cyan,#5ce1e6);color:#04181a;display:inline-flex;align-items:center;justify-content:center;font-weight:700;padding:0 5px}' +
    '.nav-cart:hover .cart-n{background:#04181a;color:var(--cyan,#5ce1e6)}' +
    '.nav-cart.empty .cart-n{display:none}' +
    '.nav-cart.bump{animation:cartBump .42s ease}' +
    '@keyframes cartBump{0%,100%{transform:scale(1)}35%{transform:scale(1.14)}}' +
    '.cart-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);z-index:900;opacity:0;pointer-events:none;' +
      'display:flex;align-items:center;gap:14px;max-width:min(420px,calc(100vw - 32px));' +
      'background:rgba(11,16,18,.95);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);' +
      'border:1px solid var(--border-cyan,rgba(92,225,230,.28));border-radius:15px;padding:13px 16px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 34px rgba(92,225,230,.14);transition:opacity .3s,transform .3s}' +
    '.cart-toast.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}' +
    '.cart-toast .ct-i{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:rgba(92,225,230,.16);' +
      'color:var(--cyan,#5ce1e6);display:flex;align-items:center;justify-content:center;font-size:14px}' +
    '.cart-toast .ct-x{flex:1;min-width:0}' +
    '.cart-toast .ct-k{font-family:"Space Mono",monospace;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted-2,#5d6e70)}' +
    '.cart-toast .ct-t{font-size:14px;color:var(--text,#eef6f7);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.cart-toast a{flex:0 0 auto;background:var(--cyan,#5ce1e6);color:#04181a;text-decoration:none;font-size:12.5px;font-weight:600;' +
      'padding:9px 14px;border-radius:10px;white-space:nowrap}' +
    /* the cart lives outside the collapsible menu so it is always reachable */
    'nav .brand{margin-right:auto}nav .nav-links{margin-left:0}nav .burger{margin-left:0}' +
    '@media (max-width:760px){.nav-cart{padding:7px 12px;font-size:13.5px}}' +
    '@media (prefers-reduced-motion:reduce){.nav-cart.bump{animation:none}}';

  function injectCSS() {
    if (document.getElementById('cartCSS')) return;
    var s = document.createElement('style');
    s.id = 'cartCSS'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var badge = null, lastCount = -1;
  function paint() {
    if (!badge) return;
    var n = Cart.count();
    badge.querySelector('.cart-n').textContent = n;
    badge.classList.toggle('empty', n === 0);
    if (lastCount !== -1 && n > lastCount) {
      badge.classList.remove('bump');
      void badge.offsetWidth;
      badge.classList.add('bump');
    }
    lastCount = n;
  }

  function mount() {
    injectCSS();
    var nav = document.querySelector('nav');
    if (!nav) return;
    badge = nav.querySelector('.nav-cart');
    if (!badge) {
      badge = document.createElement('a');
      badge.className = 'nav-cart';
      badge.href = 'pay.html';
      badge.setAttribute('aria-label', 'View cart');
      badge.innerHTML = 'Cart <span class="cart-n">0</span>';
      var burger = nav.querySelector('.burger');
      if (burger) nav.insertBefore(badge, burger); else nav.appendChild(badge);
    }
    paint();
  }

  var toastEl = null, toastTimer = 0;
  function toast(title, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'cart-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML =
      '<span class="ct-i">✓</span><div class="ct-x"><div class="ct-k">' + escapeHTML(kind) + '</div>' +
      '<div class="ct-t">' + escapeHTML(title) + '</div></div>' +
      '<a href="pay.html">View cart</a>';
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4200);
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  Cart.escapeHTML = escapeHTML;

  /* keep tabs in sync */
  global.addEventListener('storage', function (e) { if (e.key === KEY) paint(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  global.Cart = Cart;
})(window);
