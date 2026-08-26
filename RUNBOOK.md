# iMAP website — runbook

Everything needed to change this site, written so a fresh session (or a different
person) can pick it up without any prior context. **This file is the source of
truth, not any chat history.**

Live at <https://indiemovementartproject.com> · GitHub Pages from `main` in
`indiemovementartproject/imap-website`. Push to `main` and it is live in ~60s.

---

## The pieces

| File | What it is |
|---|---|
| `index.html` | Home: hero, About, Retro-Jazz, Orientation Series (workshops), Regular Classes carousel, Annual Jam photo strip |
| `cart.js` | **The catalogue.** Every purchasable item and its price. Also the cart and nav badge. |
| `batch.html` | One page for every batch, driven by `?batch=<slug>` |
| `batches.html` | All batches in a carousel |
| `gallery.html` | Annual Jam gallery — 165 photos in a Pinterest-style grid, with a lightbox |
| `pay.html` | Checkout: order → details → pay by UPI → upload screenshot |
| `apps-script/Code.gs` | Backend: records orders, files screenshots, emails the team + payer |
| `attendance.html`, `checkin.html` | Team tools, behind Firebase Auth |
| `count-me-in.html`, `sync-studio.html` | Free tools for dancers. Both open in **guided mode** — one decision per screen — with the full editor one tap away behind "Show all the controls" |

## Money

- **UPI ID payments go to:** `rohitchoudhary91.rc-1@okicici` — in `CONFIG.UPI_VPA` in `pay.html`.
  **If this value is ever wrong, money goes to a stranger. Check it after any edit to `pay.html`.**
- **Backend endpoint:** `CONFIG.ENDPOINT` in `pay.html`. Currently the deployment whose URL
  begins `AKfycbw2ZhUzdu7`.
- **Two phone numbers on purpose:** payments → `919870538332` (Rohit); every enquiry CTA →
  `918454880061` (Ruchika).
- **Notified on every payment:** `CONFIG.NOTIFY` in `Code.gs` — Ruchika, Rohit, studio address.

## One-off partner workshops

`SPECIALS` in `cart.js` holds workshops that are not part of a series — currently the Retro-Jazz
workshop at CrossBox Fitness, Vashi (27 Aug). They are sold **without the cart**: the Register Now
buttons link to `pay.html?buy=<id>`, which clears the cart, puts that single item in it, and drops
the person straight into checkout. A registration link means that item and nothing else.

`?buy=xb-retro-member` shows an amber notice **at checkout** explaining that a non-member paying the
member rate owes the ₹400 difference at the door. That warning is deliberately kept off the
homepage, where it reads as a threat rather than a condition — the rate there is simply labelled
"members only".

**Shareable link:** `indiemovementartproject.com/retro-jazz` → `retro-jazz.html`, which carries the
Open Graph tags (so WhatsApp and Instagram preview the poster) and forwards to
`index.html?go=retro-jazz`. The landing uses a **query param, not a `#hash`** on purpose: the
browser re-applies its own fragment scroll after the page settles, which was overshooting the
section by ~390px. `?go=<id>` scrolls to any section id and stays put.

To retire it: delete the two entries from `SPECIALS` in `cart.js` and from `PRICES` in `Code.gs`,
and remove the `#retro-jazz` section from `index.html`.

## Changing prices

Prices live in **two** places and must agree:

1. `cart.js` — what the site shows
2. `PRICES` / `FEES` in `Code.gs` — what the server enforces

The server always wins: if they disagree the sheet records the server's price and flags the row,
so a mismatch is a visible warning, never a wrong charge.

| Item | Price |
|---|---|
| Any single workshop | ₹500 |
| All workshops — Vashi / Seawoods / both | ₹2000 / ₹3000 / ₹4500 |
| Regular class — 1 month / 3 months | ₹2800 / ₹7500 |
| Kids (Vashi) | ₹2000 / ₹5400 |
| Retro-Jazz @ CrossBox — member / non-member | ₹199 / ₹599 |
| Juniors (Seawoods) | ₹2500 / ₹6500 |

