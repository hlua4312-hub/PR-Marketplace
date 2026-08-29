# PR Marketplace

A mobile-first peer-to-peer marketplace for local community trading — textbooks, furniture, bikes, whatever your block or campus has going spare. Buyers and sellers deal with each other directly; the app takes no cut and handles no money.

Runs as an installable web app (PWA) and as an Android app that wraps the same code in a WebView.

---

## What it does

**Browse and find** — no account needed
- Anyone can open the app and browse the whole marketplace. An account is only
  asked for at the point it starts to matter: posting, messaging, or seeing a
  seller's contact details.
- 11 categories, instant search across title, description and location
- Filter by condition and maximum price, sort by newest, oldest or price
- Filter by area in Aizawl, or use GPS to snap to the nearest one
- Save listings to a device-local favourites list
- Pages load 24 at a time rather than everything at once

**Sell**
- Post with a photo, price, condition, location and description
- Optional WhatsApp number and Instagram handle for buyers who prefer those
- Optional payment QR code (UPI / GPay / PhonePe / Paytm) shown on the listing
- Crop and rotate photos before they upload
- Edit or delete anything you posted, from the listing or from **Account → My Listings**
- Mark an item sold; it comes off the marketplace 5 hours later, or put it back on sale

**Talk**
- A private thread per listing between the buyer and the seller
- A community room everyone can read and post in
- One-to-one private chats, opened by tapping someone's avatar in the room
- All of it live over Supabase Realtime — messages arrive without reopening anything
- A Messages tab collecting every conversation you're part of

**Stay safe**
- Report a listing; the seller is never told who reported it
- Confirmation before anything destructive
- Contact details only shown to signed-in users

**Look right**
- White storefront by default, the way most shopping apps present themselves
- Dark mode is opt-in under Account → App &amp; Security, not tied to the phone's
  system theme, and it is applied before first paint so there is no white flash

---

## Setup

