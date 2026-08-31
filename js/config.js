/**
 * PR MARKETPLACE - DEPLOYMENT CONFIGURATION
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

  APP_NAME: 'PR Marketplace',

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
    /**
     * One list, three surfaces: the chips on Explore, the sell form and the
     * Wanted board all render from here, so a seller cannot file something
     * under a category the filter has never heard of.
     *
     * `examples` is shown under the picker. It is not a sub-category and
     * nothing is stored from it - a laptop and a processor both file under
     * Electronics & Computers. It exists because "Electronics" alone left
     * people guessing where a graphics card was supposed to go.
     */
    categories: [
      { id: 'Books & Notes',           short: 'Books',      icon: '📚',
        examples: 'Textbooks, notes, question papers, guides' },
      { id: 'Electronics & Computers', short: 'Computers',  icon: '💻',
        examples: 'Laptops, processors, RAM, graphics cards, SSDs, monitors, keyboards, phones, headphones, chargers' },
      { id: 'Stationery',              short: 'Stationery', icon: '✏️',
        examples: 'Pens, files, drafting sets, calculators' },
      { id: 'Room & Furniture',        short: 'Room',       icon: '🛏️',
        examples: 'Tables, chairs, mattresses, lamps, storage' },
      { id: 'Clothing & Uniforms',     short: 'Clothing',   icon: '👕',
        examples: 'Lab coats, uniforms, jackets, shoes' },
      { id: 'Cycles & Transport',      short: 'Cycles',     icon: '🚲',
        examples: 'Cycles, helmets, spares, scooter accessories' },
      { id: 'Sports & Fitness',        short: 'Sports',     icon: '⚽',
        examples: 'Rackets, balls, gym gear, jerseys' },
      { id: 'Lab & Project Kit',       short: 'Lab Kit',    icon: '🔬',
        examples: 'Arduino, sensors, breadboards, project components' },
      { id: 'Musical Instruments',     short: 'Music',      icon: '🎸',
        examples: 'Guitars, keyboards, amps, accessories' },
      { id: 'Other',                   short: 'Other',      icon: '📦',
        examples: 'Anything that does not fit the list above' }
    ],


    /**
     * Areas, for the header filter and the sell form. One list, so a seller
     * cannot file a listing under a place the filter has never heard of.
     *
     * `lat`/`lon` are optional and exist only for "Use my location", which
     * snaps to the nearest area that has them. Somewhere without coordinates
     * is still selectable by hand - it simply never wins the GPS match, and a
     * neighbouring area does. Inventing coordinates to fill the gaps would
     * make the snap confidently wrong rather than roughly right.
     */
    areas: [
      { name: 'Aizawl City',  label: 'Aizawl City Centre',      lat: 23.7271, lon: 92.7176 },
      { name: 'MZU Campus',   label: 'MZU Campus & Tanhril',    lat: 23.7420, lon: 92.6620 },
      { name: 'Zarkawt',      label: 'Zarkawt & Dawrpui',       lat: 23.7305, lon: 92.7210 },
      { name: 'Chanmari',     label: 'Chanmari & Ramhlun',      lat: 23.7420, lon: 92.7180 },
      { name: 'Khatla',       label: 'Khatla & Treasury Square', lat: 23.7180, lon: 92.7160 },
      { name: 'Bawngkawn',    label: 'Bawngkawn',               lat: 23.7620, lon: 92.7220 },
      { name: 'Vaivakawn',    label: 'Vaivakawn & Edenthar',    lat: 23.7350, lon: 92.6980 },
      { name: 'Luangmual',    label: 'Luangmual',               lat: 23.7450, lon: 92.6850 },
      { name: 'Durtlang',     label: 'Durtlang' },
      { name: 'Dinthar',      label: 'Dinthar' },
      { name: 'Chite',        label: 'Chite' },
      { name: 'Temple Veng',  label: 'Temple Veng & College Veng' },
      { name: 'Kulikawn',     label: 'Kulikawn & Tuikual' },
      { name: 'Lunglei',      label: 'Lunglei' }
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
  APP_VERSION: '4.4.0',

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
