/*!
 * Copyright (c) 2026 Indie Movement Art Project. All rights reserved.
 * Author: Prashant Nair. Proprietary - see LICENSE. Not open source.
 */
/**
 * iMAP analytics — one place for every event the site reports.
 *
 * Provider-agnostic on purpose: it speaks GA4's event vocabulary, but the only
 * coupling is inside send(). Swap that for Plausible/Umami later and every
 * event below keeps working.
 *
 * Until MEASUREMENT_ID is filled in this file is a complete no-op — no network,
 * no cookies, no errors. Set DEBUG to see events in the console instead.
 */
(function (global) {
  'use strict';

  var MEASUREMENT_ID = 'G-RS3GH4FCRS';   /* GA4 property for indiemovementartproject.com */
  var DEBUG = /[?&]analytics=debug\b/.test(location.search);

  var live = /^G-[A-Z0-9]+$/i.test(MEASUREMENT_ID);
  if (!live && !DEBUG) { global.track = function () {}; return; }

  /* ---------------- provider ---------------- */

  if (live) {
    global.dataLayer = global.dataLayer || [];
    global.gtag = function () { global.dataLayer.push(arguments); };
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(s);
    global.gtag('js', new Date());
    global.gtag('config', MEASUREMENT_ID, {
      /* no ad profiling — this is for understanding the site, not retargeting */
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      anonymize_ip: true
    });
  }

  function send(name, params) {
    if (DEBUG) console.log('[analytics]', name, params || {});
    if (live && global.gtag) global.gtag('event', name, params || {});
  }
  global.track = send;

  /* ---------------- helpers ---------------- */

  function item(it) {
    return {
      item_id: it.id,
      item_name: it.title,
      item_category: it.type === 'class' ? 'Regular class' : 'Workshop',
      price: it.amount,
      quantity: it.qty || 1
    };
  }
  function slug() {
    var m = /[?&]batch=([a-z0-9-]+)/i.exec(location.search);
    return m ? m[1] : '';
  }

  /* ---------------- what we watch ---------------- */

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {

    /* a batch page view is a product view */
    if (/batch\.html/i.test(location.pathname) && slug() && global.Cart) {
      var probe = global.Cart.lookup('rc-' + slug() + '-1m');
      if (probe) send('view_item', { currency: 'INR', value: probe.amount, items: [item(probe)] });
    }

    /* adding to cart — wrap rather than edit cart.js, so the catalogue stays clean */
    if (global.Cart && global.Cart.add && !global.Cart.__tracked) {
      var add = global.Cart.add;
      global.Cart.add = function (id, qty) {
        var ok = add.apply(this, arguments);
        if (ok) {
          var it = global.Cart.lookup(id);
          if (it) {
            it.qty = qty || 1;
            send('add_to_cart', { currency: 'INR', value: it.amount * it.qty, items: [item(it)] });
          }
        }
        return ok;
      };
      global.Cart.__tracked = true;
    }

    /* which class the carousel sends people to, and the tools in nav + footer */
    document.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('[data-href^="batch.html"]');
      if (card) {
        var m = /batch=([a-z0-9-]+)/i.exec(card.getAttribute('data-href') || '');
        if (m) send('select_item', { item_list_name: 'Regular classes', items: [{ item_id: m[1] }] });
      }
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/count-me-in\.html/i.test(href)) send('tool_click', { tool: 'Count Me In' });
      else if (/sync-studio\.html/i.test(href))  send('tool_click', { tool: 'Sync Studio' });
      else if (/maps\.app\.goo\.gl|google\.[a-z.]+\/maps/.test(href)) send('venue_click', { venue: 'CrossBox Fitness' });
      else if (/wa\.me\/918454880061/.test(href)) send('whatsapp_click', { purpose: 'enquiry' });
      else if (/wa\.me\/919870538332/.test(href)) send('whatsapp_click', { purpose: 'payment' });
    }, true);

    /* how far down the workshop list people actually get */
    var seen = {};
    var rows = document.querySelectorAll('.ws-row[data-add]');
    if (rows.length && 'IntersectionObserver' in global) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.getAttribute('data-add');
          if (id && !seen[id]) { seen[id] = 1; send('view_workshop', { item_id: id }); }
          io.unobserve(en.target);
        });
      }, { threshold: 0.6 });
      [].forEach.call(rows, function (r) { io.observe(r); });
    }
  });
})(window);
