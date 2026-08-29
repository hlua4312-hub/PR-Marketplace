/**
 * PR MARKETPLACE - SUPABASE DATA LAYER
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
  'Could not reach the database. Check your connection, or set your Supabase project under Account > Database Connection.';

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
      this.client = window.supabase.createClient(cfg.url, cfg.anonToken, {
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

  /** Re-create the client after the user points the app at a different project. */
  reconnect() {
    this.client = null;
    this.initClient();
    return this.isReady();
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

  /** Send a password-reset email. Always resolves, so we never reveal whether an address is registered. */
  async requestPasswordReset(email) {
    const db = this._require();
    const redirectTo = window.location.origin + window.location.pathname;
    await db.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    return true;
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
        query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`);
      }
    }

    switch (filters.sort) {
      case 'price_asc':  query = query.order('price', { ascending: true }); break;
      case 'price_desc': query = query.order('price', { ascending: false }); break;
      case 'oldest':     query = query.order('created_at', { ascending: true }); break;
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

    const row = {
      user_id: user.id,
      title: itemData.title,
      category: itemData.category,
      price: Number.parseFloat(itemData.price) || 0,
      condition: itemData.condition,
      location: itemData.location,
      description: itemData.description || null,
      image_url: itemData.imageUrl || null,
      payment_qr_url: itemData.paymentQrUrl || null,
      seller_name: itemData.sellerName,
      seller_phone: itemData.sellerPhone || null,
      seller_whatsapp: itemData.sellerWhatsapp || null,
      seller_instagram: itemData.sellerInstagram || null,
      is_sold: false
    };

    const { data, error } = await db.from('items').insert([row]).select().single();
    if (error) throw error;
    return this._toItem(data);
  }

  /** Edit a listing. RLS rejects this unless the caller owns the row. */
  async updateItem(id, patch) {
    const db = this._require();
    const row = {};
    if (patch.title !== undefined)          row.title = patch.title;
    if (patch.category !== undefined)       row.category = patch.category;
    if (patch.price !== undefined)          row.price = Number.parseFloat(patch.price) || 0;
    if (patch.condition !== undefined)      row.condition = patch.condition;
    if (patch.location !== undefined)       row.location = patch.location;
    if (patch.description !== undefined)    row.description = patch.description || null;
    if (patch.imageUrl !== undefined)       row.image_url = patch.imageUrl;
    if (patch.paymentQrUrl !== undefined)   row.payment_qr_url = patch.paymentQrUrl;
    if (patch.sellerName !== undefined)     row.seller_name = patch.sellerName;
    if (patch.sellerPhone !== undefined)    row.seller_phone = patch.sellerPhone || null;
    if (patch.sellerWhatsapp !== undefined) row.seller_whatsapp = patch.sellerWhatsapp || null;
    if (patch.sellerInstagram !== undefined) row.seller_instagram = patch.sellerInstagram || null;

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
      await this.removeImage(existing.imageUrl);
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

  _toItem(row) {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      category: row.category,
      price: Number(row.price),
      condition: row.condition,
      location: row.location,
      description: row.description,
      imageUrl: row.image_url,
      paymentQrUrl: row.payment_qr_url,
      sellerName: row.seller_name,
      sellerPhone: row.seller_phone,
      sellerWhatsapp: row.seller_whatsapp,
      sellerInstagram: row.seller_instagram,
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
