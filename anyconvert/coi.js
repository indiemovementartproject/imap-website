/* Cross-origin isolation via service worker.
   GitHub Pages cannot set response headers, and ffmpeg.wasm's fast
   multithreaded core needs SharedArrayBuffer, which needs COOP/COEP.
   A service worker can add those headers to responses it serves, which
   is the only way to get crossOriginIsolated on a static host. */
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', function (e) {
    if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;
    e.respondWith(fetch(e.request).then(function (r) {
      if (r.status === 0) return r;               // opaque, leave alone
      const h = new Headers(r.headers);
      h.set('Cross-Origin-Embedder-Policy', 'require-corp');
      h.set('Cross-Origin-Opener-Policy', 'same-origin');
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    }).catch(err => console.error(err)));
  });
} else {
  (function () {
    if (window.crossOriginIsolated) return;                 // already isolated
    /* WebKit - Safari, every iPhone browser, the Mac app - runs the
       single-threaded engine, which needs no isolation. Registering here would
       only cost those visitors a pointless reload. Same test as media.js. */
    var ua = navigator.userAgent;
    var webkit = !!window.AnyConvertNative || /iPhone|iPad|iPod/.test(ua)
      || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      || (/Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|FxiOS|CriOS/.test(ua));
    if (webkit) return;
    if (!window.isSecureContext || !navigator.serviceWorker) return;
    navigator.serviceWorker.register(window.document.currentScript.src)
      .then(reg => {
        reg.addEventListener('updatefound', () => window.location.reload());
        if (reg.active && !navigator.serviceWorker.controller) window.location.reload();
      })
      .catch(e => console.error('COI worker failed:', e));
  })();
}
