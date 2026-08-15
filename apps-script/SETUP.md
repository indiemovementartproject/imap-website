# iMAP payments — setup

A UPI checkout for workshops and regular classes. No payment gateway, no monthly fee,
no business verification. Money goes straight from the payer's UPI app into iMAP's bank account.

**Three moving parts**

| Part | Where | Does what |
|---|---|---|
| `cart.js` | this repo | The cart, and the single source of truth for what's on sale and at what price |
| `pay.html` | this repo (GitHub Pages) | Checkout: order → details → pay → upload screenshot |
| `Code.gs` | Google Apps Script | Reads the screenshot, checks it, logs the order, forwards the image |
| Payments sheet | Google Sheets | Live log of every order and how it was checked |

**How someone buys:** they add workshops or classes to a cart, enter name + contact (email optional),
pay with Google Pay, PhonePe or Paytm (or scan the QR) then upload a screenshot of the success screen. The script
reads the amount and date off that image; if both check out the customer is confirmed on the spot,
and either way the screenshot lands with Ruchika.

**Two phone numbers, on purpose:** payments and payment fallbacks go to **+91 98705 38332**;
every *enquiry* CTA still goes to **+91 84548 80061**.

---

## What the screenshot check does and doesn't prove

The money side is safe: payments travel over UPI or WhatsApp, and this site never touches a PIN,
card number or bank login. **Nobody can steal money through this page.**

The screenshot check reads the image and confirms it shows *your exact amount* and *today's date*.
That reliably catches honest mistakes — wrong amount, an old screenshot reused, the wrong order —
and it deters casual chancers.

What it can't do is prove money actually arrived, because an image can be edited. So treat a green
"auto-verified" as *very probably fine*, not as a bank statement. This is why **every screenshot is
still emailed to a human**, with the amount and date verdict written at the top so a glance is
usually enough. Your other backstop is physical: these are studio classes, and the door is the
final check.

Also built in:

- **Prices are re-checked on the server.** Edit the page to pay ₹1 for a ₹4500 pass and the Sheet
  still records ₹4500, flags the row, and the email is marked ⚠️.
- **Every field is validated and escaped** before it reaches a Sheet or an email.
- **A hidden honeypot field** silently drops basic bots.
- The endpoint is public by necessity — treat it as a form anyone can post to.

If you ever want certainty at the moment of payment, that needs a payment gateway with a webhook.
Cashfree and PhonePe onboard sole proprietors more leniently than Razorpay did, and a very common
reason for rejection is simply missing Terms / Privacy / Refund pages on the website — cheap to
add, and worth doing before reapplying.

---

## 1 · Create the sheet and script

1. Go to <https://sheets.google.com> (signed in as **indiemovementartproject@gmail.com**) and create
   a blank spreadsheet. Name it something like `iMAP Payments`.
2. In that sheet: **Extensions → Apps Script**.
3. Delete the placeholder code, paste in all of [`Code.gs`](Code.gs), and save.
3b. **Turn on Drive for OCR** — in the left sidebar next to **Services**, press **+**, pick
   **Drive API**, and click Add. Without this the screenshot still reaches Ruchika, but nothing is
   read automatically and every order waits for a human.
4. Run the `setup` function once (select it in the toolbar, press **Run**). Google will ask for
   permission — approve it. It'll warn "Google hasn't verified this app"; choose
   **Advanced → Go to (project name)**. This is your own script, so that warning is expected.
   You should see a `Payments` tab appear with the headers.

## 2 · Publish the endpoint

1. **Deploy → New deployment → ⚙ → Web app**
2. Set **Execute as: Me**, **Who has access: Anyone**
   (this must be "Anyone" — the website posts to it without logging in)
3. **Deploy**, then copy the `/exec` URL.

> Re-deploy after editing `Code.gs`: **Deploy → Manage deployments → ✏️ → Version: New → Deploy**.
> The URL stays the same.

## 3 · Auto-confirm emails when you mark a row VERIFIED

