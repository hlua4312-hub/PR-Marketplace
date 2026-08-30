/**
 * CAMPUS CART - APPLICATION API
 *
 * The single surface the UI talks to. It delegates anything that needs a
 * server to js/supabase-client.js and keeps only genuinely device-local
 * things here: which listings you saved, which email you last signed in
 * with, and a small read-through cache so browsing still works offline.
 *
 * What is deliberately NOT stored on the device any more: passwords, the
 * user table, and the "which items are mine" list. Ownership is a property
 * of the row in the database now, not a guess made by the browser.
 */

class MarketplaceAPI {
  constructor() {
    this.favKey = 'pr_favorites_v2';
    this.cacheKey = 'pr_item_cache_v2';
    this.identifiersKey = 'pr_saved_identifiers_v2';
    this.profileKey = 'pr_active_profile_v2';

    this._profile = null;
    this._migrateLegacyStorage();
    this._restoreCachedProfile();
  }

  /**
   * Clear out storage written by earlier versions. The v1 keys held raw
   * passwords and base64 images, so this is a security cleanup as much as
   * a tidy-up - it runs once on every device that upgrades.
   */
  _migrateLegacyStorage() {
    const dead = [
      'pr_marketplace_users_v1',
      'pr_marketplace_active_user_v1',
      'pr_marketplace_remembered_accounts_v1',
      'pr_marketplace_items_v13_empty',
      'pr_marketplace_items_v12_clean',
      'pr_marketplace_items_v10',
      'pr_marketplace_items_v1',
      'pr_marketplace_my_items_v13',
      'pr_marketplace_favorites_v13',
      'pr_marketplace_chats_v1',
      'pr_user_permanent_posts',
      'pr_community_all_chat_v1',
      'pr_notifications',
      // Written by the Database Connection card, which no longer exists. Left
      // in place it would silently override js/config.js forever.
      'pr_supabase_url',
      'pr_supabase_key'
    ];
    try {
      dead.forEach(key => localStorage.removeItem(key));

      // The old private-chat keys were per-recipient, so they have to be
      // found by prefix. Walk the store with the indexed Storage API rather
      // than Object.keys, which is not how Storage is specified to enumerate.
      const stale = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('pr_private_chat_')) stale.push(key);
      }
      stale.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      /* private browsing - nothing to clean */
    }
  }

  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`Could not save ${key}:`, e);
      return false;
    }
  }

  isReady() {
    return window.supabaseAPI.isReady();
  }


  /* ======================================================================
     SESSION
     ====================================================================== */

  _restoreCachedProfile() {
    // Display details only - never a credential. The real session is the
    // signed token Supabase holds, and it is what any request is checked against.
    this._profile = this._read(this.profileKey, null);
  }

  _cacheProfile(profile) {
    this._profile = profile;
    if (profile) {
      this._write(this.profileKey, {
        id: profile.id,
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        avatarUrl: profile.avatarUrl || null,
        department: profile.department || null,
        yearOfStudy: profile.yearOfStudy || null,
        bio: profile.bio || null,
        // Left undefined when the profile row has not been read yet.
        // JSON drops the key, and isVerifiedStudent() reads that back as
        // "unknown" rather than "no" - see the note there.
        isVerified: profile.isVerified === undefined ? undefined : Boolean(profile.isVerified)
      });
    } else {
      try { localStorage.removeItem(this.profileKey); } catch (e) { /* ignore */ }
    }
  }

  /** Synchronous read for rendering. May be stale; refreshUser() confirms it. */
  getCurrentUser() {
    return this._profile;
  }

  /**
   * Is this account allowed to post?
   *
   * A cached answer, and only ever used to decide what to say - the real
   * check is the insert policy on items, which runs on the server against a
   * value the browser cannot edit. Unknown is treated as allowed, so a failed
   * profile fetch shows the sell form and lets the database refuse it with a
   * message, rather than hiding the button for a student who is verified.
   */
  isVerifiedStudent() {
    const user = this._profile;
    if (!user) return false;
    return user.isVerified !== false;
  }

  /**
   * Ask Supabase who is signed in, and update the cache.
   *
   * Two round trips: the session says who you are, the profile row says what
   * the marketplace knows about you. They are merged into one object because
   * every screen wants both and none of them should care that the name comes
   * from one place and the verified badge from another.
   */
  async refreshUser() {
    try {
      const user = await window.supabaseAPI.getCurrentUser();
      if (!user) {
        this._cacheProfile(null);
        return null;
      }

      const card = await window.supabaseAPI.fetchProfile(user.id).catch(() => null);
      const merged = card
        ? {
            ...user,
            fullName: card.fullName || user.fullName,
            avatarUrl: card.avatarUrl,
            department: card.department,
            yearOfStudy: card.yearOfStudy,
            bio: card.bio,
            isVerified: card.isVerified
          }
        : user;

      this._cacheProfile(merged);
      return merged;
    } catch (err) {
      return this._profile;
    }
  }

  /* ======================================================================
     PROFILE CARDS
     ====================================================================== */

  fetchProfile(userId)   { return window.supabaseAPI.fetchProfile(userId); }
  fetchProfiles(userIds) { return window.supabaseAPI.fetchProfiles(userIds); }
  fetchCampusSettings()  { return window.supabaseAPI.fetchCampusSettings(); }

  /* ======================================================================
     THE WANTED BOARD

     No offline cache here, unlike the feed. A request is a live ask - "I need
     a calculator by Friday" - and serving a stale one would send someone to
     answer a request that closed yesterday.
     ====================================================================== */

  fetchRequests(filters)     { return window.supabaseAPI.fetchRequests(filters); }
  fetchRequestById(id)       { return window.supabaseAPI.fetchRequestById(id); }
  createRequest(input)       { return window.supabaseAPI.createRequest(input); }
  updateRequest(id, patch)   { return window.supabaseAPI.updateRequest(id, patch); }
  deleteRequest(id)          { return window.supabaseAPI.deleteRequest(id); }

  /* ======================================================================
     REVIEWS
     ====================================================================== */

  fetchReviews(subjectId)    { return window.supabaseAPI.fetchReviews(subjectId); }
  fetchMyReviewOf(subjectId) { return window.supabaseAPI.fetchMyReviewOf(subjectId); }
  submitReview(review)       { return window.supabaseAPI.submitReview(review); }
  deleteMyReview(subjectId)  { return window.supabaseAPI.deleteMyReview(subjectId); }

  /** Save your own card, then re-merge it into the cached session. */
  async updateMyProfile(patch) {
    const card = await window.supabaseAPI.updateMyProfile(patch);
    if (card && this._profile) {
      this._cacheProfile({
        ...this._profile,
        fullName: card.fullName || this._profile.fullName,
        avatarUrl: card.avatarUrl,
        department: card.department,
        yearOfStudy: card.yearOfStudy,
        bio: card.bio,
        isVerified: card.isVerified
      });
    }
    return card;
  }

  onAuthStateChange(callback) {
    return window.supabaseAPI.onAuthStateChange(async (event, profile) => {
      if (!profile) {
        this._cacheProfile(null);
        callback(event, null);
        return;
      }

      // Cache the session first so anything rendering immediately has a name
      // to show, then fill in the card behind it.
      this._cacheProfile(profile);
      const merged = await this.refreshUser().catch(() => profile);
      callback(event, merged || profile);
    });
  }

  async signUp(userData) {
    const result = await window.supabaseAPI.signUp(userData);
    if (!result.needsEmailConfirmation) {
      await this.refreshUser();
    }
    return result;
  }

  async signIn(emailOrPhone, password) {
    const user = await window.supabaseAPI.signIn(emailOrPhone, password);
    this._cacheProfile(user);
    // The session alone does not carry the card - the photo, the course, the
    // verified flag all live in the profile row. Merge it in before anyone
    // renders, or the account panel greets a verified student as unverified.
    return (await this.refreshUser()) || user;
  }

  async signOut() {
    await window.supabaseAPI.signOut();
    this._cacheProfile(null);
  }

  requestPasswordReset(email) {
    return window.supabaseAPI.requestPasswordReset(email);
  }

  resendConfirmation(email) {
    return window.supabaseAPI.resendConfirmation(email);
  }

  async verifyRecoveryOtp(email, token) {
    const user = await window.supabaseAPI.verifyRecoveryOtp(email, token);
    this._cacheProfile(user);
    return user;
  }

  updatePassword(newPassword) {
    return window.supabaseAPI.updatePassword(newPassword);
  }

  /* ======================================================================
     SAVED SIGN-IN IDENTIFIERS
     Only the email or phone is kept, so the picker can fill the first field.
     Passwords are never written to the device.
     ====================================================================== */

  getSavedIdentifiers() {
    return this._read(this.identifiersKey, []);
  }

  saveIdentifier(identifier, displayName) {
    const clean = (identifier || '').trim().toLowerCase();
    if (!clean) return;
    const list = this.getSavedIdentifiers().filter(a => a.identifier !== clean);
    list.unshift({ identifier: clean, name: displayName || clean.split('@')[0], savedAt: new Date().toISOString() });
    this._write(this.identifiersKey, list.slice(0, 5));
  }

  removeIdentifier(identifier) {
    const clean = (identifier || '').trim().toLowerCase();
    this._write(this.identifiersKey, this.getSavedIdentifiers().filter(a => a.identifier !== clean));
  }

  /* ======================================================================
     LISTINGS
     ====================================================================== */

  /**
   * Fetch the feed. On a network failure we fall back to the cached page so
   * the app still shows something useful offline, and tell the caller it is
   * looking at cached data rather than pretending the fetch succeeded.
   */
  async fetchItems(filters = {}) {
    try {
      const items = await window.supabaseAPI.fetchItems(filters);
      if (!filters.page) this._cacheItems(items);
      return { items, fromCache: false };
    } catch (err) {
      console.warn('Falling back to cached listings:', err.message);
      return { items: this._filterCached(filters), fromCache: true, error: err };
    }
  }

  /** Cache listing metadata only. Images are URLs now, so this stays small. */
  _cacheItems(items) {
    this._write(this.cacheKey, items.slice(0, 60));
  }

  _filterCached(filters = {}) {
    let items = this._read(this.cacheKey, []);
    const cutoff = Date.now() - window.PRConfig.SOLD_ITEM_LIFETIME_HOURS * 3600 * 1000;
    items = items.filter(i => !(i.isSold && i.soldAt && new Date(i.soldAt).getTime() < cutoff));

    if (filters.category && filters.category !== 'all') {
      items = items.filter(i => i.category === filters.category);
    }
    if (filters.listingType && filters.listingType !== 'all') {
      items = items.filter(i => (i.listingType || 'sell') === filters.listingType);
    }
    if (filters.urgentOnly) {
      items = items.filter(i => i.isUrgent);
    }
    if (filters.conditions && filters.conditions.length) {
      items = items.filter(i => filters.conditions.includes(i.condition));
    }
    if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)) {
      items = items.filter(i => Number(i.price) <= filters.maxPrice);
    }
    if (filters.sellerId) {
      items = items.filter(i => i.userId === filters.sellerId);
    }
    if (filters.location && filters.location !== 'all' && filters.location !== 'detect_gps') {
      const loc = filters.location.toLowerCase();
      items = items.filter(i => (i.location || '').toLowerCase().includes(loc));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.location || '').toLowerCase().includes(q) ||
        (i.barterWant || '').toLowerCase().includes(q));
    }

    switch (filters.sort) {
      case 'price_asc':  items.sort((a, b) => a.price - b.price); break;
      case 'price_desc': items.sort((a, b) => b.price - a.price); break;
      case 'oldest':     items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
      case 'urgent':
        items.sort((a, b) =>
          (b.isUrgent === true) - (a.isUrgent === true) ||
          new Date(b.createdAt) - new Date(a.createdAt));
        break;
      default:           items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return items;
  }

  async fetchItemById(id) {
    try {
      return await window.supabaseAPI.fetchItemById(id);
    } catch (err) {
      return this._read(this.cacheKey, []).find(i => String(i.id) === String(id)) || null;
    }
  }

  createItem(itemData)      { return window.supabaseAPI.createItem(itemData); }
  updateItem(id, patch)     { return window.supabaseAPI.updateItem(id, patch); }
  markItemAsSold(id)        { return window.supabaseAPI.markItemAsSold(id); }
  relistItem(id)            { return window.supabaseAPI.relistItem(id); }
  deleteItem(id)            { return window.supabaseAPI.deleteItem(id); }
  reportItem(id, reason)    { return window.supabaseAPI.reportItem(id, reason); }

  createPayment(details)       { return window.supabaseAPI.createPayment(details); }
  fetchPayments()              { return window.supabaseAPI.fetchPayments(); }
  fetchMyPaymentForItem(id)    { return window.supabaseAPI.fetchMyPaymentForItem(id); }
  settlePayment(id, s, note)   { return window.supabaseAPI.settlePayment(id, s, note); }
  uploadImage(blob, kind)   { return window.supabaseAPI.uploadImage(blob, kind); }
  purgeExpiredSoldItems()   { return window.supabaseAPI.purgeExpiredSoldItems(); }

  /**
   * Ownership, decided by comparing the row's user_id to the signed-in user.
   * The database enforces the same rule, so this only controls which buttons
   * are drawn - it is no longer the thing standing between a stranger and
   * your listing.
   */
  isItemOwnedByCurrentUser(item) {
    const user = this.getCurrentUser();
    return Boolean(user && item && item.userId && item.userId === user.id);
  }

  /* ======================================================================
     FAVOURITES (device-local by design)
     ====================================================================== */

  getFavoriteIds() {
    return this._read(this.favKey, []).map(String);
  }

  toggleFavorite(itemId) {
    const id = String(itemId);
    let favs = this.getFavoriteIds();
    favs = favs.includes(id) ? favs.filter(f => f !== id) : favs.concat(id);
    this._write(this.favKey, favs);
    return favs;
  }

  isFavorite(itemId) {
    return this.getFavoriteIds().includes(String(itemId));
  }

  /* ======================================================================
     MESSAGING
     ====================================================================== */

  /** Channel id for a buyer's thread about one listing. */
  itemChannelId(itemId, buyerId) {
    return `${itemId}:${buyerId}`;
  }

  /** Channel id for a private conversation, stable whichever side builds it. */
  directChannelId(userIdA, userIdB) {
    return [String(userIdA), String(userIdB)].sort().join(':');
  }

  fetchMessages(channelType, channelId) {
    return window.supabaseAPI.fetchMessages(channelType, channelId);
  }

  sendMessage(channelType, channelId, body) {
    return window.supabaseAPI.sendMessage(channelType, channelId, body);
  }

  subscribeToMessages(channelType, channelId, onMessage) {
    return window.supabaseAPI.subscribeToMessages(channelType, channelId, onMessage);
  }

  fetchInbox() {
    return window.supabaseAPI.fetchInbox();
  }

  /* ======================================================================
     READ RECEIPTS FOR THE NOTIFICATIONS TAB
     Which threads you have already opened is a per-device preference, so it
     lives here rather than in the database.
     ====================================================================== */

  getSeenMessageIds() {
    return this._read('pr_seen_messages_v2', []);
  }

  markThreadSeen(latestMessageId) {
    if (!latestMessageId) return;
    const seen = this.getSeenMessageIds();
    if (!seen.includes(latestMessageId)) {
      seen.unshift(latestMessageId);
      this._write('pr_seen_messages_v2', seen.slice(0, 200));
    }
  }

  markAllSeen(messageIds) {
    const seen = Array.from(new Set(messageIds.concat(this.getSeenMessageIds())));
    this._write('pr_seen_messages_v2', seen.slice(0, 200));
  }
}

window.api = new MarketplaceAPI();
