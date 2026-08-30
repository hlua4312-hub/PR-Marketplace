/**
 * CAMPUS CART - SUPABASE DATA LAYER
 *
 * Everything that talks to the backend lives here: authentication, listings,
 * image uploads, messaging and reports.
 *
 * Two rules this file follows and the rest of the app relies on:
 *   1. Identity comes from Supabase Auth. This file never sees, stores or
 *      compares a password - signInWithPassword does that on the server.
 *   2. Permission is never decided here. The policies in supabase_schema.sql
 *      decide; a call that is not allowed comes back as an error, and we
 *      surface it rather than pretending it worked.
 */

const CONNECTION_ERROR =
  'Could not reach the marketplace. Check your connection and try again.';

class SupabaseMarketplaceClient {
  constructor() {
    this.client = null;
    this.bucket = window.PRConfig.STORAGE_BUCKET;
    this.initClient();
  }

  initClient() {
    const cfg = window.PRConfig;
    if (!window.supabase || !cfg.isConfigured()) {
      this.client = null;
      return;
    }
    try {
      this.client = window.supabase.createClient(cfg.URL, cfg.ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'pr_marketplace_session'
        }
      });
    } catch (err) {
      console.error('Supabase client could not start:', err);
      this.client = null;
    }
  }


  isReady() {
    return Boolean(this.client);
  }

  _require() {
    if (!this.client) throw new Error(CONNECTION_ERROR);
    return this.client;
  }

  /* ======================================================================
     AUTHENTICATION
     ====================================================================== */

  /**
   * Register an account. The password goes straight to Supabase Auth, which
   * stores a bcrypt hash. It is never written to any table we control and
   * never touches localStorage.
   */
  async signUp({ fullName, email, phone, password }) {
    const db = this._require();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = (phone || '').replace(/[^\d]/g, '');

    if (cleanPhone) {
      const { data: taken, error: phoneErr } = await db.rpc('phone_is_taken', { p_phone: cleanPhone });
      if (!phoneErr && taken) {
        throw new Error('DUPLICATE_PHONE');
      }
    }

    const { data, error } = await db.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: fullName.trim(), phone: cleanPhone }
      }
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already')) {
        throw new Error('DUPLICATE_EMAIL');
      }
      if (msg.includes('password')) throw new Error('WEAK_PASSWORD');
      throw error;
    }

    // With email confirmation switched on, Supabase returns a user but no
    // session. The caller shows the "check your inbox" state in that case.
    return {
      user: this._toProfile(data.user, { fullName, email: cleanEmail, phone: cleanPhone }),
      needsEmailConfirmation: Boolean(data.user && !data.session)
    };
  }

  /** Sign in with either an email address or a registered phone number. */
  async signIn(emailOrPhone, password) {
    const db = this._require();
    const raw = (emailOrPhone || '').trim();
    let email = raw.toLowerCase();

    if (!raw.includes('@')) {
      const digits = raw.replace(/[^\d]/g, '');
      const { data: resolved, error } = await db.rpc('email_for_phone', { p_phone: digits });
      if (error || !resolved) throw new Error('ACCOUNT_NOT_FOUND');
      email = resolved;
    }

    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('email not confirmed')) throw new Error('EMAIL_NOT_CONFIRMED');
      if (msg.includes('invalid login')) throw new Error('INVALID_CREDENTIALS');
      throw error;
    }

    return this._toProfile(data.user);
  }

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
  }

  /** The signed-in user, or null. Reads the token Supabase already verified. */
  async getCurrentUser() {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getUser();
    if (error || !data || !data.user) return null;
    return this._toProfile(data.user);
  }

  onAuthStateChange(callback) {
    if (!this.client) return () => {};
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      callback(event, session ? this._toProfile(session.user) : null);
    });
    return () => data.subscription.unsubscribe();
  }

  /**
   * Send the sign-up confirmation email again.
   *
   * This is a different email from a password reset, and asking for the wrong
   * one leaves the account unconfirmed no matter how many times you click.
   */
  async resendConfirmation(email) {
    const db = this._require();
    const { error } = await db.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      // The free tier allows only a handful of emails an hour, and the error
      // for that is worth naming rather than passing through raw.
      if (msg.includes('rate limit') || msg.includes('too many') || error.status === 429) {
        throw new Error('EMAIL_RATE_LIMITED');
      }
      if (msg.includes('already confirmed')) throw new Error('ALREADY_CONFIRMED');
      throw error;
    }
    return true;
  }

  /**
   * Start account recovery.
   *
   * This one call produces both routes: Supabase mints a recovery token and
   * puts whatever the email template asks for into the message - a link, a
   * 6-digit code, or both. The app accepts either.
   *
   * Always resolves, so the form cannot be used to discover which addresses
   * are registered.
   */
  async requestPasswordReset(email) {
    const db = this._require();
    const redirectTo = window.location.origin + window.location.pathname;
    await db.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    return true;
  }

  /**
   * Check a recovery code and, if it is right, sign the user in so they can
   * set a new password.
   *
   * The code is verified by Supabase, against a token it generated and hashed
   * server-side. The browser only relays what the user typed - it cannot see
   * the expected value or decide the answer.
   */
  async verifyRecoveryOtp(email, token) {
    const db = this._require();
    const code = String(token || '').replace(/\D/g, '');

    if (code.length < 6) throw new Error('OTP_INCOMPLETE');

    const { data, error } = await db.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: 'recovery'
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (error.status === 429) throw new Error('EMAIL_RATE_LIMITED');
      // Supabase answers a wrong code and a stale one with the same string,
      // "Token has expired or is invalid", so do not claim to know which.
      if (msg.includes('expired') || msg.includes('invalid') || msg.includes('not found')) {
        throw new Error('OTP_REJECTED');
      }
      throw error;
    }

    if (!data.session) throw new Error('OTP_INVALID');
    return this._toProfile(data.user);
  }

  async updatePassword(newPassword) {
    const db = this._require();
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return true;
  }

  _toProfile(user, fallback = {}) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    return {
      id: user.id,
      fullName: meta.full_name || fallback.fullName || (user.email || '').split('@')[0],
      email: user.email || fallback.email || '',
      phone: meta.phone || fallback.phone || '',
      createdAt: user.created_at
    };
  }

  /* ======================================================================
     PROFILE CARDS

     The columns below are the whole of what the API is allowed to read from
     public.profiles - the phone number is held back by a column grant in the
     schema, not by anything written here. Asking for `*` would be refused,
     which is why every query in this section names its columns.
     ====================================================================== */

  static get PROFILE_COLUMNS() {
    return 'id, full_name, avatar_url, department, year_of_study, bio, ' +
           'is_verified, verified_at, rating_avg, rating_count, created_at';
  }

  /** One person's public card: name, photo, course, verified badge. */
  async fetchProfile(userId) {
    const db = this._require();
    if (!userId) return null;

    const { data, error } = await db
      .from('profiles')
      .select(SupabaseMarketplaceClient.PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data ? this._toProfileCard(data) : null;
  }

  /** Several at once, for a list. Returns a Map keyed by user id. */
  async fetchProfiles(userIds) {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (!ids.length) return new Map();

    const db = this._require();
    const { data, error } = await db
      .from('profiles')
      .select(SupabaseMarketplaceClient.PROFILE_COLUMNS)
      .in('id', ids);

    if (error) throw error;
    return new Map((data || []).map(row => [row.id, this._toProfileCard(row)]));
  }

  /**
   * Edit your own card. `is_verified` is deliberately not settable: the
   * update policy would allow the column through, so a trigger in the schema
   * refuses the change instead. Leaving it out here as well means the app
   * never even asks.
   */
  async updateMyProfile(patch) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');

    const row = {};
    if (patch.fullName !== undefined)     row.full_name = (patch.fullName || '').trim();
    if (patch.avatarUrl !== undefined)    row.avatar_url = patch.avatarUrl || null;
    if (patch.department !== undefined)   row.department = patch.department || null;
    if (patch.yearOfStudy !== undefined)  row.year_of_study = patch.yearOfStudy || null;
    if (patch.bio !== undefined)          row.bio = (patch.bio || '').trim() || null;

    if (!Object.keys(row).length) return this.fetchProfile(user.id);

    const { data, error } = await db
      .from('profiles')
      .update(row)
      .eq('id', user.id)
      .select(SupabaseMarketplaceClient.PROFILE_COLUMNS)
      .single();

    if (error) throw error;

    // The display name is read straight off the session in most of the app,
    // so it has to move in both places or the header and the profile card
    // disagree until the next sign-in.
    if (row.full_name) {
      await db.auth.updateUser({ data: { full_name: row.full_name } }).catch(() => {});
    }
    return this._toProfileCard(data);
  }

  _toProfileCard(row) {
    return {
      id: row.id,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      department: row.department,
      yearOfStudy: row.year_of_study,
      bio: row.bio,
      isVerified: Boolean(row.is_verified),
      verifiedAt: row.verified_at,
      // Kept on the profile row by a trigger on reviews, so a seller card is
      // one request rather than one plus an aggregate.
      ratingAvg: row.rating_avg === null || row.rating_avg === undefined ? null : Number(row.rating_avg),
      ratingCount: Number(row.rating_count) || 0,
      createdAt: row.created_at
    };
  }

  /* ======================================================================
     REQUESTS - THE WANTED BOARD

     The mirror of a listing: "I need this" rather than "I have this".
     Same posting rule - reading is open, posting needs a verified account.
     ====================================================================== */

  async fetchRequests(filters = {}) {
    const db = this._require();
    const pageSize = filters.pageSize || window.PRConfig.PAGE_SIZE;
    const page = filters.page || 0;

    let query = db.from('requests').select('*');

    // The board defaults to what is still open. Someone's own requests are
    // shown whatever their status, because closing one is not the same as
    // wanting it gone from your own list.
    if (filters.mine) {
      query = query.eq('user_id', filters.mine);
    } else {
      query = query.eq('status', filters.status || 'open');
    }
    if (filters.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }
    if (filters.search) {
      const q = filters.search.replace(/[%,()]/g, ' ').trim();
      if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(row => this._toRequest(row));
  }

  async fetchRequestById(id) {
    const db = this._require();
    const { data, error } = await db.from('requests').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? this._toRequest(data) : null;
  }

  async createRequest(input) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');

    const { data, error } = await db
      .from('requests')
      .insert([{
        user_id: user.id,
        title: input.title,
        description: input.description || null,
        category: input.category,
        budget_max: input.budgetMax === '' || input.budgetMax === null || input.budgetMax === undefined
          ? null
          : Number(input.budgetMax),
        needed_by: input.neededBy || null,
        requester_name: input.requesterName || user.fullName
      }])
      .select()
      .single();

    if (error) throw this._postingError(error);
    return this._toRequest(data);
  }

  async updateRequest(id, patch) {
    const db = this._require();
    const row = {};
    if (patch.title !== undefined)       row.title = patch.title;
    if (patch.description !== undefined) row.description = patch.description || null;
    if (patch.category !== undefined)    row.category = patch.category;
    if (patch.neededBy !== undefined)    row.needed_by = patch.neededBy || null;
    if (patch.status !== undefined)      row.status = patch.status;
    if (patch.budgetMax !== undefined) {
      row.budget_max = patch.budgetMax === '' || patch.budgetMax === null
        ? null
        : Number(patch.budgetMax);
    }

    const { data, error } = await db.from('requests').update(row).eq('id', id).select().single();
    if (error) throw this._ownershipError(error);
    return this._toRequest(data);
  }

  async deleteRequest(id) {
    const db = this._require();
    const { data, error } = await db.from('requests').delete().eq('id', id).select();
    if (error) throw this._ownershipError(error);
    if (!data || data.length === 0) throw new Error('NOT_YOUR_LISTING');
    return true;
  }

  _toRequest(row) {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      category: row.category,
      budgetMax: row.budget_max === null ? null : Number(row.budget_max),
      neededBy: row.needed_by,
      requesterName: row.requester_name,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /* ======================================================================
     REVIEWS

     Public, one per person per person, and only for someone you have
     actually exchanged messages with. The last part is a policy on the
     table - this file only decides what to ask for.
     ====================================================================== */

  async fetchReviews(subjectId) {
    const db = this._require();
    const { data, error } = await db
      .from('reviews')
      .select('*')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data || []).map(row => this._toReview(row));
  }

  /** What the signed-in user has already said about someone, if anything. */
  async fetchMyReviewOf(subjectId) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) return null;

    const { data, error } = await db
      .from('reviews')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('author_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return data ? this._toReview(data) : null;
  }

  /**
   * Leave or rewrite a review. Upsert rather than insert-or-catch: the unique
   * constraint on (author, subject) is what makes one review per pair true,
   * and going through it deliberately is clearer than handling 23505.
   */
  async submitReview({ subjectId, rating, body }) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');
    if (user.id === subjectId) throw new Error('CANNOT_REVIEW_YOURSELF');

    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('BAD_RATING');

    const { data, error } = await db
      .from('reviews')
      .upsert(
        {
          subject_id: subjectId,
          author_id: user.id,
          author_name: user.fullName,
          rating: score,
          body: (body || '').trim() || null
        },
        { onConflict: 'author_id,subject_id' }
      )
      .select()
      .single();

    if (error) {
      if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
        throw new Error('NOT_MET_YET');
      }
      throw error;
    }
    return this._toReview(data);
  }

  async deleteMyReview(subjectId) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');

    const { error } = await db
      .from('reviews')
      .delete()
      .eq('subject_id', subjectId)
      .eq('author_id', user.id);

    if (error) throw error;
    return true;
  }

  _toReview(row) {
    return {
      id: row.id,
      subjectId: row.subject_id,
      authorId: row.author_id,
      authorName: row.author_name,
      rating: Number(row.rating),
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /* ======================================================================
     CAMPUS SETTINGS
     Read-only from the app. Which domains count as student addresses is set
     from the SQL editor, and the rule is applied by the sign-up trigger.
     ====================================================================== */

  async fetchCampusSettings() {
    if (!this.client) return null;
    const { data, error } = await this.client
      .from('campus_settings')
      .select('campus_name, email_domains')
      .maybeSingle();

    if (error) {
      console.warn('Could not read campus settings:', error.message);
      return null;
    }
    return data
      ? { campusName: data.campus_name, emailDomains: data.email_domains || [] }
      : null;
  }

  /* ======================================================================
     IMAGES
     ====================================================================== */

  /**
   * Upload a photo and return its public URL. Files live under a folder named
   * after the user id, which is the only place storage policy lets them write.
   */
  async uploadImage(blob, kind = 'item') {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');

    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await db.storage
      .from(this.bucket)
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });

    if (error) throw error;

    const { data } = db.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  /** Best-effort cleanup when a listing is deleted or its photo replaced. */
  async removeImage(publicUrl) {
    if (!this.client || !publicUrl) return;
    const marker = `/${this.bucket}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0]);
    try {
      await this.client.storage.from(this.bucket).remove([path]);
    } catch (err) {
      console.warn('Could not remove stored image:', err);
    }
  }

  /* ======================================================================
     LISTINGS
     ====================================================================== */

  async fetchItems(filters = {}) {
    const db = this._require();
    const pageSize = filters.pageSize || window.PRConfig.PAGE_SIZE;
    const page = filters.page || 0;

    let query = db.from('items').select('*');

    if (filters.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }
    if (filters.listingType && filters.listingType !== 'all') {
      query = query.eq('listing_type', filters.listingType);
    }
    if (filters.urgentOnly) {
      query = query.eq('is_urgent', true);
    }
    if (filters.conditions && filters.conditions.length) {
      query = query.in('condition', filters.conditions);
    }
    if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)) {
      query = query.lte('price', filters.maxPrice);
    }
    if (typeof filters.minPrice === 'number' && Number.isFinite(filters.minPrice)) {
      query = query.gte('price', filters.minPrice);
    }
    if (filters.location && filters.location !== 'all' && filters.location !== 'detect_gps') {
      query = query.ilike('location', `%${filters.location}%`);
    }
    if (filters.sellerId) {
      query = query.eq('user_id', filters.sellerId);
    }
    if (filters.search) {
      const q = filters.search.replace(/[%,()]/g, ' ').trim();
      if (q) {
        // barter_want is searched too: on a swap listing it is the half that
        // says what the deal actually is.
        query = query.or(
          `title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%,barter_want.ilike.%${q}%`
        );
      }
    }

    switch (filters.sort) {
      case 'price_asc':  query = query.order('price', { ascending: true }); break;
      case 'price_desc': query = query.order('price', { ascending: false }); break;
      case 'oldest':     query = query.order('created_at', { ascending: true }); break;
      case 'urgent':
        query = query.order('is_urgent', { ascending: false })
                     .order('created_at', { ascending: false });
        break;
      default:           query = query.order('created_at', { ascending: false });
    }

    query = query.range(page * pageSize, page * pageSize + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;

    const cutoff = Date.now() - window.PRConfig.SOLD_ITEM_LIFETIME_HOURS * 3600 * 1000;
    return (data || [])
      .filter(row => !(row.is_sold && row.sold_at && new Date(row.sold_at).getTime() < cutoff))
      .map(row => this._toItem(row));
  }

  async fetchItemById(id) {
    const db = this._require();
    const { data, error } = await db.from('items').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? this._toItem(data) : null;
  }

  async createItem(itemData) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');

    const listingType = ['sell', 'free', 'barter'].includes(itemData.listingType)
      ? itemData.listingType
      : 'sell';

    const row = {
      user_id: user.id,
      title: itemData.title,
      category: itemData.category,
      listing_type: listingType,
      // A giveaway is priced at zero whatever the form last held, because the
      // database rejects the row otherwise and the check is easy to miss here.
      price: listingType === 'free' ? 0 : (Number.parseFloat(itemData.price) || 0),
      condition: itemData.condition,
      location: itemData.location,
      pickup_spot: itemData.pickupSpot || null,
      barter_want: listingType === 'barter' ? (itemData.barterWant || null) : null,
      is_urgent: Boolean(itemData.isUrgent),
      description: itemData.description || null,
      image_url: itemData.imageUrl || null,
      image_urls: itemData.imageUrls || (itemData.imageUrl ? [itemData.imageUrl] : []),
      payment_qr_url: itemData.paymentQrUrl || null,
      seller_name: itemData.sellerName,
      seller_phone: itemData.sellerPhone || null,
      seller_whatsapp: itemData.sellerWhatsapp || null,
      seller_instagram: itemData.sellerInstagram || null,
      seller_upi_vpa: itemData.sellerUpiVpa || null,
      is_sold: false
    };

    const { data, error } = await db.from('items').insert([row]).select().single();
    if (error) throw this._postingError(error);
    return this._toItem(data);
  }

  /** Edit a listing. RLS rejects this unless the caller owns the row. */
  async updateItem(id, patch) {
    const db = this._require();
    const row = {};
    if (patch.title !== undefined)          row.title = patch.title;
    if (patch.category !== undefined)       row.category = patch.category;
    if (patch.condition !== undefined)      row.condition = patch.condition;
    if (patch.location !== undefined)       row.location = patch.location;
    if (patch.pickupSpot !== undefined)     row.pickup_spot = patch.pickupSpot || null;
    if (patch.isUrgent !== undefined)       row.is_urgent = Boolean(patch.isUrgent);
    if (patch.description !== undefined)    row.description = patch.description || null;
    if (patch.imageUrl !== undefined)       row.image_url = patch.imageUrl;
    if (patch.imageUrls !== undefined)      row.image_urls = patch.imageUrls || [];
    if (patch.paymentQrUrl !== undefined)   row.payment_qr_url = patch.paymentQrUrl;

    // Mode, price and the exchange line move together: switching to a
    // giveaway has to zero the price in the same statement, or the row fails
    // its own check constraint half way through the change.
    if (patch.listingType !== undefined) {
      row.listing_type = ['sell', 'free', 'barter'].includes(patch.listingType) ? patch.listingType : 'sell';
      row.barter_want = row.listing_type === 'barter' ? (patch.barterWant || null) : null;
      row.price = row.listing_type === 'free' ? 0 : (Number.parseFloat(patch.price) || 0);
    } else if (patch.price !== undefined) {
      row.price = Number.parseFloat(patch.price) || 0;
    }
    if (patch.sellerName !== undefined)     row.seller_name = patch.sellerName;
    if (patch.sellerPhone !== undefined)    row.seller_phone = patch.sellerPhone || null;
    if (patch.sellerWhatsapp !== undefined) row.seller_whatsapp = patch.sellerWhatsapp || null;
    if (patch.sellerInstagram !== undefined) row.seller_instagram = patch.sellerInstagram || null;
    if (patch.sellerUpiVpa !== undefined)    row.seller_upi_vpa = patch.sellerUpiVpa || null;

    const { data, error } = await db.from('items').update(row).eq('id', id).select().single();
    if (error) throw this._ownershipError(error);
    return this._toItem(data);
  }

  async markItemAsSold(id) {
    const db = this._require();
    const { data, error } = await db
      .from('items')
      .update({ is_sold: true, sold_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw this._ownershipError(error);
    return this._toItem(data);
  }

  async relistItem(id) {
    const db = this._require();
    const { data, error } = await db
      .from('items')
      .update({ is_sold: false, sold_at: null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw this._ownershipError(error);
    return this._toItem(data);
  }

  /**
   * Delete a listing. Unlike the previous version this checks the row count,
   * so a delete refused by policy raises instead of reporting success.
   */
  async deleteItem(id) {
    const db = this._require();
    const existing = await this.fetchItemById(id).catch(() => null);

    const { data, error } = await db.from('items').delete().eq('id', id).select();
    if (error) throw this._ownershipError(error);
    if (!data || data.length === 0) throw new Error('NOT_YOUR_LISTING');

    if (existing) {
      // The whole gallery, not just the cover - otherwise every deleted
      // listing leaves its other photos behind in the bucket forever.
      for (const url of existing.imageUrls || []) {
        await this.removeImage(url);
      }
      await this.removeImage(existing.paymentQrUrl);
    }
    return true;
  }

  /** Ask the database to clear sold listings past their 5-hour window. */
  async purgeExpiredSoldItems() {
    if (!this.client) return 0;
    const { data, error } = await this.client.rpc('purge_expired_sold_items');
    if (error) {
      console.warn('Purge could not run:', error.message);
      return 0;
    }
    return data || 0;
  }

  _ownershipError(error) {
    if (error && (error.code === 'PGRST116' || error.code === '42501')) {
      return new Error('NOT_YOUR_LISTING');
    }
    return error;
  }

  /**
   * An insert refused by policy is nearly always the verification rule, and
   * "new row violates row-level security policy" tells a student nothing they
   * can act on. Name it, so the app can explain what to do about it.
   */
  _postingError(error) {
    if (error && (error.code === '42501' || /row-level security/i.test(error.message || ''))) {
      return new Error('NOT_VERIFIED');
    }
    return error;
  }

  _toItem(row) {
    // Older rows predate the gallery column and only carry a cover.
    const gallery = (row.image_urls && row.image_urls.length)
      ? row.image_urls
      : (row.image_url ? [row.image_url] : []);

    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      category: row.category,
      listingType: row.listing_type || 'sell',
      price: Number(row.price),
      condition: row.condition,
      location: row.location,
      pickupSpot: row.pickup_spot || '',
      barterWant: row.barter_want || '',
      isUrgent: Boolean(row.is_urgent),
      description: row.description,
      imageUrl: row.image_url || gallery[0] || null,
      imageUrls: gallery,
      paymentQrUrl: row.payment_qr_url,
      sellerName: row.seller_name,
      sellerPhone: row.seller_phone,
      sellerWhatsapp: row.seller_whatsapp,
      sellerInstagram: row.seller_instagram,
      sellerUpiVpa: row.seller_upi_vpa,
      isSold: Boolean(row.is_sold),
      soldAt: row.sold_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /* ======================================================================
     MESSAGES
     ====================================================================== */

  async fetchMessages(channelType, channelId) {
    const db = this._require();
    const { data, error } = await db
      .from('messages')
      .select('*')
      .eq('channel_type', channelType)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return (data || []).map(row => this._toMessage(row));
  }

  async sendMessage(channelType, channelId, body) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');

    const text = (body || '').trim();
    if (!text) throw new Error('EMPTY_MESSAGE');
    if (text.length > 2000) throw new Error('MESSAGE_TOO_LONG');

    const { data, error } = await db
      .from('messages')
      .insert([{
        channel_type: channelType,
        channel_id: channelId,
        sender_id: user.id,
        sender_name: user.fullName,
        body: text
      }])
      .select()
      .single();

    if (error) throw error;
    return this._toMessage(data);
  }

  /**
   * Live updates for one conversation. Returns an unsubscribe function.
   * This is what makes the chat actually live rather than a snapshot.
   */
  subscribeToMessages(channelType, channelId, onMessage) {
    if (!this.client) return () => {};
    const name = `messages:${channelType}:${channelId}`;
    const channel = this.client
      .channel(name)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`
        },
        payload => {
          if (payload.new && payload.new.channel_type === channelType) {
            onMessage(this._toMessage(payload.new));
          }
        }
      )
      .subscribe();

    return () => {
      try { this.client.removeChannel(channel); } catch (e) { /* already gone */ }
    };
  }

  /** Every conversation the signed-in user is part of, newest first. */
  async fetchInbox() {
    const db = this._require();
    const { data, error } = await db
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;

    const threads = new Map();
    for (const row of data || []) {
      const key = `${row.channel_type}:${row.channel_id}`;
      if (!threads.has(key)) threads.set(key, this._toMessage(row));
    }
    return Array.from(threads.values());
  }

  _toMessage(row) {
    return {
      id: row.id,
      channelType: row.channel_type,
      channelId: row.channel_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      body: row.body,
      createdAt: row.created_at
    };
  }

  /* ======================================================================
     PAYMENTS

     The app moves no money. A buyer pays the seller over UPI and records the
     reference here so both sides hold the same account of what was claimed.
     Nothing in this file verifies a transaction - only a gateway could - so
     the seller settles it against their own bank app.
     ====================================================================== */

  /** File a payment claim against a listing. */
  async createPayment({ itemId, sellerId, amount, itemTitle, utr }) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');
    if (user.id === sellerId) throw new Error('CANNOT_PAY_YOURSELF');

    const { data, error } = await db
      .from('payments')
      .insert([{
        item_id: itemId,
        // Snapshotted: the listing is purged five hours after it sells, and
        // the record of what was paid for has to outlive it.
        item_title: itemTitle,
        amount: Number(amount) || 0,
        buyer_id: user.id,
        seller_id: sellerId,
        utr
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new Error('UTR_ALREADY_SUBMITTED');
      if (error.code === '42501') throw new Error('PAYMENT_NOT_ALLOWED');
      throw error;
    }
    return this._toPayment(data);
  }

  /** Every payment the signed-in user is a party to, either side. */
  async fetchPayments() {
    const db = this._require();
    const { data, error } = await db
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []).map(row => this._toPayment(row));
  }

  /** What this buyer has already filed against one listing. */
  async fetchMyPaymentForItem(itemId) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) return null;

    const { data, error } = await db
      .from('payments')
      .select('*')
      .eq('item_id', itemId)
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data && data.length ? this._toPayment(data[0]) : null;
  }

  /**
   * Settle a claim. RLS allows this only to the seller, and a trigger keeps
   * everything except the status and the note frozen - otherwise the update
   * policy would also let a seller rewrite the amount after the fact.
   */
  async settlePayment(id, status, note) {
    const db = this._require();
    if (!['received', 'rejected'].includes(status)) throw new Error('BAD_PAYMENT_STATUS');

    const { data, error } = await db
      .from('payments')
      .update({ status, seller_note: note || null })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42501') throw new Error('NOT_YOUR_PAYMENT');
      throw error;
    }
    return this._toPayment(data);
  }

  _toPayment(row) {
    return {
      id: row.id,
      itemId: row.item_id,
      itemTitle: row.item_title,
      amount: Number(row.amount),
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      utr: row.utr,
      status: row.status,
      sellerNote: row.seller_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /* ======================================================================
     REPORTS
     ====================================================================== */

  async reportItem(itemId, reason) {
    const db = this._require();
    const user = await this.getCurrentUser();
    if (!user) throw new Error('NOT_SIGNED_IN');

    const { error } = await db
      .from('reports')
      .insert([{ item_id: itemId, reporter_id: user.id, reason: reason.trim() }]);

    if (error) {
      if (error.code === '23505') throw new Error('ALREADY_REPORTED');
      throw error;
    }
    return true;
  }
}

window.supabaseAPI = new SupabaseMarketplaceClient();
