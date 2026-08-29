/**
 * PR MARKETPLACE - DATABASE SERVICE & API LAYER
 * 
 * Built for zero-cost P2P direct trading. Uses browser LocalStorage by default,
 * and includes a pluggable configuration layer ready to toggle connection to 
 * real database backends (Node.js/Express, Firebase, Supabase, or MongoDB).
 */

// Initial Seed Data (Empty catalog as requested)
const INITIAL_SAMPLE_ITEMS = [];

class MarketplaceAPI {
  constructor() {
    this.storageKey = 'pr_marketplace_items_v13_empty';
    this.favKey = 'pr_marketplace_favorites_v13';
    this.myItemsKey = 'pr_marketplace_my_items_v13';
    this.chatStorageKey = 'pr_marketplace_chats_v1';
    this.usersKey = 'pr_marketplace_users_v1';
    this.currentUserKey = 'pr_marketplace_active_user_v1';
    this.savedAccountsKey = 'pr_marketplace_remembered_accounts_v1';
    this._initLocalStorage();
  }

  /**
   * MULTI-ACCOUNT REMEMBER ME DEVICE REGISTRY
   */
  getSavedDeviceAccounts() {
    return JSON.parse(localStorage.getItem(this.savedAccountsKey)) || [];
  }

  saveAccountToDevice(accountData) {
    if (!accountData || !accountData.email || !accountData.password) return;
    const accounts = this.getSavedDeviceAccounts();
    const cleanEmail = accountData.email.toLowerCase().trim();
    const existingIdx = accounts.findIndex(a => a.email.toLowerCase() === cleanEmail);

    const record = {
      fullName: accountData.fullName || cleanEmail.split('@')[0],
      email: cleanEmail,
      phone: accountData.phone || '',
      password: accountData.password,
      savedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      accounts[existingIdx] = record;
    } else {
      accounts.push(record);
    }

    localStorage.setItem(this.savedAccountsKey, JSON.stringify(accounts));
  }

  removeAccountFromDevice(emailOrPhone) {
    let accounts = this.getSavedDeviceAccounts();
    const clean = emailOrPhone.trim().toLowerCase();
    accounts = accounts.filter(a => a.email.toLowerCase() !== clean && a.phone !== clean);
    localStorage.setItem(this.savedAccountsKey, JSON.stringify(accounts));
  }

  /**
   * Initializes local storage (Empty catalog)
   */
  _initLocalStorage() {
    try {
      localStorage.removeItem('pr_user_permanent_posts');
      localStorage.removeItem('pr_marketplace_items_v12_clean');
      localStorage.removeItem('pr_marketplace_items_v10');
      localStorage.removeItem('pr_marketplace_items_v1');
    } catch (e) {}

    const existing = localStorage.getItem(this.storageKey);
    let items = existing ? JSON.parse(existing) : [];

    const fakeIds = ['item-101', 'item-102', 'item-103', 'item-104', 'item-105', 'item-106', 'item-107', 'item-108', 'item-109', 'item-110', 'item-111', 'item-sjwvaisb'];
    items = items.filter(i => {
      if (!i) return false;
      if (fakeIds.includes(String(i.id))) return false;
      if (i.title && i.title.toLowerCase().includes('sjwvaisb')) return false;
      if (i.sellerPhone && i.sellerPhone.startsWith('555-')) return false;
      return true;
    });

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch (e) {}

    if (!localStorage.getItem(this.favKey)) {
      localStorage.setItem(this.favKey, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.myItemsKey)) {
      localStorage.setItem(this.myItemsKey, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.chatStorageKey)) {
      localStorage.setItem(this.chatStorageKey, JSON.stringify({}));
    }
    if (!localStorage.getItem(this.usersKey)) {
      localStorage.setItem(this.usersKey, JSON.stringify([]));
    }
  }

  /**
   * USER ITEM OWNERSHIP HELPERS
   */
  getMyPostedItemIds() {
    return JSON.parse(localStorage.getItem(this.myItemsKey)) || [];
  }

  trackMyPostedItem(itemId) {
    const myItems = this.getMyPostedItemIds();
    if (!myItems.includes(itemId)) {
      myItems.push(itemId);
      localStorage.setItem(this.myItemsKey, JSON.stringify(myItems));
    }
  }

