/**
 * PR MARKETPLACE - SUPABASE REALTIME DATABASE CLIENT & INTEGRATION MODULE
 * Connects the web application directly to your Supabase PostgreSQL cloud database.
 */

// Supabase Configuration Credentials (stored in LocalStorage or defaults)
const SUPABASE_CONFIG = {
  get URL() {
    return localStorage.getItem('pr_supabase_url') || 'https://pjvxssxcmdvchelglnzr.supabase.co';
  },
  get ANON_KEY() {
    return localStorage.getItem('pr_supabase_key') || 'sb_publishable_gWK3Y6uOIq7sRreua8z16Q_dTvB-Nls';
  },
  setCredentials(url, key) {
    if (url) localStorage.setItem('pr_supabase_url', url.trim());
    if (key) localStorage.setItem('pr_supabase_key', key.trim());
  },
  isConfigured() {
    const u = this.URL;
    const k = this.ANON_KEY;
    return Boolean(u && k && u.startsWith('http') && k.length > 20);
  }
};

class SupabaseMarketplaceClient {
  constructor() {
    this.client = null;
    this.initClient();
  }

  initClient() {
    if (window.supabase && SUPABASE_CONFIG.isConfigured()) {
      try {
        this.client = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
        console.log('⚡ Supabase Client initialized successfully!');
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  /**
   * FETCH ITEMS FROM SUPABASE DATABASE
   */
  async fetchItems(filters = {}) {
    if (!this.client) throw new Error('Supabase client not initialized');

    let query = this.client.from('items').select('*');

    // Filter by Category
    if (filters.category && filters.category !== 'all') {
      query = query.eq('category', filters.category);
    }

    // Filter by Max Price
    if (filters.maxPrice !== undefined) {
      query = query.lte('price', filters.maxPrice);
    }

    // Sort by creation date descending
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    // AUTO-PURGE EXPIRED SOLD ITEMS FROM SUPABASE DATABASE (Auto-delete after 5 hours)
    const AUTO_DELETE_HOURS = 5;
    const now = Date.now();
    for (const row of data || []) {
      if (row.is_sold && row.sold_at) {
        const hrs = (now - new Date(row.sold_at).getTime()) / (1000 * 60 * 60);
        if (hrs >= AUTO_DELETE_HOURS) {
          this.client.from('items').delete().eq('id', row.id).then(() => {
            console.log(`🗑️ Auto-deleted expired sold item ${row.id} from Supabase Cloud DB`);
          });
        }
      }
    }

    // Convert snake_case from Postgres to camelCase for frontend & filter expired items
    let items = (data || [])
      .filter(row => {
        if (row.is_sold && row.sold_at) {
          const hrs = (now - new Date(row.sold_at).getTime()) / (1000 * 60 * 60);
          return hrs < AUTO_DELETE_HOURS;
        }
        return true;
      })
      .map(row => ({
        id: row.id,
        title: row.title,
        category: row.category,
        price: Number(row.price),
        condition: row.condition,
        location: row.location,
        description: row.description,
        imageUrl: row.image_url,
        paymentQrUrl: row.payment_qr_url,
        sellerName: row.seller_name,
        sellerWhatsapp: row.seller_whatsapp,
        sellerInstagram: row.seller_instagram,
        sellerPhone: row.seller_phone,
        userId: row.user_id || null,
        isSold: Boolean(row.is_sold),
        soldAt: row.sold_at,
      }));

    // STRICT PURGE: Filter out all fake mock sample listings (item-101 to item-111, 555- numbers) except 'sjwvaisb'
    const FAKE_MOCK_IDS = ['item-101', 'item-102', 'item-103', 'item-104', 'item-105', 'item-106', 'item-107', 'item-108', 'item-109', 'item-110', 'item-111'];
    items = items.filter(i => {
      const isSjwvaisb = (i.title && i.title.toLowerCase().includes('sjwvaisb')) || String(i.id).includes('sjwvaisb');
      if (isSjwvaisb) return true;
      if (FAKE_MOCK_IDS.includes(String(i.id))) return false;
      if (i.sellerPhone && i.sellerPhone.startsWith('555-')) return false;
      if (i.sellerWhatsapp && i.sellerWhatsapp.includes('55501')) return false;
      return true;
    });

    // Local Search Filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(i => 
        i.title.toLowerCase().includes(q) || 
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.location && i.location.toLowerCase().includes(q))
      );
    }

    // Local Condition Filter
    if (filters.conditions && filters.conditions.length > 0) {
      items = items.filter(i => filters.conditions.includes(i.condition));
    }

    return items;
  }

