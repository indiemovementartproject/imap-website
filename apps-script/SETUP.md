# iMAP payments — setup

A UPI checkout for workshops and regular classes. No payment gateway, no monthly fee,
no business verification. Money goes straight from the payer's UPI app into iMAP's bank account.

**Three moving parts**

| Part | Where | Does what |
|---|---|---|
| `cart.js` | this repo | The cart, and the single source of truth for what's on sale and at what price |
| `pay.html` | this repo (GitHub Pages) | Checkout: shows the order, opens the UPI app with the total pre-filled, collects the transaction ID |
| `Code.gs` | Google Apps Script | Writes every order to a Google Sheet, emails the payer and iMAP |
| Payments sheet | Google Sheets | Live log you reconcile against your bank statement |

**How someone buys:** they tap a workshop (or open a batch page and hit *Join Now*), items collect
in a cart, and they pay for everything in one UPI transaction at checkout.

**Two phone numbers, on purpose:** payments and payment fallbacks go to **+91 98705 38332**;
every *enquiry* CTA still goes to **+91 84548 80061**.

---

## Read this first — what "secure" means here, honestly

The money side is genuinely safe: payments travel over UPI, and this site never touches a
PIN, card number or bank login. **Nobody can steal money through this page.**

What it *cannot* do is prove a payment happened. A web page can open a UPI app, but it never
finds out what the user did next — that confirmation only exists between the bank and the app.
So anyone could claim to have paid without paying.

That is why every payment lands as **PENDING** and the receipt says *pending verification*.
The Sheet is a **claims log, not a bank statement**. Your bank/UPI app remains the source of truth.

**Your one job: match each row against your actual UPI transactions before marking it VERIFIED.**
The transaction ID (UTR) column makes that a quick eyeball check. If you ever want true automatic
confirmation, that needs a payment gateway with a webhook — Cashfree and PhonePe onboard sole
proprietors and small businesses more leniently than Razorpay did, and this page can be pointed
at one later without redesigning anything.

Other protections already built in:

- **Prices are re-checked on the server.** If someone edits the page to pay ₹1 for a ₹3000 pass,
  the Sheet records the real price, flags the row, and the alert email is marked ⚠️.
- **Duplicate transaction IDs are rejected**, so one UTR can't be reused for several bookings.
- **Every field is validated and escaped** on the server before it reaches a Sheet or an email.
- **A hidden honeypot field** silently drops basic bots.
- The endpoint URL is public by necessity — treat it as a form anyone can post to. That is why
  nothing it receives is trusted without your check.

---

## 1 · Create the sheet and script

1. Go to <https://sheets.google.com> (signed in as **indiemovementartproject@gmail.com**) and create
   a blank spreadsheet. Name it something like `iMAP Payments`.
2. In that sheet: **Extensions → Apps Script**.
3. Delete the placeholder code, paste in all of [`Code.gs`](Code.gs), and save.
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

**Until then payments still work** — the checkout simply falls back to opening WhatsApp with the
full order and transaction ID, so nothing is lost. You just won't get the sheet row or the emails.

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

Pay yourself ₹1: temporarily set one item's amount to `1` in **both** `cart.js` and `Code.gs`, run through the flow,
and confirm you get the receipt email, the alert email, and a new Sheet row. Then set it back.

---

## Day to day

1. An order arrives → you get an email, and a `PENDING` row appears in the sheet instantly.
   One row per order, however many items were in the cart.
2. Check the UTR against your UPI app or bank statement.
3. Set **Status** to `VERIFIED` → the payer is emailed a confirmation automatically.
   Use `REJECTED` for anything that doesn't check out.

The **Flags** column calls out amount mismatches. A ⚠️ in the email subject means look closer.

## If something breaks

| Symptom | Cause |
|---|---|
| Receipt shown but "we've opened WhatsApp" | `ENDPOINT` is wrong/undeployed — the page fell back so no booking is lost |
| No emails | Gmail's daily quota (100/day on free accounts), the `setup` permission was never granted, or the buyer left email blank (it's optional — confirm those on WhatsApp) |
| "Unknown item" error | An item exists in `pay.html` but not in `PRICES` in `Code.gs` |
| Nothing happens on "Open UPI app" (desktop) | Expected — UPI links only work on phones; use the QR code |
