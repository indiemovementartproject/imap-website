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

## 6 · Automatic verification from Rohit's bank SMS

The bank texts **+91 98705 38332** whenever money lands. Forward that text to the script and
it verifies the matching order by itself — no manual reconciliation, no gateway, no fees.

**How the match works.** The 12-digit UPI reference the payer copies off their success screen is
the same number the bank reports to you, so matching is exact rather than guesswork. If a
particular alert has no reference, the script falls back to matching on amount — but only when
exactly one recent pending order could explain that credit. Anything ambiguous or unrecognised
stays PENDING and emails you instead. It can only ever flip an existing order to VERIFIED; it can
never create an order or move money.

### a. Set a secret

In `Code.gs`, replace `SMS_TOKEN: 'CHANGE_ME_TO_A_LONG_RANDOM_STRING'` with a long random string
(30+ characters). Unlike anything in the website's JavaScript this genuinely is secret — it lives
only in the script and on Rohit's phone. Re-deploy after changing it.

### b. Check the parser against real messages

Open `testParse` in the editor and paste in two or three **real** ICICI credit texts from Rohit's
phone, then **Run** and read **Execution log**. Each should print an amount and a reference.
Bank wording varies, and this is the one part that depends on their exact format — five minutes
here saves a lot of confusion later. Send me a real message if it doesn't parse and I'll adjust it.

### c. Get the SMS off the phone — pick one route

**Android (instant, recommended).** Install a forwarding app that can POST — *MacroDroid*,
*Tasker*, or any "SMS to URL/Webhook" app. One rule:

- Trigger: SMS received, sender contains `ICICI` (or the exact sender ID on Rohit's phone)
- Action: HTTP POST to your `/exec` URL
- Content type: `text/plain`
- Body:

```json
{"type":"sms","token":"YOUR_SMS_TOKEN","text":"{sms_message}"}
```

Replace `{sms_message}` with whatever placeholder your app uses for the message body
(MacroDroid: `[sms_message]`, Tasker: `%SMSRB`).

**iPhone.** iOS won't let apps read SMS, so use Shortcuts: **Automation → Message →
Message contains `credited`** → *Run Immediately*, action **Get Contents of URL** with the same
POST body. If that proves fiddly, use the email route below instead.

**Either phone (simpler, ~5 min delay).** Forward bank SMS to
`indiemovementartproject@gmail.com` — Android forwarding apps do this natively, and on iPhone you
can ask ICICI to enable email alerts as well as SMS. Then run `installGmailPoll` **once** from the
editor and the script checks Gmail every 5 minutes. No token needed for this route.

### d. Watch it work

A new **Bank alerts** tab logs every credit the script sees: amount, reference, which receipt it
matched, and how. That is your audit trail — if something doesn't auto-verify, the reason is there.

Unmatched credits email you, since they usually mean someone paid without using the site, paid the
wrong amount, or hasn't submitted the form yet.

You can still set **Status** by hand at any time; manual and automatic paths send the same
confirmation email and don't tread on each other.

### What this does and doesn't fix

It removes the manual checking, and confirmations now go out in seconds instead of hours. What it
doesn't do is make the *website* certain at the moment of payment — certainty still arrives with
the bank's message a few seconds later. That's fine for bookings. Only a real payment gateway
closes that last gap, which is worth revisiting if you get an account approved.

**One caution worth naming:** this collects business payments into a personal account. It works,
but for volume you'd want a current account, and a gateway ultimately gives you cleaner books.

---

## Day to day

**With SMS forwarding set up (§6), most of this happens by itself:**

1. An order arrives → a `PENDING` row appears instantly and you get an email.
2. The bank texts Rohit → the script matches it and flips the row to `VERIFIED`, and the
   customer is emailed their confirmation. Usually within seconds.
3. You only touch the ones that didn't match — they stay `PENDING` and email you why.

The **Flags** column calls out amount mismatches, and **Verified by** shows `auto · UPI ref`,
`auto · amount`, or your email address for manual ones. A ⚠️ in a subject line means look closer.

## If something breaks

| Symptom | Cause |
|---|---|
| Receipt shown but "we've opened WhatsApp" | `ENDPOINT` is wrong/undeployed — the page fell back so no booking is lost |
| No emails | Gmail's daily quota (100/day on free accounts), the `setup` permission was never granted, or the buyer left email blank (it's optional — confirm those on WhatsApp) |
| "Unknown item" error | An item exists in `pay.html` but not in `PRICES` in `Code.gs` |
| Nothing happens on "Open UPI app" (desktop) | Expected — UPI links only work on phones; use the QR code |
| SMS arrives but nothing verifies | Run `testParse` with that exact message; if it prints `null` the wording needs a tweak in `parseBankSms` |
| `not authorised` from the webhook | `SMS_TOKEN` in the phone app doesn't match `Code.gs`, or the script wasn't re-deployed after changing it |
| Two orders share an amount | Deliberate — the script won't guess. Both stay `PENDING`; verify by hand, or give amounts unique paise |