Per-batch exceptions are `fees` on the batch in `cart.js` and `FEES` in `Code.gs`.
The batch page prices its own buttons from `cart.js`, so it cannot fall out of step.

**After changing `cart.js`, bump the `?v=` on its `<script src="cart.js?v=...">` include in
`index.html`, `batches.html`, `batch.html` and `pay.html`** — browsers cache it, and without a
bump a returning visitor can see yesterday's prices.

## Redeploying the backend

**Deploying is now a command, not a screen.**

    ./scripts/deploy-backend.sh

It creates a version, points the live deployment at it, and then checks the
endpoint really serves the new build before saying done. It refuses to run if
the deployment id it targets no longer matches the one in `pay.html`.

Requires clasp (`npm i -g @google/clasp`), `clasp login`, and
`apps-script/.clasp.json` — all already set up on Prashant's machine.

**Why the manual route kept failing.** The project had accumulated **twelve**
deployments. The site posts to exactly one of them; it sat pinned at version 15
while three separate correct pastes were deployed to others. The console gives
no indication which deployment a URL belongs to. On 26 Aug 2026 all stale
deployments were deleted — **only two remain**: the live one, and the built-in
`@HEAD` test deployment that Apps Script always keeps and only the owner can
reach. Keep it that way. If you ever click "New deployment" again you will have
two public URLs and no way to tell which one the site is using.

> **The trap, hit twice now.** "New deployment" mints a **new /exec URL** and
> leaves the old one serving the old code. The site keeps posting to the old URL
> and nothing changes — that is how a Retro-Jazz customer paid with no record
> reaching the studio. Always use **Manage deployments → ✏️ → Version: New
> version → Deploy**. If you do end up with a new URL, `ENDPOINT` in `pay.html`
> must be updated to match, or the deploy has no effect.
>
> After any redeploy, confirm with:
> `curl -sL "<exec-url>" | grep -oE '2026-[0-9]{2}-[0-9]{2}-[a-z]'`
> and check the build matches `BUILD` in `apps-script/Code.gs`.

Editing `Code.gs` in the Apps Script editor changes nothing on the live site until you publish a
**new version** of the **existing** deployment:

**Deploy → Manage deployments → ✏️ → Version: `New version` → Deploy**

- Choosing "New deployment" instead mints a *different* URL that the website does not know about.
  This has caused hours of confusion before.
- Verify by opening the `/exec` URL in a browser. It prints `build <date>` — if that does not match
  the `BUILD` constant at the top of your `Code.gs`, the site is running old code.
- Keep exactly **one** live deployment. Archive the rest.

## How a payment actually works

1. Customer adds items, enters name + contact (email optional), pays by UPI, uploads a screenshot.
2. They are told their screenshot has been sent for verification, with a WhatsApp link that opens
   a query pre-filled with their reference, items, date and time. It does **not** claim the money
   has arrived — a screenshot is not proof, and an old one for the wrong amount will sail through.
3. The order lands in the payments sheet as `PENDING`, the screenshot is filed in Drive, and all
   three of you get an email with the image attached and a one-tap WhatsApp button.
4. **Someone checks the screenshot against the UPI account and sets Status to `VERIFIED`.**
   That is bookkeeping only; nothing further is sent to the customer.

There is no automatic verification. It was tried and removed: it depended on a Drive OCR quota
that ran out, and its failures reached the customer as alarming technical errors.

## Analytics

`analytics.js` reports every meaningful interaction. **Live** on GA4 property
`G-RS3GH4FCRS` (set in `MEASUREMENT_ID` at the top of that file; blanking it turns everything off
cleanly). Ad personalisation and Google Signals are deliberately disabled, so hits carry `npa=1`.

Keep GA4's enhanced measurement switched on — that is what gives page views, scroll depth and
engagement time for free.

Append `?analytics=debug` to any page to watch events in the browser console without a GA account.

