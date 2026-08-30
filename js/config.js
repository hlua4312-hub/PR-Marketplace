/**
 * PR MARKETPLACE - BACKEND CONFIGURATION
 *
 * The two values below are the only place the backend is configured. Point
 * them at your own Supabase project and rebuild.
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

  /** Sold listings disappear this many hours after being marked sold. */
  SOLD_ITEM_LIFETIME_HOURS: 5,

  /** Largest edge of an uploaded photo, in pixels, before upload. */
  IMAGE_MAX_DIMENSION: 1400,
  IMAGE_QUALITY: 0.82,

  /** Listings fetched per page in the feed. */
  PAGE_SIZE: 24,

  isConfigured() {
    return Boolean(
      this.URL &&
      this.ANON_KEY &&
      this.URL.startsWith('https://') &&
      this.ANON_KEY.length > 20
    );
  }
};
