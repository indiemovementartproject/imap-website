/*!
 * Copyright (c) 2026 Indie Movement Art Project. All rights reserved.
 * Author: Prashant Nair. Proprietary - see LICENSE. Not open source.
 */
/**
 * Dated content switches itself off.
 *
 * Anything that is only true until a date - a workshop, a masterclass, an
 * event, the nav link to it, its Event JSON-LD - carries the moment it ends:
 *
 *   data-until="2026-09-27T19:00:00+05:30"
 *
 * Once that moment has passed the element is removed BEFORE it is painted:
 * this file loads synchronously at the top of <head> and watches the page as
 * the parser builds it, so a visitor never glimpses a finished event.
 *
 *   data-until="<ISO time, IST>"   remove me after this (use the END time)
 *   data-expire-group              remove me once nothing dated is left inside
 *
 * Put data-until on each event card, AND on the section and nav link (the
 * latest end among them), so the whole slot goes at once with nothing empty
 * left behind. data-expire-group is the safety net if one is forgotten.
 *
 * A date that isn't strict ISO (with the +05:30) counts as not expired: a
 * typo should leave something visible for a human to notice, not hide it.
 *
 * `node scripts/events.js` lists every dated item on the site with the time
 * left, and what is past and ready to delete from the source.
 */
(function () {
  'use strict';
  var now = Date.now();

  /* Strict ISO with an offset only. Browsers will happily read "27 Sepp" as
     some date in 2001 - which would hide a live event over a typo. */
  var ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?([+-]\d\d:\d\d|Z)$/;
  function ends(iso) { return ISO.test(iso || '') ? Date.parse(iso) : NaN; }
  function expired(el) {
    var t = ends(el.getAttribute('data-until'));
    return isFinite(t) && t <= now;
  }
  function sweep(node) {
    /* already swept out along with an ancestor, or on its own a moment ago */
    if (node.nodeType !== 1 || !node.isConnected) return;
    if (node.hasAttribute('data-until') && expired(node)) { node.parentNode.removeChild(node); return; }
    var dated = node.querySelectorAll('[data-until]');
    for (var i = 0; i < dated.length; i++) if (expired(dated[i]) && dated[i].parentNode) dated[i].parentNode.removeChild(dated[i]);
  }

  var watch = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) sweep(added[j]);
    }
  });
  watch.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('DOMContentLoaded', function () {
    watch.disconnect();
    sweep(document.documentElement);
    var groups = document.querySelectorAll('[data-expire-group]');
    for (var i = 0; i < groups.length; i++) {
      if (!groups[i].querySelector('[data-until]') && groups[i].parentNode) groups[i].parentNode.removeChild(groups[i]);
    }
  });

  /* for scripts that build dated things themselves (cart.js, batch.html) */
  window.imapExpired = function (iso) { var t = ends(iso); return isFinite(t) && t <= Date.now(); };
})();
