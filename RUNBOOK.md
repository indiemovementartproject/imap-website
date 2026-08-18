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
| `index.html` | Home: hero, About, Orientation Series (workshops), Regular Classes carousel |
| `cart.js` | **The catalogue.** Every purchasable item and its price. Also the cart and nav badge. |
| `batch.html` | One page for every batch, driven by `?batch=<slug>` |
| `batches.html` | All batches in a carousel |
| `pay.html` | Checkout: order → details → pay by UPI → upload screenshot |
| `apps-script/Code.gs` | Backend: records orders, files screenshots, emails the team + payer |
| `attendance.html`, `checkin.html` | Team tools, behind Firebase Auth |

## Money

- **UPI ID payments go to:** `rohitchoudhary91.rc-1@okicici` — in `CONFIG.UPI_VPA` in `pay.html`.
  **If this value is ever wrong, money goes to a stranger. Check it after any edit to `pay.html`.**
- **Backend endpoint:** `CONFIG.ENDPOINT` in `pay.html`. Currently the deployment whose URL
  begins `AKfycbw2ZhUzdu7`.
- **Two phone numbers on purpose:** payments → `919870538332` (Rohit); every enquiry CTA →
  `918454880061` (Ruchika).
- **Notified on every payment:** `CONFIG.NOTIFY` in `Code.gs` — Ruchika, Rohit, studio address.

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
| Kids (Vashi) | ₹2000 / ₹5000 |
| Juniors (Seawoods) | ₹2500 / ₹6500 |

Per-batch exceptions are `fees` on the batch in `cart.js` and `FEES` in `Code.gs`.
The batch page prices its own buttons from `cart.js`, so it cannot fall out of step.

**After changing `cart.js`, bump the `?v=` on its `<script src="cart.js?v=...">` include in
`index.html`, `batches.html`, `batch.html` and `pay.html`** — browsers cache it, and without a
bump a returning visitor can see yesterday's prices.

## Redeploying the backend

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
2. They are told, unambiguously, that their payment is confirmed. No hedging — someone who has
   just sent money is never left wondering.
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
