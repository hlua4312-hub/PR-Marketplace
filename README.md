# Campus Cart

A student marketplace for one campus. Buy, sell, **give away** and **swap**
secondhand things — textbooks, notes, calculators, cycles, room furniture —
with other students at your own college. Buyers and sellers deal with each
other directly; the app takes no cut and handles no money.

Runs as an installable web app (PWA) and as an Android app that wraps the same
code in a WebView.

> Built on the PR Marketplace codebase. If you are upgrading from that, read
> **[Upgrading from PR Marketplace](#upgrading-from-pr-marketplace)** before
> running the schema.

---

## What it does

**Browse and find** — no account needed
- Anyone can open the app and browse the whole marketplace. An account is only
  asked for at the point it starts to matter: posting, messaging, or seeing a
  seller's contact details.
- Campus categories — books and notes, electronics, stationery, room and
  furniture, clothing and uniforms, cycles, sports, lab kit, instruments
- Four tabs across the top: **All**, **For sale**, **Free**, **Swap**
- Instant search across title, description, area and what a swap is asking for
- Filter by condition, maximum price, area, and *only people leaving campus*
- Sort by newest, oldest, price, or leaving-campus-first
- Save listings to a device-local favourites list
- Pull down at the top of the feed to refresh; keep scrolling at the bottom
  and the next 24 load themselves

**Post** — three modes, asked first
- **Sell it** — the ordinary case, with a price
- **Give free** — a giveaway. Its own mode rather than a price of zero, so it
  gets its own tab and reads correctly everywhere
- **Swap** — say what you want in exchange, with an optional cash difference
- Up to **6 photos** per listing, croppable and rotatable, first one is the
  cover and any photo can be promoted to it with a tap
- Category, condition, area and a **campus pickup spot** — main gate, library
  steps, canteen — chosen from a list rather than typed
- A **leaving campus** flag for the end-of-semester clear-out
- Optional WhatsApp number, Instagram handle, and UPI ID
- Edit or delete anything you posted, from the listing or from
  **Account → My Listings**
- Mark an item sold; it comes off the marketplace 5 hours later

**Prove you're a student**
- Sign up with your college email address and the account is verified the
  moment it is created
- **Only verified accounts can post.** Browsing and messaging stay open — a
  marketplace where the buyers are locked out is not safer, just empty
- The rule lives in the database, in `campus_settings.email_domains`, not in
  the browser. See [Verification](#verification)

**Ask for what you need**
- A **Wanted** tab beside the listing modes: the board of what students are
  looking for, rather than what they have
- Post a request with a category, a budget and a "needed by" date, which shows
  as *Needed tomorrow* rather than a date the reader has to do sums on
- "I have this" opens a private message to whoever asked, with the first line
  already written
- Mark a request **Got it** when someone comes through, or delete it
- There is deliberately **no matching engine.** Pairing requests to listings
  automatically sounds obvious and behaves badly at campus scale — a few
  hundred listings produce almost no matches, and a notification that never
  fires reads as broken rather than empty. People read the board.

**Judge who you're dealing with**
- One to five stars and a line of text, on the seller's card
- **One review per person, per person**, and you can rewrite it. Not one per
  deal: letting the same pair stack up five reviews turns the number into a
  measure of how often two friends traded, not how reliable anyone is
- You can only review someone you have actually exchanged messages with — a
  policy on the table, not a check in the browser
- A new account shows no stars at all rather than a zero, because "not rated
  yet" and "rated badly" are different things

**Show who you are**
- Profile photo, display name, department, year and a one-line bio
- Buyers see that card, and a **Verified student** badge, on every listing you
  post

**Talk** — all under the Messages tab
- A private thread per listing between the buyer and the seller
- Tap-to-fill openers that change with the mode — "Is this still available?" on
  a sale, "I have X — interested?" on a swap
- A community room everyone can read and post in
- One-to-one private chats, opened by tapping someone's avatar in the room
- All of it live over Supabase Realtime — messages arrive without reopening
  anything

**Get paid** — direct UPI, no gateway, no fee
- Sellers add a UPI ID; buyers get a QR and a `upi://` link with the amount
  already set, which opens GPay, PhonePe or any UPI app
- The buyer submits the reference number their app returns, and the seller
  marks it Received or Not received under **Account → Payments**
- **The app never touches the money and cannot verify a transfer.** That would
  need a payment gateway. What is stored is the buyer's own claim, for the
  seller to check against their bank app — which is why nothing is marked paid
  until the seller says so. Two related limits worth knowing: the amount in a
  UPI link is only a suggestion, since most apps let the payer edit it before
  sending; and a reference number of the right shape is accepted whether or not
  it corresponds to a real transaction.
- Giveaways never show a pay button, and a swap only shows one when the seller
  named a cash difference.

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

Edit `URL` and `ANON_KEY` in [`js/config.js`](js/config.js). Both come from your Supabase dashboard under **Project Settings → API**.

### 2b. Tell it which campus it is for

The same file holds a `CAMPUS` block: the college name, the category chips,
the areas in the header filter, the pickup spots on the sell form, and the
department and year lists on the profile editor. Edit that one object and the
whole app follows — the lists used to be typed into `index.html` three times
over and drifted apart.

```js
CAMPUS: {
  name: 'Mizoram University',
  shortName: 'MZU',
  emailDomain: '',          // see Verification, below
  categories: [ ... ],
  pickupSpots: [ ... ],
  areas: [ ... ],
  departments: [ ... ],
  years: [ ... ]
}
```

Everything in there is presentation. The one rule that decides who may post
lives in the database — see below.

That file is the only place the backend is configured. There is deliberately no in-app setting for it: which database the app talks to is a deployment decision, not a user preference, and putting it in the Account panel let anyone break the app for themselves with no way back — the screen that fixes it being the same screen they had just broken.

The anon key is designed to be public. It ships in every browser that loads the app and identifies the project rather than the user. What protects your data is the row-level security policies, not the key.

### 3. Turn on student verification

Out of the box, **every account is verified** and can post. That is deliberate:
a half-configured deployment should be usable rather than a wall nobody can get
past.

To restrict posting to your college, set the domain in the database:

```sql
update public.campus_settings
set campus_name  = 'Mizoram University',
    email_domains = array['mzu.edu.in']
where id;
```

and set the matching `emailDomain` in `js/config.js` so the sign-up form can
say so before someone fills in the whole form.

**Both halves matter, and they are not the same check.** The one in
`js/config.js` is a message. The one in `campus_settings` is the rule: the
sign-up trigger reads it to decide `profiles.is_verified`, and the insert
policy on `items` refuses a listing from an account where that is false. A
domain check written in the browser is decoration — anyone holding the anon key
can call the API directly and skip it.

Accounts that already exist are re-judged by the same rule when you run the
schema, so switching verification on does not lock out the people already
using it — anyone whose address matches stays verified.

To verify someone by hand — an address the domain rule misses, a student on
exchange:

```sql
update public.profiles
set is_verified = true, verified_at = now()
where id = '<their uuid>';
```

A trigger stops an account changing its own `is_verified`, so this only works
from the SQL editor. Reading and messaging are never gated; only posting is.

### 4. Configure email

Under **Authentication → Providers → Email**, decide whether new accounts must confirm their address. Leaving confirmation on is the safer default; the app shows a "check your inbox" screen and waits.

For password reset links to come back to the right place, add your app's URL under **Authentication → URL Configuration → Redirect URLs**.

**To recover an account with a 6-digit code** rather than a link, edit the **Reset Password** template under Authentication → Emails and include `{{ .Token }}`:

```
Your PR Marketplace recovery code is {{ .Token }}
It expires in one hour.

Or open this link instead: {{ .ConfirmationURL }}
```

The app accepts either route — typing the code and clicking the link both land on the same "choose a new password" screen. The code is verified by Supabase with `verifyOtp`, server-side; the browser only relays what was typed.

### 5. Run it

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

## Upgrading from PR Marketplace

Running [`supabase_schema.sql`](supabase_schema.sql) again is enough. It is
additive: it adds the columns Campus Cart needs (`profiles.avatar_url`,
`department`, `year_of_study`, `bio`, `is_verified`; `items.listing_type`,
`barter_want`, `pickup_spot`, `image_urls`, `is_urgent`), creates the
`campus_settings` table, backfills every existing listing's gallery from its
single photo, and marks every existing account verified. No row is deleted and
no column is dropped.

Two things it deliberately does **not** do, because they are judgement calls
about your data rather than facts:

- **Old categories are left alone.** "Fashion & Clothing" and "Real Estate" are
  not on the campus list any more, so those listings keep their old label and
  stop matching any chip. [`docs/migrate-to-campus-categories.sql`](docs/migrate-to-campus-categories.sql)
  maps them across; read the mapping before running it.
- **Old areas are left alone** for the same reason. There is no sensible
  automatic route from "Zarkawt" to "Boys Hostel". The same file has a
  commented-out statement that puts everything in "Off campus" to start from.

The Android package id is unchanged (`com.prmarketplace.app`), so an existing
install updates in place rather than appearing twice. Only the label changes.

---

## Android

The `android_app/` folder is an Android Studio project that loads the same web app from local assets over `https://appassets.androidplatform.net`, so service workers and modern web APIs behave as they do in a browser.

```bash
npm run android:debug     # or open android_app/ in Android Studio
```

The APK lands in `APK_Outputs/PR_Marketplace.apk`. Copy it to your phone and install.

### Working against a real phone

With USB debugging on (Settings → About phone → tap Build number seven times, then Developer options → USB debugging), the loop is one command:

```bash
npm run android:debug && adb install -r android_app/app/build/outputs/apk/debug/app-debug.apk
```

Debug builds install as `com.prmarketplace.app.debug` and are labelled **PR Marketplace (Debug)**, so they sit alongside a signed release rather than colliding with it.

Two things the debug build turns on that release does not:

- **`adb logcat -s PRWebView`** shows the page's own console, so a JavaScript error on the phone is readable instead of invisible.
- **`chrome://inspect`** in desktop Chrome attaches full DevTools to the WebView while it runs on the phone.

Both are gated behind `FLAG_DEBUGGABLE` and are off in release, where they would expose the page to anyone with adb access.

> **Editing the web files does not change an APK that is already installed.** The assets are compiled into the package, so after any change you have to rebuild and reinstall — otherwise the phone keeps running the build it was given. If a change still does not appear after reinstalling, uninstall first: an update keeps the WebView's storage, including the old service worker cache.

> **`local.properties`** holds the path to your Android SDK and is gitignored, so it will not exist on a fresh clone. Opening `android_app/` in Android Studio once writes it for you. Writing it by hand works too, but note it is a Java `.properties` file — either double every backslash or just use forward slashes:
> ```
> sdk.dir=C:/Users/YOU/AppData/Local/Android/Sdk
> ```

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

## Going live

Push to `main` and [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes the web app to GitHub Pages. Tests run first, and a failing test never reaches the live site.

The workflow copies **only** the files a browser needs into a `site/` directory rather than publishing the repository root. That is deliberate: the root also contains `android_app/`, and a working copy there holds `local.properties` and possibly a signing keystore. A final step fails the build if anything matching those ever reaches the publish directory.

Two settings to change once you know your URL:

1. **Supabase → Authentication → URL Configuration → Redirect URLs** — add your live address, or the confirmation and password-reset links will not come back to the app.
2. **`UPDATE_MANIFEST_URL` in [`js/config.js`](js/config.js)** — set it to `https://YOUR-SITE/version.json` to turn on the Android update check. Leave it empty and the check stays off.

### Updates

**The web app updates itself.** The service worker downloads a new release in the background and then waits. When one is ready the app offers a **Reload**, rather than taking it — swapping the assets under someone mid-message would lose what they were typing. Accepting activates the new version, reloads once, and clears the old cache. It checks on launch, when the tab regains focus, and every 30 minutes.

**The Android app cannot update itself, and does not pretend to.** A sideloaded APK has no way to silently replace itself: Android requires the user to confirm every install, and only the Play Store or a package-installer permission avoids that. Instead the app reads `version.json` from the deployed site and, when your installed build is behind, shows **Update available** under Account → App & Security with a link to the release. Publish the APK as a GitHub release and the link resolves to it.

Bump the version in three places together — `package.json`, `APP_VERSION` in `js/config.js`, and `versionName`/`versionCode` in `android_app/app/build.gradle`.

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
index.html ──┬── js/config.js          backend URL, key, and the CAMPUS block
             ├── js/supabase-client.js everything that talks to Supabase
             ├── js/api.js             the surface the UI calls; favourites and offline cache
             └── js/app.js  (module)   bootstrap, navigation, back button, GPS, zoom
                     │
                     ├── campus.js     paints the campus lists into the DOM
                     ├── ui.js         escaping, toasts, modals, image preparation
                     ├── store.js      filters and view state
                     ├── feed.js       cards, search, filters, mode tabs, pagination
                     ├── detail.js     one listing: gallery, contact, chat, owner actions
                     ├── sell.js       post and edit, listing modes, multi-photo upload
                     ├── requests.js   the wanted board: post, answer, close
                     ├── cropper.js    crop and rotate
                     ├── messaging.js  community room, private chats, inbox
                     ├── auth.js       register, log in, password reset
                     └── account.js    profile card and editor, My Listings, settings
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
- **Verification is not self-service.** `profiles.is_verified` is set by the
  sign-up trigger from `campus_settings.email_domains`, and a trigger refuses
  any attempt by an account to change its own. The insert policy on `items` is
  what actually stops an unverified account posting.
- **A review needs a conversation.** The insert policy calls
  `has_conversed()`, which asks whether both people have posted in the same
  non-community channel. Someone can leave a review only where the other party
  took part, so review-bombing needs the target's cooperation.
- **A phone number is not part of a profile card.** Profile rows are readable
  by anyone — a seller's name, photo and course are part of deciding whether to
  meet a stranger — but `phone` is held back by a column grant rather than a
  policy, because it is a column-shaped rule and RLS works on rows.

Sold listings are deleted by `purge_expired_sold_items()`, a `SECURITY DEFINER` function, 5 hours after being marked sold. The app calls it on startup. To run it on a schedule instead, enable `pg_cron` and uncomment the `cron.schedule` line at the end of the schema.

---

## Known limits

- **Payments are out of scope.** The app displays a seller's QR code and nothing more — no gateway, no escrow, no record of whether anyone paid. Meeting and paying is arranged between the two people directly.
- **Reports have no admin screen yet.** They land in the `reports` table; someone has to look at it in the Supabase dashboard.
- **Community chat is unmoderated.** Anyone signed in can post to the room.
- **Phone numbers are not verified.** Only email is, via the confirmation link.
- **Verification proves an address, not a person.** Anyone who can receive mail
  at the college domain is treated as a student. It stops strangers off the
  internet; it does not stop a graduate whose account still works.
- **A swap is not tracked.** Barter is a listing mode and a conversation, not a
  transaction with a state — nothing records that the exchange happened.
- **A review means "we talked", not "we traded".** Nothing in the app can
  witness a handshake behind the library, so the bar for leaving one is an
  exchange of messages. It cannot be met without the other person taking part,
  which is what makes it worth anything, but it is not proof of a deal.
- **Requests are not matched to listings.** Deliberate — see above.
- **Nobody can block another user yet.** Reporting a listing works; reporting a
  person does not.
- **There are no notifications outside the app.** Realtime keeps an open app up
  to date; nothing reaches a closed one.
- **Guests can see everything that is listed.** Browsing is deliberately open,
  so treat any column on `items` as public. Contact details are hidden in the
  UI for guests, but that is a product decision, not a security boundary — the
  row itself is readable. Do not add a genuinely private field to `items`
  without changing the select policy first.

---

## Licence

MIT — see [LICENSE](LICENSE).
