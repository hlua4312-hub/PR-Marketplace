# 🛒 PR Marketplace - Local P2P Community Marketplace

PR Marketplace is a lightweight, mobile-first peer-to-peer (P2P) platform designed to simplify local community trading (such as campus students, residential block members, and local neighborhoods).

---

## 🌟 Key Features

1. **11 Full Product Categories (with Photos & Sample Data)**:
   - 📚 `Books & Study Materials`
   - 👕 `Fashion & Clothing`
   - 🛋️ `Furniture` (with high-quality furniture images)
   - ⚽ `Sports & Fitness`
   - 💄 `Beauty & Personal Care`
   - 🚲 `Vehicles & Accessories`
   - 🎮 `Toys & Games`
   - 🐾 `Pets & Pet Supplies`
   - 🏡 `Real Estate`
   - 🎸 `Musical Instruments`
   - 📦 `Other`

2. **Auto-Scrolling Discount & Offers Carousel**:
   - Auto-rotating promotional carousel (3.5s interval with pause on hover/touch).
   - Instant 1-tap category filtering for active campus deals.

3. **Real-Time Instant Search**:
   - Instant live search query matching title, description, or campus location.
   - Gold highlighting search badge (`<mark class="search-highlight">`) in item titles.

4. **Restricted "Mark as Sold" & 5-Hour Auto-Purge**:
   - Only the **Seller who posted the item** OR **Website Developers (via Developer Admin Mode)** can mark an item as SOLD.
   - Sold items display a `🔴 SOLD OUT` badge, strikethrough price, and auto-deletion countdown badge (`⏳ Auto-deletes in 5h`).
   - Automatically purged from database storage after 5 hours.

5. **Seller Payment QR Code Upload (UPI / GPay / PhonePe / Paytm / Venmo)**:
   - Sellers can upload their Payment QR Code image when creating a listing.
   - Displayed in item detail modal as a dedicated **"⚡ Direct Seller Payment QR Code"** section for instant scan & pay during local meetups.

6. **Direct P2P Buyer Contact & Support**:
   - Deep-linked WhatsApp chat button (`wa.me`), Instagram handle link, direct Phone call button.
   - My Account tab featuring Contact Us via WhatsApp, Instagram, Email support, About details, User Guide, Developer Admin Mode toggle, and 1-Click Database Reset button.

---

## ⚡ Supabase Cloud Database Integration Setup

PR Marketplace comes pre-configured with full **Supabase PostgreSQL Cloud Database** support!

### Step 1: Create Database Tables in Supabase
1. Log into your [Supabase Dashboard](https://app.supabase.com) and select/create a project.
2. Go to the **SQL Editor** tab.
3. Open [`supabase_schema.sql`](supabase_schema.sql) in this directory, copy its entire contents, paste it into the Supabase SQL Editor, and click **RUN**.
   - This creates the `users`, `items`, and `messages` tables, enables Row Level Security (RLS), and seeds initial items for all 11 categories!

### Step 2: Connect App to Supabase
1. In your Supabase Project Dashboard, navigate to **Project Settings > API**.
2. Copy your **Project URL** and **`anon` public key**.
3. Open PR Marketplace in your browser, tap the **Account** tab, and enter your credentials into the **Supabase Cloud Database Settings** card, then click **Connect Supabase Cloud DB**.
4. That's it! All new items posted on the website will now automatically store and sync directly in your Supabase PostgreSQL database!

---

## 📱 Android Mobile App (Android Studio Ready)

The `android_app/` folder is a complete, native Android Studio project configured for **PR Marketplace**.

### 🛠️ Quick 1-Click Launchers
- **`Open_In_Android_Studio.bat`**: Double-click to instantly open the project in Android Studio.
- **`Build_Android_APK.bat`**: Double-click to build a fresh `PR_Marketplace.apk` using Gradle.
- **`Sync_Web_To_Android.bat`**: Double-click to sync any web edits (`index.html`, `styles.css`, `js/`) directly into the Android assets.

---

### 📲 How to Open and Run in Android Studio

1. Open **Android Studio**.
2. Click **File > Open...** (or click `Open` on the Welcome Screen).
3. Navigate to:
   ```
   C:\Users\Asus\Desktop\PR Marketplace\PR_Marketplace_App\android_app
   ```
   and click **OK**.
4. Android Studio will automatically sync Gradle and index the project files.
5. To test:
   - **On Physical Phone**: Connect your Android phone via USB, enable **USB Debugging** in Developer Options, and click the green **Run (▶)** button in Android Studio.
   - **On Virtual Device (Emulator)**: Open the **Device Manager** in Android Studio, create/start an emulator (e.g. Pixel 8 / Android 14), and click **Run (▶)**.

---

### 📦 Direct APK Installation (Ready to install on Phone)

The ready-to-install debug APK is located at:
- `PR_Marketplace.apk` (in this root directory)
- `APK_Outputs\PR_Marketplace.apk`

**To Install on your Phone**:
1. Copy `PR_Marketplace.apk` to your phone via USB cable, WhatsApp, Google Drive, or email.
2. Tap the `.apk` file on your phone and choose **Install** (allow *Install unknown apps* if prompted).
3. Open **PR Marketplace** and enjoy the full native mobile experience!

---

## 🚀 How to Run in Web Browser

Simply double-click `Launch_Web_App.bat` or run:

```bash
# Using npx serve
npx serve .
```

Open `http://localhost:3000` or `http://127.0.0.1:5500` in your web browser.