  isItemOwnedByCurrentUser(itemId) {
    return this.getMyPostedItemIds().includes(itemId);
  }

  /**
   * GET ALL ITEMS (Supports Category, Search, Price Range, and Condition filters)
   * Merges local device items with cloud database seamlessly!
   */
  async fetchItems(filters = {}) {
    let cloudItems = [];
    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        cloudItems = await window.supabaseAPI.fetchItems(filters);
      } catch (err) {
        console.warn('⚡ Supabase fetch error, falling back to LocalStorage:', err);
      }
    }

    let localItems = JSON.parse(localStorage.getItem(this.storageKey)) || [];
    let myPermanentPosts = JSON.parse(localStorage.getItem('pr_user_permanent_posts')) || [];

    // AUTO-PURGE EXPIRED SOLD ITEMS ONLY (Unsold items are NEVER deleted and remain permanently)
    const AUTO_DELETE_HOURS = 5;
    const now = Date.now();
    
    localItems = localItems.filter(item => {
      if (item.isSold && item.soldAt) {
        const hoursSinceSold = (now - new Date(item.soldAt).getTime()) / (1000 * 60 * 60);
        return hoursSinceSold < AUTO_DELETE_HOURS;
      }
      return true;
    });

    myPermanentPosts = myPermanentPosts.filter(item => {
      if (item.isSold && item.soldAt) {
        const hoursSinceSold = (now - new Date(item.soldAt).getTime()) / (1000 * 60 * 60);
        return hoursSinceSold < AUTO_DELETE_HOURS;
      }
      return true;
    });

    // Merge cloudItems with localItems and user permanent posts
    const combinedMap = new Map();
    // 1. Add all items from cloud database
    cloudItems.forEach(item => {
      if (item && item.id) combinedMap.set(String(item.id), item);
    });
    // 2. Add all items from local device
    localItems.forEach(item => {
      if (item && item.id) combinedMap.set(String(item.id), item);
    });
    // 3. Add all user permanent posts (guarantees user's posted items NEVER vanish on app exit)
    myPermanentPosts.forEach(item => {
      if (item && item.id) combinedMap.set(String(item.id), item);
    });

    let items = Array.from(combinedMap.values());

    // Update local storage so that all cloud items and local items are kept permanently synced
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
      localStorage.setItem('pr_user_permanent_posts', JSON.stringify(myPermanentPosts));
    } catch (e) {}

    // Filter by Category
    if (filters.category && filters.category !== 'all') {
      items = items.filter(i => i.category.toLowerCase() === filters.category.toLowerCase());
    }

    // Filter by Location
    if (filters.location && filters.location !== 'all' && filters.location !== 'detect_gps') {
      const locFilter = filters.location.toLowerCase().trim();
      items = items.filter(i => {
        const itemLoc = (i.location || '').toLowerCase();
        return itemLoc.includes(locFilter) || locFilter.includes(itemLoc) || (locFilter.includes('aizawl') && itemLoc.includes('aizawl'));
      });
    }

    // Filter by Search Query
    if (filters.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(i => 
        i.title.toLowerCase().includes(q) || 
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.location && i.location.toLowerCase().includes(q))
      );
    }

    // Filter by Condition
    if (filters.conditions && filters.conditions.length > 0) {
      items = items.filter(i => filters.conditions.includes(i.condition));
    }

    // Filter by Max Price
    if (filters.maxPrice !== undefined) {
      items = items.filter(i => Number(i.price) <= Number(filters.maxPrice));
    }

    // Sort by newest first
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return items;
  }

  /**
   * MARK ITEM AS SOLD (Triggers 5h Auto-Deletion Schedule)
   */
  async markItemAsSold(id) {
    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        await window.supabaseAPI.markItemAsSold(id);
      } catch (err) {
        console.warn('⚡ Supabase mark sold error:', err);
      }
    }

    const items = JSON.parse(localStorage.getItem(this.storageKey)) || [];
    const item = items.find(i => i.id === id);
    if (item) {
      item.isSold = true;
      item.soldAt = new Date().toISOString();
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    }
    return item;
  }

  /**
   * DELETE ITEM (Deletes automatically from Supabase Cloud DB & LocalStorage)
   */
  async deleteItem(id) {
    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        await window.supabaseAPI.deleteItem(id);
      } catch (err) {
        console.warn('⚡ Supabase delete item error:', err);
      }
    }

    let items = JSON.parse(localStorage.getItem(this.storageKey)) || [];
    items = items.filter(i => String(i.id) !== String(id));
    localStorage.setItem(this.storageKey, JSON.stringify(items));

    let myPermanentPosts = JSON.parse(localStorage.getItem('pr_user_permanent_posts')) || [];
    myPermanentPosts = myPermanentPosts.filter(i => String(i.id) !== String(id));
    localStorage.setItem('pr_user_permanent_posts', JSON.stringify(myPermanentPosts));

    return true;
  }

  /**
   * GET SINGLE ITEM BY ID
   */
  async fetchItemById(id) {
    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        const item = await window.supabaseAPI.fetchItemById(id);
        if (item) return item;
      } catch (err) {
        console.warn('⚡ Supabase fetch single item error:', err);
      }
    }

    const items = JSON.parse(localStorage.getItem(this.storageKey)) || INITIAL_SAMPLE_ITEMS;
    const found = items.find(i => String(i.id) === String(id)) || INITIAL_SAMPLE_ITEMS.find(i => String(i.id) === String(id));
    return found || null;
  }

  /**
   * CREATE NEW LISTING / POST AD (Permanently saved to Supabase DB & Local Device Storage)
   */
  async createItem(itemData) {
    let createdItem = null;

    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        createdItem = await window.supabaseAPI.createItem(itemData);
        console.log('⚡ Successfully stored item in Supabase Database:', createdItem.id);
      } catch (err) {
        console.warn('⚡ Supabase create error, continuing with local storage:', err);
      }
    }

    const newItem = createdItem || {
      id: 'item-' + Date.now(),
      ...itemData,
      price: parseFloat(itemData.price) || 0,
      createdAt: new Date().toISOString(),
      isSold: false
    };
    
    // Save permanently in local storage and permanent user posts store
    let items = JSON.parse(localStorage.getItem(this.storageKey)) || [];
    items = items.filter(i => String(i.id) !== String(newItem.id));
    items.unshift(newItem);

    let myPermanentPosts = JSON.parse(localStorage.getItem('pr_user_permanent_posts')) || [];
    myPermanentPosts = myPermanentPosts.filter(i => String(i.id) !== String(newItem.id));
    myPermanentPosts.unshift(newItem);
    
    try {
      localStorage.setItem('pr_user_permanent_posts', JSON.stringify(myPermanentPosts));
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch (quotaErr) {
      console.warn('LocalStorage quota handling, keeping top items:', quotaErr);
      localStorage.setItem(this.storageKey, JSON.stringify(items.slice(0, 50)));
      localStorage.setItem('pr_user_permanent_posts', JSON.stringify(myPermanentPosts.slice(0, 50)));
    }

    this.trackMyPostedItem(newItem.id); // Track item ownership for seller
    return newItem;
  }

  /**
   * FAVORITES / SAVED ITEMS MANAGEMENT
   */
  getFavoriteIds() {
    const raw = JSON.parse(localStorage.getItem(this.favKey)) || [];
    return raw.map(String);
  }

  toggleFavorite(itemId) {
    const cleanId = String(itemId);
    let favs = this.getFavoriteIds();
    if (favs.includes(cleanId)) {
      favs = favs.filter(id => id !== cleanId);
    } else {
      favs.push(cleanId);
    }
    localStorage.setItem(this.favKey, JSON.stringify(favs));
    return favs;
  }

  /**
   * IN-APP LIVE CHAT: FETCH MESSAGES FOR AN ITEM
   */
  async fetchMessages(itemId) {
    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        return await window.supabaseAPI.fetchMessages(itemId);
      } catch (err) {
        console.warn('⚡ Supabase fetchMessages error:', err);
      }
    }

    return new Promise((resolve) => {
      const chats = JSON.parse(localStorage.getItem(this.chatStorageKey)) || {};
      const itemMsgs = chats[itemId] || [
        {
          id: 'msg-welcome-' + itemId,
          itemId: itemId,
          senderName: 'System',
          senderRole: 'system',
          text: '💬 Live In-App Chat connected! Send a message below to start chatting directly with the seller.',
          createdAt: new Date().toISOString()
        }
      ];
      resolve(itemMsgs);
    });
  }

  /**
   * IN-APP LIVE CHAT: SEND MESSAGE FOR AN ITEM
   */
  async sendMessage(itemId, messageData) {
    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        await window.supabaseAPI.sendMessage(itemId, messageData);
      } catch (err) {
        console.warn('⚡ Supabase sendMessage error:', err);
      }
    }

    return new Promise((resolve) => {
      const chats = JSON.parse(localStorage.getItem(this.chatStorageKey)) || {};
      if (!chats[itemId]) chats[itemId] = [];

      const newMsg = {
        id: 'msg-' + Date.now(),
        itemId: itemId,
        senderName: messageData.senderName || 'Buyer',
        senderRole: messageData.senderRole || 'buyer',
        text: messageData.text,
        createdAt: new Date().toISOString()
      };

      chats[itemId].push(newMsg);
      localStorage.setItem(this.chatStorageKey, JSON.stringify(chats));
      resolve(newMsg);
    });
  }

  /**
   * AUTHENTICATION API METHODS
   */
  getCurrentUser() {
    return JSON.parse(localStorage.getItem(this.currentUserKey)) || null;
  }

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem(this.currentUserKey, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.currentUserKey);
    }
  }

  logoutUser() {
    localStorage.removeItem(this.currentUserKey);
  }

  async signUpUser(userData) {
    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        const newUser = await window.supabaseAPI.signUpUser(userData);
        this.setCurrentUser(newUser);
        return newUser;
      } catch (err) {
        if (err.message && err.message.startsWith('DUPLICATE_')) {
          throw err;
        }
        console.warn('⚡ Supabase signUpUser error, falling back to LocalStorage:', err);
      }
    }

    const users = JSON.parse(localStorage.getItem(this.usersKey)) || [];

    const existingEmail = users.find(u => u.email.toLowerCase() === userData.email.toLowerCase());
    if (existingEmail) throw new Error('DUPLICATE_EMAIL');

    const existingPhone = users.find(u => u.phone.replace(/[^\d]/g,'') === userData.phone.replace(/[^\d]/g,''));
    if (existingPhone) throw new Error('DUPLICATE_PHONE');

    const newUser = {
      id: 'user-' + Date.now(),
      fullName: userData.fullName,
      email: userData.email,
      phone: userData.phone,
      password: userData.password,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem(this.usersKey, JSON.stringify(users));

    const userSession = {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      phone: newUser.phone,
      createdAt: newUser.createdAt
    };

    this.setCurrentUser(userSession);
    return userSession;
  }

  async logInUser(emailOrPhone, password) {
    if (window.supabaseAPI && window.supabaseAPI.client) {
      try {
        const user = await window.supabaseAPI.logInUser(emailOrPhone, password);
        this.setCurrentUser(user);
        return user;
      } catch (err) {
        if (err.message === 'GMAIL_NOT_FOUND' || err.message === 'GMAIL_PASSWORD_MISMATCH' || err.message === 'USER_NOT_FOUND' || err.message === 'INVALID_PASSWORD') {
          throw err;
        }
        console.warn('⚡ Supabase logInUser error, falling back to LocalStorage:', err);
      }
    }

    const users = JSON.parse(localStorage.getItem(this.usersKey)) || [];
    const cleanInput = emailOrPhone.trim().toLowerCase();
    const phoneDigits = cleanInput.replace(/[^\d]/g, '');

    const user = users.find(u => {
      if (cleanInput.includes('@')) {
        return u.email && u.email.toLowerCase() === cleanInput;
      } else {
        return u.phone && u.phone.replace(/[^\d]/g, '') === phoneDigits;
      }
    });

    if (!user) {
      throw new Error('GMAIL_NOT_FOUND');
    }

    if (user.password !== password) {
      throw new Error('GMAIL_PASSWORD_MISMATCH');
    }

    const userSession = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt
    };

    this.setCurrentUser(userSession);
    return userSession;
  }

  /**
   * RESET MOCK DATABASE TO ORIGINAL SEED DATA
   */
  resetDatabase() {
    localStorage.setItem(this.storageKey, JSON.stringify(INITIAL_SAMPLE_ITEMS));
    localStorage.setItem(this.favKey, JSON.stringify([]));
    localStorage.removeItem(this.chatStorageKey);
    return INITIAL_SAMPLE_ITEMS;
  }
}

// Export global singleton API instance
window.api = new MarketplaceAPI();
