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
files the screenshot, thanks them, and emails it to the team to confirm against the bank.

**Two phone numbers, on purpose:** payments and payment fallbacks go to **+91 98705 38332**;
every *enquiry* CTA still goes to **+91 84548 80061**.

---

## How verification works

The payer is thanked and told their payment is confirmed the moment they upload their screenshot.
That is deliberate: someone who has just sent money should never be left wondering whether it
arrived, and a slow or failed automatic check is our problem, not theirs.

Confirming the money is a back-office job:

1. Every payment emails all three of you with the screenshot attached, plus name, contact, email,
   amount and a one-tap WhatsApp button to message the payer.
2. Check the screenshot against the UPI account.
3. Set the row's **Status** to `VERIFIED` (or `REJECTED`). That is bookkeeping only — nothing
   further is sent to the payer.

Your real backstop is physical: these are studio classes, and the door is the final check.

Also built in:

- **Prices are re-checked on the server.** Edit the page to pay ₹1 for a ₹4500 pass and the sheet
  still records ₹4500, flags the row, and the email is marked ⚠️.
- **Every field is validated and escaped** before it reaches a sheet or an email.
- **A hidden honeypot field** silently drops basic bots.

---

## 1 · Create the sheet and script

1. Go to <https://sheets.google.com> (signed in as **indiemovementartproject@gmail.com**) and create
   a blank spreadsheet. Name it something like `iMAP Payments`.
2. In that sheet: **Extensions → Apps Script**.
3. Delete the placeholder code, paste in all of [`Code.gs`](Code.gs), and save.
4. **Save** (⌘S / Ctrl+S). Do this before anything else — the toolbar's function list only
   refreshes once you've saved.
5. In the toolbar next to **▷ Run**, open the **function dropdown** and change it from
   `myFunction` to **`setup`**.

   > The Run button runs whatever is selected there, not the whole file. If it still says
   > `myFunction` you'll get *"Attempted to execute myFunction, but it was deleted"* — that's
   > the placeholder from the blank project, which your pasted code replaced.

6. Press **Run**. Google will ask for permission — approve it. It'll warn "Google hasn't verified
   this app"; choose **Advanced → Go to (project name)**. This is your own script, so that warning
   is expected. You should see a `Payments` tab appear with the headers.


### If "Extensions → Apps Script" won't open

If you get *"Sorry, unable to open the file at present"*, that's Google, not the script.
Almost always it's **more than one Google account signed into the browser** — Drive opens the
editor under the wrong account and gives up. Fixes, quickest first:

1. Open an **incognito window**, sign in as `indiemovementartproject@gmail.com` only, and try again.
2. Or sign out of every Google account and back into just that one.
3. Or open <https://script.google.com> directly first, check the account shown top-right is the
   right one, then go back to the sheet.
4. Allow third-party cookies for `google.com` (the editor needs them), and try with extensions
   and ad-blockers off.

**If none of that works, skip the menu entirely** — the script doesn't have to live inside the sheet:

1. Go to <https://script.google.com/create> and start a blank project.
2. Paste in `Code.gs` as normal.
3. Open your payments spreadsheet and copy its id out of the URL — the long string between
   `/d/` and `/edit`.
4. Put it in `CONFIG.SHEET_ID` near the top of the script.
5. Run `setup`, then run `installEditTrigger` once (a standalone script can't use the automatic
   edit trigger, so this attaches it).

Everything else — deploying, the Drive API step, the web app URL — is identical.

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

Every payment emails the whole team — `CONFIG.NOTIFY` in `Code.gs` currently lists
Ruchika (`chikajain@gmail.com`), Rohit (`rohitchoudhary91.rc@gmail.com`) and the studio address.
The first is the To:, the rest are copied. Add or remove addresses freely.

There is no automatic WhatsApp message: sending one programmatically needs Meta's WhatsApp Cloud
API, which would take +91 84548 80061 out of the normal WhatsApp app. Instead each email carries a
green **WhatsApp <name>** button with a confirmation already written, so replying is one tap.

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
| Kids (Vashi) — 1 month / 3 months | ₹2000 / ₹5400 |
| Juniors (Seawoods) — 1 month / 3 months | ₹2500 / ₹6500 |

Kids and Juniors charge their own rates. Those live in `fees` on the batch in `cart.js` and in
`FEES` in `Code.gs` — both must agree. Every other batch uses the default plan price, and the
batch page prices its buttons from the catalogue, so it can never disagree with the cart.

The workshop passes are Orientation Series only and stop being relevant after August.
To retire them, delete them from `PASSES` in
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

**Auto-check** shows the verdict (`amount ✓ · date ✓ · success ✓ · ref ✓`), **Screenshot** links
to the image in Drive, and **Flags** calls out a tampered total.

The checker looks at four things: the amount matches the order, the date is today, the screenshot
says it succeeded, and — when legible — the payment note carries *this order's* reference. A
screenshot bearing a different iMAP reference is a recycled image from another booking and never
auto-confirms. Nor does a transaction ID that already paid for something: that row is flagged
`DUPLICATE TRANSACTION ID`.

## If something breaks

| Symptom | Cause |
|---|---|
| Receipt shown but "we've opened WhatsApp" | `ENDPOINT` is wrong/undeployed — the page fell back so no booking is lost |
| No emails | Gmail's daily quota (100/day on free accounts), the `setup` permission was never granted, or the buyer left email blank (it's optional — confirm those on WhatsApp) |
| "Unknown item" error | An item exists in `pay.html` but not in `PRICES` in `Code.gs` |
| Nothing happens on "Open UPI app" (desktop) | Expected — UPI links only work on phones; use the QR code |
| Auto-check says "not readable" | Run `testOcr` from the editor — it OCRs the last real screenshot and prints exactly what failed. Usually the Drive service isn't switched on (step 3b) |
| Everything lands as PENDING | Same as above — without Drive nothing can be read, though orders and emails still arrive |
| "Unable to open the file at present" | Multiple Google accounts in the browser — see the box in step 1, or use a standalone script |
| "Attempted to execute myFunction, but it was deleted" | The toolbar dropdown still points at the blank project's placeholder. Save, then pick `setup` from it |
| "Found a service identifier used more than once: Drive" | Drive was added twice. Remove one under **Services**, or show `appsscript.json` via Project Settings and leave a single Drive block in `enabledAdvancedServices` |
| A genuine payment isn't auto-confirmed | Usually a cropped screenshot missing the date, or an unusual date format. Check **Auto-check** for which half failed |
| A payment app button does nothing on desktop | Expected — those links only work on a phone. Use the QR code, or copy the UPI ID |