**Events, and the question each answers**

| Event | Answers |
|---|---|
| `page_view`, engagement time | How many visitors, how long they stay (GA4 automatic) |
| `view_workshop` | Which workshops people actually scroll to |
| `add_to_cart` | Which workshops and classes get chosen, with price |
| `select_item` | Which class cards get clicked in the carousel |
| `view_item` | Which batch pages get opened |
| `tool_click` | Count Me In vs Sync Studio interest |
| `whatsapp_click` | Enquiry vs payment taps, counted separately |
| `view_cart` → `begin_checkout` → `add_payment_info` → `reach_upload_step` → `screenshot_attached` → `purchase` | **Exactly where people drop off** |
| `purchase` | Revenue per item, per batch, per workshop |

Build the drop-off report in GA4 under **Explore → Funnel exploration**, using those event names
as steps in that order.

The file speaks GA4's vocabulary but only `send()` is coupled to it — swapping in Plausible or
Umami later means changing that one function, not the instrumentation.

## The two dancer tools

Both open in a guided, step-by-step mode aimed at people who don't edit audio:

- **Count Me In** — drop a song → set the first beat → pick the count and sound → listen → download.
  Auto-detected tempo is often wrong, so setting the first beat is an explicit step rather than an
  assumption. The waveform there shows only the **first 15 seconds** (`WINDOW_SECS`), which is where
  the first beat almost always is; it stays scrollable and zoomable for the rest of the track.
  The other common correction, "too fast / too slow", halves or doubles the tempo.
- **Sync Studio** — add songs → tap the one whose speed the others should match → hear them all at
  the new tempo → download. Files appear in the list the moment they are added, decoded or not, and
  the flow advances by itself once two are ready. The preview step moves the **real track cards** in
  and hides their editing rows, so the play buttons and playheads are the genuine ones.

The guided layer **drives the original controls** rather than reimplementing anything: it clicks the
same buttons and sets the same inputs a person would. Anything that starts audio uses the engine's
**actual button, relocated** into the wizard rather than a proxy — a synthetic click can lose the
user gesture iOS requires before it will play, and a proxy leaves the visible label stale. One source of truth for the audio, and
"Show all the controls" hands back the full editor untouched. If you change the classic UI, keep the
element ids — that is the whole contract between the two layers.

## Annual Jam photos

The photographs live in `media/jam/` (~25 MB, 165 files) and are named `<index>_<Performance>.jpg`.
Nothing reads the filename at runtime — the performance name is baked into each page's markup as
alt text and the lightbox caption — so renaming a file means editing `index.html` and `gallery.html`.

Two places show them:

- **`index.html` → `#jam`** — 16 hand-picked frames on a strip that advances every 2 s and can be
  dragged. The slides are cloned once so the loop is seamless; the script wraps the index back to
  the start 760 ms after the transition (matching the CSS transition), so if you change
  `transition:.72s` on `.jam-track`, change that timeout too.
- **`gallery.html`** — all 165 in a CSS-grid masonry. Row spans are computed in JS from each tile's
  rendered height (`grid-auto-rows:8px`), so tiles need their `--ar` custom property set or they
  collapse. `.gt.wide` spans two columns; 13 of the strongest frames carry it.

Adding or removing photos means editing the markup by hand in both files. The originals sit in the
studio's Google Drive; these copies are downscaled (w1800 for the strip, w1100 for the grid).

## Short links for enquiries

Every batch has a short, permanent link at the root of the domain, for pasting into a WhatsApp
reply. `indiemovementartproject.com/kids` rather than `/batch.html?batch=kids-vashi`.

Each one is a small redirect page that carries its own Open Graph tags, so WhatsApp shows the
instructor's photo, the batch name and the fees instead of a bare URL. **The fees are written into
those meta tags**, so if a price changes in `cart.js`, the matching short link has to be edited too
— they do not read from the catalogue. Grep for the old amount across the root `.html` files.