In the Apps Script editor: **Triggers (⏰) → Add Trigger**
- Function: `onStatusEdit`
- Event source: **From spreadsheet**
- Event type: **On edit**

Now setting a row's **Status** to `VERIFIED` emails that person their confirmation automatically.

## 4 · Switch the website on

The UPI ID is already set to `rohitchoudhary91.rc-1@okicici`. The one thing still missing is the
backend URL — open `pay.html`, find the `CONFIG` block, and paste your `/exec` URL into `ENDPOINT`:

```js
var CONFIG = {
  UPI_VPA:    "rohitchoudhary91.rc-1@okicici",
  PAYEE_NAME: "Indie Movement Art Project",
  ENDPOINT:   "https://script.google.com/macros/s/AKfy.../exec",   // <- paste here
  WHATSAPP:   "919870538332"
};
```

**Until then payments still work** — the checkout falls back to opening WhatsApp with the full
order so the customer can send their screenshot to Ruchika by hand. You just don't get the
automatic check, the sheet row or the emails.

Also in `Code.gs`, set `SCREENSHOT_TO` to whichever inbox Ruchika actually reads. It defaults to
`indiemovementartproject@gmail.com`.

**Prices live in two files and must agree:**
- `cart.js` — the catalogue the site shows
- `PRICES` in `Code.gs` — what the server enforces

Current pricing:

| | |
|---|---|
| Any single workshop | ₹500 |
| All workshops — Vashi | ₹2000 |
| All workshops — Seawoods | ₹3000 |
| All workshops — both studios | ₹4500 |
| Regular class — 1 month | ₹2800 |
| Regular class — 3 months | ₹7500 |

The workshop passes are Orientation Series only and stop being relevant after August;
regular classes start in September. To retire the passes, delete them from `PASSES` in
`cart.js` — anything already sitting in someone's cart is dropped automatically on their
next visit, because the cart re-reads the catalogue on every load.

## 5 · Test it end to end

Run `testJudge` from the editor first — it prints how the checker rates a good screenshot, a
wrong amount and a stale date, without spending anything.

Then pay yourself ₹1: temporarily set one item's amount to `1` in **both** `cart.js` and `Code.gs`,
run the full flow with a real screenshot, and confirm you get the email with the image attached and
a new Sheet row marked VERIFIED. Then set it back.


---

---

## Day to day

1. Someone pays and uploads their screenshot.
2. The script reads it. Amount and date both good → the row is `VERIFIED`, the customer sees
   "your payment is confirmed", and Ruchika gets a ✅ email with the image attached.
3. Anything it couldn't confirm → the row stays `PENDING`, the customer is told the studio is
   checking, and Ruchika gets a ⚠️ email saying exactly what didn't line up.
4. For those, glance at the image and set **Status** to `VERIFIED` (or `REJECTED`). Marking it
   VERIFIED emails the customer their confirmation.

**Auto-check** shows the verdict (`amount ✓ · date ✓ · success ✓`), **Screenshot** links to the
image in Drive, and **Flags** calls out a tampered total.

## If something breaks

| Symptom | Cause |
|---|---|
| Receipt shown but "we've opened WhatsApp" | `ENDPOINT` is wrong/undeployed — the page fell back so no booking is lost |
| No emails | Gmail's daily quota (100/day on free accounts), the `setup` permission was never granted, or the buyer left email blank (it's optional — confirm those on WhatsApp) |
| "Unknown item" error | An item exists in `pay.html` but not in `PRICES` in `Code.gs` |
| Nothing happens on "Open UPI app" (desktop) | Expected — UPI links only work on phones; use the QR code |
| Everything lands as PENDING | The Drive API service isn't switched on (step 3b), so nothing can be read |
| A genuine payment isn't auto-confirmed | Usually a cropped screenshot missing the date, or an unusual date format. Check **Auto-check** for which half failed |
| A payment app button does nothing on desktop | Expected — those links only work on a phone. Use the QR code, or copy the UPI ID |
