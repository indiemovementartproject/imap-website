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
| `index.html` | Home: hero, About, the featured slot (currently Acting), Orientation Series (workshops), Regular Classes carousel, Annual Jam photo strip |
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

## The featured slot on the homepage

One section sits between "About" and the Orientation Series, holding whatever iMAP is pushing right
now. It uses the `.xb-*` styles, which were written for the Retro-Jazz workshop and are generic
enough to reuse. Only one thing lives here at a time.

**Right now:** `#acting` — Aryamann's Acting & Personality Development batch, opening with a free
demo class on **Saturday 5 September 2026**, 3–5 PM at Seawoods. Nothing is sold through it: both
buttons are WhatsApp links via `data-wa`, because the demo is free and the batch is paid for in
person once someone joins. Fees shown are ₹3,000/month for the first three months, ₹3,500/month
after.

**After 5 September** this becomes a regular batch. Prashant has the instructor photo and batch
details to come. The move is:

1. Add it to `BATCHES` in `cart.js` and to `PRICES` in `Code.gs` (then redeploy — see below).
2. Add a card to `#classes` in `index.html` and a `batch.html?batch=acting` entry.
3. Move the `links.html` card from the "Starting now" group into "Regular batches", and drop the
   custom `m` message from its `DATA` entry so it uses the standard wording.
4. Delete the `#acting` featured section, its `Event` JSON-LD block (a past event is dead weight in
   search results), and point `acting.html` at the new batch page.
5. Swap `media/acting-poster.jpg` for the instructor photo where the batch card needs one.

**Shareable link:** `indiemovementartproject.com/acting` → `acting.html`, which carries the Open
Graph tags (so WhatsApp and Instagram preview the poster) and forwards to `index.html?go=acting`.
The landing uses a **query param, not a `#hash`** on purpose: the browser re-applies its own
fragment scroll after the page settles, which was overshooting the section by ~390px. `?go=<id>`
scrolls to any section id and stays put.

### Selling a workshop from this slot

`SPECIALS` in `cart.js` holds workshops that are not part of a series. It is **empty between
workshops**. They are sold *without* the cart: Register Now buttons link to `pay.html?buy=<id>`,
which clears the cart, puts that single item in it, and drops the person straight into checkout. A
registration link means that item and nothing else. An id that is not in `SPECIALS` falls through
harmlessly and leaves the cart alone.

### Retiring a workshop

The Retro-Jazz workshop (CrossBox Fitness, Vashi, 27 Aug 2026) went through this on 29 August:

1. Clear its entries from `SPECIALS` in `cart.js`. **This is the step that matters** — while they
   are listed, an old `pay.html?buy=…` link shared on WhatsApp will still happily take money for an
   event that has already happened.
2. Remove any checkout notice keyed to its id in `pay.html`.
3. Keep the short-link page alive but point it at the homepage, mark it `noindex, follow`, and
   replace its Open Graph tags so a reshared link does not advertise a dead event. See
   `retro-jazz.html` for the shape of this.
4. Drop it from the `LINKS` list in `404.html`.
5. Its entries in `PRICES` in `Code.gs` can stay — nothing links there once step 1 is done, and
   leaving them means an old order can still be looked up. Remove them at the next backend deploy
   if you want the catalogue tidy.

## The timetable

Days, timings and studio are shown on the batch page (`.bd-when`), on every batch card in both
carousels (`.cf-when`), in the short-link preview text, and in the `Course` JSON-LD. **That is
five places for one fact**, so change a slot with a single pass and check all five.

| Batch | Studio | Days | Timings | Fee (1m / 3m) |
|---|---|---|---|---|
| Ballet Training | Seawoods | Saturday | Timings TBA | ₹2800 / ₹7500 |
| Kids Ballet | Seawoods | Saturday | 12:30 – 1:30 PM | ₹1500 / ₹4000 |
| Contemporary | Vashi | Tuesday & Thursday | 5:30 – 6:30 PM | ₹2800 / ₹7500 |
| Bollywood Weekends | Seawoods | Saturday & Sunday | 6:00 – 7:00 PM | ₹2800 / ₹7500 |
| Bollywood Beginners | Vashi | Monday & Wednesday | 5:30 – 6:30 PM | ₹2800 / ₹7500 |
| Bollywood Advance | Vashi | Monday & Wednesday | 7:30 – 8:30 PM | ₹2800 / ₹7500 |
| Juniors | Seawoods | Tuesday & Thursday | 4:45 – 6:00 PM | ₹2500 / ₹6500 |
| Kids | Vashi | Tuesday & Thursday | 6:30 – 7:30 PM | ₹2000 / ₹5400 |
| Jazz Funk | Seawoods | Sunday | 3:00 – 5:00 PM | ₹2800 / ₹7500 |
| Jazz Funk | Vashi | Monday & Wednesday | 8:30 – 9:30 PM | ₹2800 / ₹7500 |
| Jazz Training | Seawoods | Saturday | 7:00 – 9:00 PM | ₹2800 / ₹7500 |
| Open Style | Seawoods | Sunday | 7:00 – 9:00 PM | ₹2800 / ₹7500 |
| Afro & Dancehall | Seawoods | Saturday & Sunday | 5:00 – 6:00 PM | ₹2800 / ₹7500 |
| Acting & Personality Development *(from 5 Sep)* | Seawoods | Saturday | 3:00 – 5:00 PM | ₹3000 first 3 months, then ₹3500 |