  /**
   * POST / INSERT NEW ITEM TO SUPABASE
   */
  async createItem(itemData) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const isValidUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const safeUserId = (itemData.userId && isValidUUID(itemData.userId)) ? itemData.userId : null;

    const dbRow = {
      id: 'item-' + Date.now(),
      title: itemData.title,
      category: itemData.category,
      price: parseFloat(itemData.price) || 0,
      condition: itemData.condition,
      location: itemData.location,
      description: itemData.description || '',
      image_url: itemData.imageUrl || null,
      payment_qr_url: itemData.paymentQrUrl || null,
      seller_name: itemData.sellerName,
      seller_whatsapp: itemData.sellerWhatsapp || itemData.sellerPhone || '',
      seller_instagram: itemData.sellerInstagram || null,
      seller_phone: itemData.sellerPhone || null,
      user_id: safeUserId,
      is_sold: false,
      created_at: new Date().toISOString()
    };

    let row = null;
    try {
      const { data, error } = await this.client.from('items').insert([dbRow]).select();
      if (error) {
        console.warn('⚡ Initial Supabase insert error, trying safe schema fallback:', error);
        const safeRow = {
          id: dbRow.id,
          title: dbRow.title,
          category: dbRow.category,
          price: dbRow.price,
          condition: dbRow.condition,
          location: dbRow.location,
          description: dbRow.description,
          image_url: dbRow.image_url,
          seller_name: dbRow.seller_name,
          seller_whatsapp: dbRow.seller_whatsapp,
          is_sold: false,
          created_at: dbRow.created_at
        };
        const res2 = await this.client.from('items').insert([safeRow]).select();
        if (res2.error) throw res2.error;
        row = res2.data[0];
      } else {
        row = data[0];
      }
    } catch (err) {
      console.warn('⚡ Supabase cloud insertion caught:', err);
      return {
        id: dbRow.id,
        title: dbRow.title,
        category: dbRow.category,
        price: dbRow.price,
        condition: dbRow.condition,
        location: dbRow.location,
        description: dbRow.description,
        imageUrl: dbRow.image_url,
        paymentQrUrl: dbRow.payment_qr_url,
        sellerName: dbRow.seller_name,
        sellerWhatsapp: dbRow.seller_whatsapp,
        sellerInstagram: dbRow.seller_instagram,
        sellerPhone: dbRow.seller_phone,
        userId: dbRow.user_id,
        isSold: false,
        createdAt: dbRow.created_at
      };
    }

