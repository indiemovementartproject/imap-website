# Browser checks

Run a check script against a page in both engines before publishing anything
that moves or depends on layout. Safari (WebKit) and Chrome lay some things out
differently: the reviews strip looped fine in Chrome and ran off into empty space
in Safari (October 2026).

    node scripts/qa/chrome.mjs 1440 <url> scripts/qa/reviews-loop.js        # add  m  for phone
    swift scripts/qa/webkit.swift 1440 <url> scripts/qa/reviews-loop.js     # 390 for phone width

- `reviews-loop.js`: the Google reviews strip is never empty, loops seamlessly, and moves at a reading pace.
- `homepage-layout.js`: rail cards, collage boxes, heading edges, footer grid, horizontal overflow.

A check script is one async expression that returns JSON.