The JSON-LD carries each slot as a `courseSchedule` with `byDay` and 24-hour `startTime`/
`endTime`. Google reads those; a wrong conversion (3 PM written as `03:00`) is invisible on the
page and wrong in search, so re-check the generated block rather than the rendered text.

Ballet Training has no timings yet and is rendered as "To be announced" from an **empty** `time`
field, not from the literal string — the batch page supplies that wording itself.

### The Vashi address

The footer and map on every page are the **Seawoods** studio, including on the four Vashi batch
pages, because there is no Vashi street address anywhere in the repo. The `.bd-when` block names
the right studio, so nobody is told the wrong thing outright, but a Vashi enquirer still sees a
Seawoods pin. Worth fixing when someone supplies the address.

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
| Kids Ballet (Seawoods) | ₹1500 / ₹4000 |
| Retro-Jazz @ CrossBox — member / non-member | ₹199 / ₹599 *(retired 29 Aug 2026; still in `PRICES`, not in `SPECIALS`)* |
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
| `/bollywood-seawoods` | Bollywood Weekends, Seawoods |
| `/bollywood-beginners` · `/bollywood-beginners-vashi` | Bollywood Beginners, Vashi |
| `/kids-ballet` · `/kids-ballet-seawoods` | Kids Ballet, Seawoods |
| `/ballet` · `/ballet-training` · `/contemporary-seawoods` | Ballet Training, Seawoods |
| `/contemporary-vashi` | Contemporary, Vashi |
| `/jazz-funk` | Jazz Funk, Seawoods |
| `/jazz-funk-vashi` | Jazz Funk, Vashi |
| `/jazz-training` · `/open-style` | as named |
| `/classes` | all batches |
| `/gallery` | Annual Jam photos |
| `/acting` | Acting & Personality Development — free demo 5 Sep, then a Saturday batch |
| `/retro-jazz` | finished 27 Aug 2026 — now redirects to the homepage |

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


## Search and discovery

Verified in Google Search Console on 26 Aug 2026 as a URL-prefix property, via
the HTML tag method. **The `google-site-verification` meta tag in `index.html`
must stay there.** Remove it and the property un-verifies, and Google stops
reading the sitemap.

`sitemap.xml` is submitted and lists 17 URLs — the homepage, all ten batch
pages, the gallery, both tools, privacy and terms. It is written by hand, so
**adding a page means adding it there too**, or Google will not know about it.

`index.html` carries a `DanceSchool`/`LocalBusiness` JSON-LD block with the
address, phone, area served and all ten batches as `Course` offers with their
real prices. The prices in it are duplicated from `cart.js` — if a fee changes,
change it in both. That block is what puts the studio in the local map pack.

Deliberately kept out of search via `robots.txt` and `noindex`: `pay.html`,
`attendance.html`, `checkin.html`, `links.html`.

Worth checking Search Console → Performance after a few weeks. It reports the
phrases people actually search to reach the site, which is better grounding for
new pages than guessing.


## The email ceiling

Payment notifications go out through Apps Script's `MailApp`, and the daily
allowance belongs to **the account the web app runs as** — not to whoever owns
the domain. That account is `indiemovementartproject@gmail.com`, a consumer
Gmail, so the limit is **100 recipients a day**.

This matters more than it sounds: a Google Workspace subscription on the domain
does **not** raise it. Verified on 26 Aug 2026 with the endpoint's own
diagnostic. To get Workspace's higher limit the script, the Sheet and the Drive
folder would all have to move to that account and be redeployed as that user —
a real migration that changes the deployment URL.

Check the current position any time:

    curl -sL "<exec-url>?diag=1"

It reports the executing account, recipients left today, and how many more
orders that allows.

**`CONFIG.NOTIFY` holds one address on purpose.** Each entry costs a recipient
per order, and every order also emails the payer. Three addresses meant four
recipients and a ceiling of ~25 orders a day; one address means two and ~50.
Rohit and Ruchika still get every payment email — the studio inbox forwards to
them, and Gmail's own forwarding does not count against the allowance.

**Do not add addresses back to `NOTIFY`.** Add a forwarding rule in Gmail
instead. Adding two names back there halves the ceiling.

If volume ever outgrows 50 a day, the options in order of cost: send through a
transactional email provider over `UrlFetchApp` (free tiers run to a few hundred
a day and remove the Gmail limit entirely), or migrate the script to the
Workspace account.


## The hero video

`hero-v3.mp4` is the **full-quality master**: 1280x720, 30 fps, ~2.5 Mbps, 3.4 MB.
`hero-poster.jpg` is the still shown until it starts playing.

It was compressed once, to 960x540 / 24 fps / 590 kbps (833 KB), as part of a
page-weight pass. **That was the wrong trade and it was reverted on 29 August.**
The video is a dance reel and the first thing anyone sees; dropping the frame
rate made the movement look choppy and the resolution drop made it soft. Traffic
is low enough that 3.4 MB costs nothing that matters, and the site is often being
shown to someone in person.

So: **do not re-compress it** for a Lighthouse score. If page weight ever genuinely
becomes a problem, the honest fixes are a shorter clip or a smaller file *at the
same resolution and frame rate* - not a smaller picture.

Changing the video means **changing the filename** (`hero-v2` -> `hero-v3` and so
on) and updating the `<source>` in `index.html`. GitHub Pages caches aggressively
and a same-name replacement will not reach people who have already visited - that
is why an earlier update looked to Prashant like the video had been deleted.

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