You need a [Supabase](https://supabase.com) project (the free tier is fine) and either Python or Node.js to serve the files.

### 1. Create the database

**Close the app everywhere first** — browser tabs, phones, the Android build. Renaming a table needs an exclusive lock, and a running copy of the app holds read locks and Realtime subscriptions; the two deadlock and Postgres kills the script.

Then open your Supabase project → **SQL Editor** → paste the whole of [`supabase_schema.sql`](supabase_schema.sql) → **Run**.

It is safe to run more than once. It creates the tables, the row-level security policies, the image storage bucket and the Realtime publication.

> **Upgrading from an earlier version?** The script renames your old `users`, `items` and `messages` tables to `*_legacy` and revokes API access to them rather than deleting anything. Your rows are still there if you need them.
>
> The SQL Editor will warn that the query contains destructive operations. That is triggered by the `ALTER TABLE ... RENAME`, `DROP POLICY` and `REVOKE` statements — there is no `DROP TABLE` or `TRUNCATE` in the file, and no row is deleted.
>
> Expect the marketplace to be **empty** afterwards: the new `items` table starts fresh, and old listings cannot be carried over automatically because their owner is a text id that matches no account. To bring them back once you have registered, run [`docs/restore-legacy-listings.sql`](docs/restore-legacy-listings.sql).
>
> Drop `users_legacy` sooner rather than later — it is the table that held plaintext passwords.

**If the run fails**, the editor wraps the file in one transaction, so nothing is half-applied — the whole thing rolls back and you can just fix the cause and run it again. Two you might hit:

| Error | Cause | Fix |
|---|---|---|
| `deadlock detected` | a copy of the app is connected and holding locks | close every tab and device running it, then re-run |
| `canceling statement due to lock timeout` | same, but a pooled connection outlived the tab | see the commented `pg_stat_activity` queries at the top of the schema file |

### 2. Point the app at your project

Either edit `DEFAULT_URL` and `DEFAULT_ANON_KEY` in [`js/config.js`](js/config.js), or leave them and set your project from inside the app under **Account → Database Connection**.

Both values come from your Supabase dashboard under **Project Settings → API**. The anon key is designed to be public — it ships in every browser that loads the app. What protects your data is the row-level security policies, not the key.

### 3. Configure email

Under **Authentication → Providers → Email**, decide whether new accounts must confirm their address. Leaving confirmation on is the safer default; the app shows a "check your inbox" screen and waits.

For password reset links to come back to the right place, add your app's URL under **Authentication → URL Configuration → Redirect URLs**.

**To recover an account with a 6-digit code** rather than a link, edit the **Reset Password** template under Authentication → Emails and include `{{ .Token }}`:

```
Your PR Marketplace recovery code is {{ .Token }}
It expires in one hour.

Or open this link instead: {{ .ConfirmationURL }}
```

The app accepts either route — typing the code and clicking the link both land on the same "choose a new password" screen. The code is verified by Supabase with `verifyOtp`, server-side; the browser only relays what was typed.

### 4. Run it

```bash
npm start
```

Then open <http://localhost:8080>. Double-clicking `Launch_Web_App.bat` does the same thing on Windows.

`npm start` runs `scripts/dev-server.mjs`, a dependency-free static server that sends `Cache-Control: no-store`. That matters more than it sounds: `python -m http.server` sends no cache header at all, so browsers cache heuristically and keep rendering an old stylesheet after you have edited it — the change is on disk, served correctly, and never reaches the screen.

If you don't have Node.js:

```bash
npm run start:python
```

That works, but after editing a file you may need Ctrl+F5 to see the change.

> Opening `index.html` straight off disk will not work properly. Service workers and PWA install require a real `http://` origin, and the browser refuses both over `file://`.

---

## Android

The `android_app/` folder is an Android Studio project that loads the same web app from local assets over `https://appassets.androidplatform.net`, so service workers and modern web APIs behave as they do in a browser.

```bash
npm run android:debug     # or open android_app/ in Android Studio
```

The Gradle build copies the web app into `app/src/main/assets/www` automatically before compiling, so the APK can never ship stale HTML.

### Signing a release build

```bash
keytool -genkey -v -keystore pr-marketplace-release.jks \
        -keyalg RSA -keysize 2048 -validity 10000 -alias pr-marketplace
```

Copy `android_app/keystore.properties.example` to `android_app/keystore.properties`, fill in your values, then:

```bash
npm run android:release
```

Both `keystore.properties` and `*.jks` are gitignored. Without them the release build still compiles — it just comes out unsigned.

---

## Tests

```bash
npm test
```

56 tests over the parts that hold real logic: escaping and search highlighting, the price-ceiling rules, the offline cache, storage migration, and ownership checks. They run on Node's built-in test runner, so there is nothing to install.

CI runs the same tests and an Android debug build on every push — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## How it fits together

```
index.html ──┬── js/config.js          backend URL and key, with a device override
             ├── js/supabase-client.js everything that talks to Supabase
             ├── js/api.js             the surface the UI calls; favourites and offline cache
             └── js/app.js  (module)   bootstrap, navigation, back button, GPS, zoom
                     │
                     ├── ui.js         escaping, toasts, modals, image preparation
                     ├── store.js      filters and view state
                     ├── feed.js       cards, search, filters, carousel, pagination
                     ├── detail.js     one listing: contact, chat, owner actions, report
                     ├── sell.js       post and edit, photo upload
                     ├── cropper.js    crop and rotate
                     ├── messaging.js  community room, private chats, inbox
                     ├── auth.js       register, log in, password reset
                     └── account.js    profile, My Listings, settings, install
```

More detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and the data model in [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md).

---

## Security model

Worth stating plainly, because an earlier version of this project got it wrong.

- **Passwords never reach this code.** Supabase Auth handles registration and sign-in; it stores a bcrypt hash. The app never sees, compares or stores a password, and nothing password-shaped is ever written to the device.
- **Permission is decided by the database, not the browser.** Every rule — who can edit a listing, who can read a conversation, who can delete — is a row-level security policy checked against `auth.uid()`. The UI hides buttons you shouldn't press, but hiding them is a convenience; the policy is what actually stops you.
- **The anon key is public on purpose.** It identifies the project, not the user. Security comes from the policies.
- **Uploads are scoped.** Storage policy only lets you write into a folder named after your own user id.
- **Reports are write-only.** You can file one; you cannot read anyone else's.

Sold listings are deleted by `purge_expired_sold_items()`, a `SECURITY DEFINER` function, 5 hours after being marked sold. The app calls it on startup. To run it on a schedule instead, enable `pg_cron` and uncomment the `cron.schedule` line at the end of the schema.

---

## Known limits

- **Payments are out of scope.** The app displays a seller's QR code and nothing more — no gateway, no escrow, no record of whether anyone paid. Meeting and paying is arranged between the two people directly.
- **Reports have no admin screen yet.** They land in the `reports` table; someone has to look at it in the Supabase dashboard.
- **Community chat is unmoderated.** Anyone signed in can post to the room.
- **Phone numbers are not verified.** Only email is, via the confirmation link.
- **Areas are Aizawl-specific**, hardcoded in `js/app.js`.
- **Guests can see everything that is listed.** Browsing is deliberately open,
  so treat any column on `items` as public. Contact details are hidden in the
  UI for guests, but that is a product decision, not a security boundary — the
  row itself is readable. Do not add a genuinely private field to `items`
  without changing the select policy first.

---

## Licence

MIT — see [LICENSE](LICENSE).
