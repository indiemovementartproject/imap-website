# How to update the payment backend

**Preferred: let Claude do it.** Once clasp is set up (below), deploying is one
command and the manual dance is unnecessary:

    ./scripts/deploy-backend.sh

It pushes `apps-script/Code.gs`, updates the live deployment to a new version,
then checks the endpoint really is serving the new build before saying done.

---

## One-time clasp setup

1. Turn on the Apps Script API for the Google account that owns the script:
   <https://script.google.com/home/usersettings> → **Google Apps Script API: ON**

2. In a terminal: `clasp login` — a browser opens, sign in, allow access.

3. Get the **Script ID**: Apps Script editor → ⚙ **Project Settings** → *Script ID*.

4. Then, from the repo root:

       cd apps-script
       clasp clone <SCRIPT_ID>      # pulls the real manifest down
       cd ..
       ./scripts/deploy-backend.sh

---

## Doing it by hand (if clasp is unavailable)

## Step 1 — open the script

Open the iMAP payments Google Sheet → **Extensions** → **Apps Script**.
A code editor opens in a new tab, showing a file called **Code.gs**.

## Step 2 — replace everything

Click anywhere in the code, then:

- **Cmd + A** (select all)
- **Cmd + V** (paste the new version)
- **Cmd + S** (save)

Do not try to edit bits of it. Always replace the whole thing.

## Step 3 — deploy it

This is the step that actually makes it live. The editor showing new code does
**not** mean the website is using it.

1. Top right: **Deploy** → **Manage deployments**
2. Click the **pencil icon** ✏️ on the deployment already listed
3. Under **Version**, choose **New version**

   > **This is the step that goes wrong.** The dropdown opens showing the
   > version that is already deployed, e.g. "Version 7". If you leave it there
   > and press Deploy, Google redeploys the OLD code and reports success. The
   > editor will show your new code and the live site will still run the old.
   > You must actively change it to **New version**.

4. Click **Deploy**

> **Do not click "New deployment".** That creates a second, different web
> address and leaves the old one running the old code. The website keeps
> talking to the old address and nothing changes. This has cost us a real
> customer once.

## Step 4 — check it worked

Open the payment web address (the `/exec` link) in a browser tab. It shows a
line like:

    iMAP payment endpoint is running. build 2026-08-26-a

That build number must match the one at the top of `Code.gs`. If it still shows
the old number, the deployment did not take — repeat step 3.

## Step 5 — send yourself a test

Go to **indiemovementartproject.com/pay.html?test=1**

That puts a ₹1 item in the cart. Run the whole thing through. You should get:

- an email to all three addresses, subject like `Payment Rs 1 - Your Name - IMAP-26-0011`
- a confirmation email to whatever address you entered
- a new PENDING row in the sheet

---

## One-time setup: switch on the screenshot reader

Only needed once, and only if it is not already on. Without it everything still
works — the emails just say "we could not read the screenshot automatically".

1. In the Apps Script editor, left sidebar: **Services** (the **+** next to it)
2. Find **Drive API** in the list
3. Leave the identifier as `Drive`, click **Add**
4. Save and redeploy (step 3 above)

If it says the identifier is already used, it is already on — close the dialog.

---

## What to do if something looks wrong

| What you see | What it means |
|---|---|
| Build number will not change | You clicked "New deployment" instead of the pencil. Go to step 3. |
| No emails at all | Check the deployment ran at least once — open the `/exec` link. |
| "We could not read the screenshot" | The Drive API service is off, or Google throttled us. Harmless — check the screenshot by eye. |
| "AMOUNT MISMATCH" in an email | The screenshot does not show the amount ordered. **Do not mark VERIFIED.** Message the payer. |
