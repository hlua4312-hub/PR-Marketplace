/**
 * CAMPUS CART - DEPLOYMENT CONFIGURATION
 *
 * The two values at the top are the only place the backend is configured.
 * Point them at your own Supabase project and rebuild.
 *
 * There used to be a "Database Connection" card in the Account panel that let
 * anyone override these at runtime. It was removed: which database the app
 * talks to is a deployment decision, not a user preference, and exposing it
 * meant a buyer could break the app for themselves with no way back - the
 * screen that fixes it being the same screen they had just broken.
 *
 * The anon key is meant to be public. It ships in every browser that loads
 * the app, it identifies the project rather than the user, and it is not what
 * protects your data - the row-level security policies in supabase_schema.sql
 * are. Never put the service_role key here.
 */

window.PRConfig = {
  URL: 'https://pjvxssxcmdvchelglnzr.supabase.co',
  ANON_KEY: 'sb_publishable_gWK3Y6uOIq7sRreua8z16Q_dTvB-Nls',

  STORAGE_BUCKET: 'listing-images',

  APP_NAME: 'Campus Cart',

  /**
   * WHICH CAMPUS THIS BUILD IS FOR.
   *
   * Everything here is presentation: the labels on the chips, the places in
   * the pickup list, the hint under the sign-up field. None of it is a
   * security rule. The one rule that matters - who is allowed to post - is
   * `campus_settings.email_domains` in the database, because a check written
   * here runs in the browser and anyone holding the anon key can skip it.
   *
   * Keep `emailDomain` in step with what you set in SQL, or the sign-up form
   * will promise something the database then refuses.
   */
  CAMPUS: {
    name: 'Mizoram University',
    shortName: 'MZU',

    /**
     * The college's student email domain, for the sign-up hint only.
     * Leave it empty and the app stops mentioning a required address -
     * matching an empty `email_domains` in the database, which verifies
     * everyone. Set both together when you are ready to switch it on.
     */
    emailDomain: '',

    /** Feed chips and the category dropdown on the sell form. */
    categories: [
      { id: 'Books & Notes',        short: 'Books',      icon: '📚' },
      { id: 'Electronics',          short: 'Electronics', icon: '💻' },
      { id: 'Stationery',           short: 'Stationery', icon: '✏️' },
      { id: 'Room & Furniture',     short: 'Room',       icon: '🛏️' },
      { id: 'Clothing & Uniforms',  short: 'Clothing',   icon: '👕' },
      { id: 'Cycles & Transport',   short: 'Cycles',     icon: '🚲' },
      { id: 'Sports & Fitness',     short: 'Sports',     icon: '⚽' },
      { id: 'Lab & Project Kit',    short: 'Lab Kit',    icon: '🔬' },
      { id: 'Musical Instruments',  short: 'Music',      icon: '🎸' },
      { id: 'Other',                short: 'Other',      icon: '📦' }
    ],

    /**
     * Where things change hands. Deliberately a short list of places both
     * people can already picture, rather than a map pin or a hostel room
     * number: the point is a spot that is public, lit and easy to describe.
     */
    pickupSpots: [
      'Main Gate',
      'Library entrance',
      'Canteen',
      'Academic Block',
      'Boys Hostel gate',
      'Girls Hostel gate',
      'Sports ground',
      'Admin Block'
    ],

    /** Areas, for the header dropdown. Kept broader than the pickup spots. */
    areas: [
      'Campus',
      'Boys Hostel',
      'Girls Hostel',
      'Staff Quarters',
      'Off campus'
    ],

    departments: [
      'Computer Science',
      'Information Technology',
      'Electronics',
      'Mechanical',
      'Civil',
      'Commerce',
      'Economics',
      'English',
      'Education',
      'Life Sciences',
      'Mathematics',
      'Physics',
      'Chemistry',
      'Other'
    ],

    years: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG', 'PhD', 'Staff']
  },

  /** Sold listings disappear this many hours after being marked sold. */
  SOLD_ITEM_LIFETIME_HOURS: 5,

  /** Largest edge of an uploaded photo, in pixels, before upload. */
  IMAGE_MAX_DIMENSION: 1400,
  IMAGE_QUALITY: 0.82,

  /** Photos allowed on one listing. The database enforces the same ceiling. */
  MAX_PHOTOS_PER_ITEM: 6,

  /** Listings fetched per page in the feed. */
  PAGE_SIZE: 24,

  /** This build. Kept in step with package.json and app/build.gradle. */
  APP_VERSION: '4.1.1',

  /**
   * Where the deployed site publishes its version. The Android build checks
   * this to tell the user their APK is behind; leave it empty to switch the
   * check off. A sideloaded APK cannot install itself silently, so this
   * points people at a download rather than pretending to auto-update.
   */
  UPDATE_MANIFEST_URL: 'https://hlua4312-hub.github.io/PR-Marketplace/version.json',

  isConfigured() {
    return Boolean(
      this.URL &&
      this.ANON_KEY &&
      this.URL.startsWith('https://') &&
      this.ANON_KEY.length > 20
    );
  }
};