| Link | Goes to |
|---|---|
| `/kids` · `/kids-vashi` | Kids, Vashi |
| `/juniors` · `/juniors-seawoods` | Juniors, Seawoods |
| `/afro` · `/afro-dancehall` | Afro & Dancehall |
| `/bollywood-advance` · `/bollywood-advance-vashi` | Bollywood Advance, Vashi |
| `/bollywood-seawoods` | Bollywood, Seawoods |
| `/ballet` · `/ballet-training` · `/contemporary-seawoods` | Ballet Training, Seawoods |
| `/contemporary-vashi` | Contemporary, Vashi |
| `/jazz-funk` · `/jazz-training` · `/open-style` | as named |
| `/classes` | all batches |
| `/gallery` | Annual Jam photos |
| `/retro-jazz` | the CrossBox workshop |

The rule: **the internal slug always works as a link**, and the four unwieldy ones have a shortcut.

**One slug lies.** Akash Jathar's Seawoods batch is called **Ballet Training**, but its slug is still
`contemporary-seawoods` — that slug is the checkout pricing key (`rc-contemporary-seawoods-1m`/`-3m`
in `cart.js` *and* in `PRICES` in `Code.gs`), so renaming it would reject payments for that batch
until the Apps Script is redeployed. `/ballet` is the link to hand out; the old one still works.
Rename the slug only as a deliberate job: change it in both files, add the new price ids, redeploy,
then keep a redirect from the old slug.

`links.html` is an unlisted page for the team — every link with a "Copy link" and "Copy message"
button, built for a phone. It is `noindex` and deliberately not in any nav.

Extensionless URLs work because GitHub Pages resolves `/kids` to `kids.html` on its own. They will
404 on a plain local `python -m http.server`, which does not — test with `/kids.html` locally.

## Ownership and provenance

Copyright in this work belongs to **iMAP** (economic rights, s.17(c) Copyright
Act 1957). **Prashant Nair** is the author and has asserted moral rights under
s.57 — the right to be identified as author, which stays with him regardless of
who owns the code. `LICENSE` is proprietary, not open source. `AUTHORS.md`
records what was built and what is original rather than adapted.

Three things keep this provable, and all three need to keep happening:

- **Commits are signed.** Configured globally with an ed25519 key. If
  `git log --format='%G?'` starts showing `N`, signing has been switched off.
- **Every source file carries a copyright header.** `scripts/stamp-copyright.py`
  adds them to new files; `--check` fails if any are missing.
- **Releases are hashed and timestamped.** `./scripts/release.sh <tag> "note"`
  writes `provenance/<tag>.manifest.txt`, timestamps it into Bitcoin via
  OpenTimestamps, and cuts a signed tag. Run `ots upgrade` on the `.ots` a few
  hours later and commit it.

Full detail, and what to do if the work is copied, is in `PROVENANCE.md`.

**The repository is public.** That is a deliberate trade-off: the site needs to
be served, and view-source exposes the tools regardless. The licence makes
copying actionable; it cannot make it impossible.


## Known constraints

- **No WhatsApp automation.** Sending WhatsApp messages programmatically needs Meta's Cloud API,
  which would take `8454880061` out of the normal WhatsApp app. The emails carry a one-tap
  WhatsApp link instead.
- **A screenshot is not proof of payment.** Images can be edited. The bank record is the truth,
  and the studio door is the final check.
- **Gmail sends ~100 script emails/day.** Two per order, so roughly 50 orders/day.
- **`pay.html` is `noindex`** and not linked from the nav; customers reach it through the cart.
- `pay.html?test=1` puts a ₹1 item in the cart for end-to-end testing. Customers cannot reach it.

## Retiring the Orientation Series

It is August-only. To remove it: delete the entries from `PASSES` and `WORKSHOPS` in `cart.js`
and from `PRICES` in `Code.gs`, and drop the `#events` section from `index.html`. Anything already
sitting in someone's cart disappears by itself, because the cart re-reads the catalogue on load.
