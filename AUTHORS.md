# Authorship

**Copyright owner:** Indie Movement Art Project (iMAP), Navi Mumbai, India.
**Author:** Prashant Nair, Creative Technologist, iMAP.

Economic rights vest in iMAP under section 17(c) of the Copyright Act, 1957.
Prashant Nair asserts moral rights as author under section 57, including the
right to be identified as the author of this work. See [LICENSE](LICENSE).

---

## What was built, and by whom

Everything in this repository was designed and written by **Prashant Nair**,
working with Claude (Anthropic) as a coding assistant. Direction on content,
pricing, instructors and studio operations came from Rohit Choudhary
(Founder & Director) and Ruchika Jain (Creative Director).

| Work | First shipped | Notes |
|---|---|---|
| `indiemovementartproject.com` | June 2026 | The site: hero, About, workshops, Regular Classes carousel |
| **Count Me In** (`count-me-in.html`) | 2026 | Browser tool that adds a spoken or clicked count-in to any track. Beat detection, waveform editor, five-step guided mode, MP3/WAV export. All processing on-device. |
| **Sync Studio** (`sync-studio.html`) | 2026 | Browser tool that time-stretches tracks to a shared tempo without changing pitch. Guided mode, single-track and multi-track paths, zip export. All processing on-device. |
| Checkout (`pay.html`, `cart.js`, `apps-script/Code.gs`) | Aug 2026 | UPI checkout with a hand-written QR encoder (byte mode, ECC L, versions 1–9, Reed–Solomon over GF(256)), server-side price re-validation, Sheets + Drive + Gmail backend. |
| Annual Jam gallery (`gallery.html`) | Aug 2026 | 165 photographs selected from 750 by sharpness, exposure and colour scoring with perceptual-hash de-duplication; CSS-grid masonry with a lightbox. |
| Batch short links | Aug 2026 | Self-hosted redirects with per-batch Open Graph previews. |

The QR encoder, the beat-detection and time-stretch code, the photo-selection
pipeline and the guided-mode wizards are original work, not adapted from a
library.

## Third-party code

| Component | Licence |
|---|---|
| `lamejs` (MP3 encoding) | LGPL — loaded from CDN, not modified, not redistributed |
| Google Fonts (Instrument Serif, Space Grotesk, Space Mono) | Open Font License |

Nothing else in this repository is third-party code.
