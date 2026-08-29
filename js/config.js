/**
 * PR MARKETPLACE - BACKEND CONFIGURATION
 *
 * The anon (publishable) key below is meant to be public - it ships in every
 * browser that loads the app. It is not a secret and it is not what protects
 * your data: the row-level security policies in supabase_schema.sql are.
 * Never put the service_role key in this file.
 *
 * To point the app at your own Supabase project, either edit the two values
 * here, or leave them alone and use Account -> Database Connection inside the
 * app, which stores an override on the device.
 */

window.PRConfig = {
  DEFAULT_URL: 'https://pjvxssxcmdvchelglnzr.supabase.co',
  DEFAULT_ANON_KEY: 'sb_publishable_gWK3Y6uOIq7sRreua8z16Q_dTvB-Nls',

  STORAGE_BUCKET: 'listing-images',

  /** Sold listings disappear this many hours after being marked sold. */
  SOLD_ITEM_LIFETIME_HOURS: 5,

  /** Largest edge of an uploaded photo, in pixels, before upload. */
  IMAGE_MAX_DIMENSION: 1400,
  IMAGE_QUALITY: 0.82,

  /** Listings fetched per page in the feed. */
  PAGE_SIZE: 24,

  urlKey: 'pr_supabase_url',
  anonKey: 'pr_supabase_key',

  get url() {
    try {
      return (localStorage.getItem(this.urlKey) || this.DEFAULT_URL || '').trim();
    } catch (e) {
      return this.DEFAULT_URL;
    }
  },

  get anonToken() {
    try {
      return (localStorage.getItem(this.anonKey) || this.DEFAULT_ANON_KEY || '').trim();
    } catch (e) {
      return this.DEFAULT_ANON_KEY;
    }
  },

  /** True when this device is pointed at a project other than the default. */
  get isOverridden() {
    try {
      return Boolean(localStorage.getItem(this.urlKey));
    } catch (e) {
      return false;
    }
  },

  setCredentials(url, key) {
    const cleanUrl = (url || '').trim().replace(/\/+$/, '');
    const cleanKey = (key || '').trim();
    if (!/^https:\/\/.+\.supabase\.(co|in)$/.test(cleanUrl)) {
      throw new Error('That does not look like a Supabase project URL. It should read https://your-project.supabase.co');
    }
    if (cleanKey.length < 20) {
      throw new Error('That anon key looks too short. Copy the full key from Project Settings > API.');
    }
    localStorage.setItem(this.urlKey, cleanUrl);
    localStorage.setItem(this.anonKey, cleanKey);
  },

  clearCredentials() {
    localStorage.removeItem(this.urlKey);
    localStorage.removeItem(this.anonKey);
  },

  isConfigured() {
    const u = this.url;
    const k = this.anonToken;
    return Boolean(u && k && u.startsWith('https://') && k.length > 20);
  }
};