    return {
      id: row.id,
      title: row.title,
      category: row.category,
      price: Number(row.price),
      condition: row.condition,
      location: row.location,
      description: row.description,
      imageUrl: row.image_url,
      paymentQrUrl: row.payment_qr_url || dbRow.payment_qr_url,
      sellerName: row.seller_name,
      sellerWhatsapp: row.seller_whatsapp,
      sellerInstagram: row.seller_instagram,
      sellerPhone: row.seller_phone,
      userId: row.user_id || null,
      isSold: row.is_sold,
      createdAt: row.created_at
    };
  }

  /**
   * MARK ITEM AS SOLD IN SUPABASE
   */
  async markItemAsSold(itemId) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const timestamp = new Date().toISOString();
    const { data, error } = await this.client
      .from('items')
      .update({ is_sold: true, sold_at: timestamp })
      .eq('id', itemId)
      .select();

    if (error) throw error;
    return data[0];
  }

  /**
   * DELETE ITEM FROM SUPABASE DATABASE
   */
  async deleteItem(itemId) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const { data, error } = await this.client
      .from('items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
    console.log(`🗑️ Item ${itemId} successfully deleted from Supabase Cloud DB!`);
    return true;
  }

  /**
   * FETCH MESSAGES FOR AN ITEM FROM SUPABASE
   */
  async fetchMessages(itemId) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      itemId: row.item_id,
      senderName: row.sender_name,
      senderRole: row.sender_role,
      text: row.text,
      createdAt: row.created_at
    }));
  }

  /**
   * SEND MESSAGE TO SUPABASE
   */
  async sendMessage(itemId, messageData) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const dbRow = {
      id: 'msg-' + Date.now(),
      item_id: itemId,
      sender_name: messageData.senderName || 'Buyer',
      sender_role: messageData.senderRole || 'buyer',
      text: messageData.text,
      created_at: new Date().toISOString()
    };

    const { data, error } = await this.client
      .from('messages')
      .insert([dbRow])
      .select();

    if (error) throw error;
    return data[0];
  }

  /**
   * AUTHENTICATION: CHECK DUPLICATE USER (EMAIL OR PHONE)
   */
  async checkUserDuplicate(email, phone) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const { data: existingEmail } = await this.client
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingEmail) return 'email';

    const { data: existingPhone } = await this.client
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existingPhone) return 'phone';

    return null;
  }

  /**
   * AUTHENTICATION: SIGN UP (REGISTER NEW USER IN SUPABASE)
   */
  async signUpUser(userData) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const cleanEmail = userData.email.trim().toLowerCase();
    const cleanPhone = userData.phone.trim();

    const duplicateType = await this.checkUserDuplicate(cleanEmail, cleanPhone);
    if (duplicateType) {
      throw new Error(`DUPLICATE_${duplicateType.toUpperCase()}`);
    }

    const newUser = {
      id: 'user-' + Date.now(),
      full_name: userData.fullName,
      email: cleanEmail,
      phone: cleanPhone,
      password_hash: userData.password,
      password: userData.password,
      created_at: new Date().toISOString()
    };

    let data = null;
    let error = null;
    try {
      const res = await this.client.from('users').insert([newUser]).select();
      data = res.data;
      error = res.error;
      if (error) {
        // Fallback for tables without password column
        const safeUser = {
          id: newUser.id,
          full_name: newUser.full_name,
          email: newUser.email,
          phone: newUser.phone,
          password_hash: newUser.password_hash,
          created_at: newUser.created_at
        };
        const res2 = await this.client.from('users').insert([safeUser]).select();
        data = res2.data;
        error = res2.error;
      }
    } catch (err) {
      console.warn('⚡ Supabase user insertion error:', err);
      throw err;
    }

    if (error || !data || data.length === 0) {
      throw error || new Error('SIGNUP_FAILED');
    }

    const row = data[0];
    return {
      id: row.id,
      fullName: row.full_name || userData.fullName,
      email: row.email || cleanEmail,
      phone: row.phone || cleanPhone,
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  /**
   * AUTHENTICATION: LOG IN USER FROM SUPABASE
   */
  async logInUser(emailOrPhone, password) {
    if (!this.client) throw new Error('Supabase client not initialized');

    const cleanInput = emailOrPhone.trim().toLowerCase();
    const phoneDigits = cleanInput.replace(/[^\d]/g, '');

    let query = this.client.from('users').select('*');
    if (phoneDigits.length >= 10 && !cleanInput.includes('@')) {
      query = query.eq('phone', phoneDigits);
    } else {
      query = query.eq('email', cleanInput);
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      throw new Error('GMAIL_NOT_FOUND');
    }

    const storedPassword = data.password_hash || data.password;
    if (storedPassword && storedPassword !== password) {
      throw new Error('GMAIL_PASSWORD_MISMATCH');
    }

    return {
      id: data.id,
      fullName: data.full_name,
      email: data.email,
      phone: data.phone,
      createdAt: data.created_at
    };
  }
}

// Global Supabase API instance
window.supabaseAPI = new SupabaseMarketplaceClient();
