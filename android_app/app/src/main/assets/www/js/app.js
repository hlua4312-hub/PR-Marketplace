/**
 * PR MARKETPLACE - MAIN APPLICATION CONTROLLER
 * Handles UI interactions, rendering, state management, modal popups,
 * direct buyer-to-seller contact links, and payment QR codes.
 */

document.addEventListener('DOMContentLoaded', () => {
  // App State
  const state = {
    currentCategory: 'all',
    currentLocation: 'all',
    searchQuery: '',
    selectedConditions: [],
    maxPrice: 5000,
    currentTab: 'explore', // 'explore', 'favorites', or 'notifications'
    uploadedImageDataUrl: null,
    uploadedPaymentQrDataUrl: null,
    isDevAdminMode: false, // Developer & Admin override switch
    userGpsCoords: null,
    activePrivateChatRecipient: null,
    openedPrivateFromAllChat: false
  };

  // DOM Elements
  const itemsGrid = document.getElementById('itemsGrid');
  const itemCount = document.getElementById('itemCount');
  const feedTitle = document.getElementById('feedTitle');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const categoriesNav = document.getElementById('categoriesNav');
  const locationSelect = document.getElementById('locationSelect');
  const btnGpsDetect = document.getElementById('btnGpsDetect');
  const favBadge = document.getElementById('favBadge');
  const toastContainer = document.getElementById('toastContainer');

  // Modals
  const itemDetailModal = document.getElementById('itemDetailModal');
  const itemDetailContent = document.getElementById('itemDetailContent');
  const closeDetailModalBtn = document.getElementById('closeDetailModalBtn');

  const sellModal = document.getElementById('sellModal');
  const openSellModalBtn = document.getElementById('openSellModalBtn');
  const closeSellModalBtn = document.getElementById('closeSellModalBtn');
  const cancelSellBtn = document.getElementById('cancelSellBtn');
  const sellForm = document.getElementById('sellForm');

  const filterModal = document.getElementById('filterModal');
  const filterModalBtn = document.getElementById('filterModalBtn');
  const closeFilterModalBtn = document.getElementById('closeFilterModalBtn');
  const applyFilterModalBtn = document.getElementById('applyFilterModalBtn');
  const resetFilterModalBtn = document.getElementById('resetFilterModalBtn');
  const priceRange = document.getElementById('priceRange');
  const priceValueDisplay = document.getElementById('priceValueDisplay');
  const activeFiltersBar = document.getElementById('activeFiltersBar');
  const filterTags = document.getElementById('filterTags');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');

  const infoModal = document.getElementById('infoModal');
  const infoModalContent = document.getElementById('infoModalContent');
  const closeInfoModalBtn = document.getElementById('closeInfoModalBtn');

  // Notifications Elements
  const notifBadge = document.getElementById('notifBadge');
  const navNotifications = document.getElementById('navNotifications');
  const notificationsModal = document.getElementById('notificationsModal');
  const closeNotificationsModalBtn = document.getElementById('closeNotificationsModalBtn');
  const btnMarkAllNotifsRead = document.getElementById('btnMarkAllNotifsRead');
  const notificationsList = document.getElementById('notificationsList');

  // Community All Chat Elements
  const btnOpenAllChat = document.getElementById('btnOpenAllChat');
  const allChatModal = document.getElementById('allChatModal');
  const closeAllChatModalBtn = document.getElementById('closeAllChatModalBtn');
  const allChatMessagesThread = document.getElementById('allChatMessagesThread');
  const allChatInputForm = document.getElementById('allChatInputForm');
  const allChatMessageInput = document.getElementById('allChatMessageInput');

  // Direct Private 1-on-1 Chat Elements
  const privateChatModal = document.getElementById('privateChatModal');
  const closePrivateChatModalBtn = document.getElementById('closePrivateChatModalBtn');
  const btnBackFromPrivateChat = document.getElementById('btnBackFromPrivateChat');
  const privateChatRecipientAvatar = document.getElementById('privateChatRecipientAvatar');
  const privateChatRecipientName = document.getElementById('privateChatRecipientName');
  const privateChatMessagesThread = document.getElementById('privateChatMessagesThread');
  const privateChatInputForm = document.getElementById('privateChatInputForm');
  const privateChatMessageInput = document.getElementById('privateChatMessageInput');
  const btnSendPrivateChat = document.getElementById('btnSendPrivateChat');

  // Image & QR Upload Elements
  const itemImageInput = document.getElementById('itemImageInput');
  const uploadPlaceholder = document.getElementById('uploadPlaceholder');
  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const removePhotoBtn = document.getElementById('removePhotoBtn');

  const sellerQrCodeInput = document.getElementById('sellerQrCodeInput');
  const sellerQrPlaceholder = document.getElementById('sellerQrPlaceholder');
  const sellerQrPreviewContainer = document.getElementById('sellerQrPreviewContainer');
  const sellerQrPreview = document.getElementById('sellerQrPreview');
  const removeSellerQrBtn = document.getElementById('removeSellerQrBtn');

  // Navigation Items
  const navExplore = document.getElementById('navExplore');
  const navFavorites = document.getElementById('navFavorites');

  /* ==========================================================================
     1. INITIALIZATION & FEED RENDERING
     ========================================================================== */

  async function loadFeed(showSkeleton = false) {
    if (!itemsGrid) return;

    if (showSkeleton && !itemsGrid.children.length) {
      itemsGrid.innerHTML = `
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      `;
    }

    try {
      const isFavTab = (state.currentTab === 'favorites');
      const filters = isFavTab ? {} : {
        category: state.currentCategory,
        location: state.currentLocation,
        search: state.searchQuery,
        conditions: state.selectedConditions,
        maxPrice: state.maxPrice
      };

      let items = await window.api.fetchItems(filters);

      // If favorites tab active, filter items by saved IDs
      if (isFavTab) {
        const favIds = window.api.getFavoriteIds();
        items = items.filter(i => favIds.includes(String(i.id)));
        if (feedTitle) feedTitle.textContent = `Saved Favorite Items (${items.length})`;
      } else {
        if (feedTitle) {
          feedTitle.textContent = state.currentCategory === 'all' 
            ? 'Recent Listings' 
            : `${state.currentCategory} Listings`;
        }
      }

      updateActiveFiltersUI();
      renderItems(items);
      updateFavoriteBadge();
    } catch (error) {
      console.error('Error loading items feed:', error);
    }
  }

  function renderItems(items) {
    if (itemCount) itemCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;

    const favIds = window.api.getFavoriteIds();

    if (items.length === 0) {
      itemsGrid.innerHTML = '';
      if (emptyState) {
        if (state.currentTab === 'favorites') {
          emptyState.innerHTML = `
            <div class="empty-icon">❤️</div>
            <h3>No Saved Items Yet</h3>
            <p>Tap the heart icon (♡) on any listing to save it for quick access here!</p>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:10px;">
              <button class="btn btn-primary" id="btnExploreFromFavs">✨ Explore All Listings</button>
            </div>
          `;
          emptyState.classList.remove('hidden');
          document.getElementById('btnExploreFromFavs')?.addEventListener('click', () => {
            state.currentTab = 'explore';
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            navExplore?.classList.add('active');
            loadFeed();
          });
        } else {
          emptyState.innerHTML = `
            <div class="empty-icon">🔍</div>
            <h3>No items found</h3>
            <p>Try adjusting your search keywords or clear category filters.</p>
            <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:10px;">
              <button class="btn btn-secondary" id="emptyResetBtn">Show All Items</button>
            </div>
          `;
          emptyState.classList.remove('hidden');
          document.getElementById('emptyResetBtn')?.addEventListener('click', () => {
            state.currentCategory = 'all';
            state.searchQuery = '';
            loadFeed();
          });
        }
      }
      return;
    }

    emptyState?.classList.add('hidden');

    itemsGrid.innerHTML = items.map(item => {
      const isFav = favIds.includes(String(item.id));
      const isSold = Boolean(item.isSold);
      const formattedPrice = Number(item.price).toFixed(2);
      
      const displayImg = item.imageUrl || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

      let titleHtml = escapeHtml(item.title);
      if (state.searchQuery) {
        const regex = new RegExp(`(${escapeRegExp(state.searchQuery)})`, 'gi');
        titleHtml = titleHtml.replace(regex, '<mark class="search-highlight">$1</mark>');
      }

      let hrsLeft = 5;
      if (isSold && item.soldAt) {
        hrsLeft = Math.max(1, Math.round(5 - ((Date.now() - new Date(item.soldAt).getTime()) / (1000 * 60 * 60))));
      }

      return `
        <article class="product-card ${isSold ? 'is-sold-card' : ''}" data-id="${item.id}">
          <div class="card-image-wrapper">
            ${isSold 
              ? `<span class="condition-badge sold-badge">🔴 SOLD OUT</span>` 
              : `<span class="condition-badge">${escapeHtml(item.condition)}</span>`}

            <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${item.id}" aria-label="Favorite">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <img class="card-image" src="${escapeHtml(displayImg)}" alt="${escapeHtml(item.title)}" loading="eager" decoding="async" fetchpriority="high" onError="this.src='https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'">
          </div>
          <div class="card-details">
            <span class="card-category">${escapeHtml(item.category)}</span>
            <h3 class="card-title">${titleHtml}</h3>
            
            <div class="card-price-row">
              <span class="card-price ${isSold ? 'line-through' : ''}">₹${formattedPrice}</span>
              <span class="card-location">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                ${escapeHtml(item.location.split('/')[0] || item.location)}
              </span>
            </div>

            ${isSold ? `<span class="auto-delete-tag">⏳ Auto-deletes in ${hrsLeft}h</span>` : ''}

            <button class="quick-contact-btn ${isSold ? 'btn-disabled' : ''}" data-id="${item.id}">
              <span>${isSold ? 'View Sold Status' : 'View & Contact'}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </article>
      `;
    }).join('');

    // Attach card click handlers
    document.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const favTarget = e.target.closest('.fav-btn');
        if (favTarget) {
          e.stopPropagation();
          const id = favTarget.dataset.id;
          const updatedFavs = window.api.toggleFavorite(id);
          const isNowFav = updatedFavs.includes(String(id));
          favTarget.classList.toggle('active', isNowFav);
          favTarget.querySelector('svg').setAttribute('fill', isNowFav ? 'currentColor' : 'none');
          updateFavoriteBadge();
          showToast(isNowFav ? '❤️ Saved to Favorites' : 'Removed from Favorites');
          if (state.currentTab === 'favorites') loadFeed();
          return;
        }

        const id = card.dataset.id;
        openItemDetailModal(id);
      });
    });
  }

  /* ==========================================================================
     2. DIRECT BUYER-TO-SELLER CONTACT MODAL (WHATSAPP, INSTAGRAM, PHONE, QR)
     ========================================================================== */

  async function openItemDetailModal(itemId) {
    try {
      const item = await window.api.fetchItemById(itemId);
      if (!item) return;

      const formattedPrice = Number(item.price).toFixed(2);
      const displayImg = item.imageUrl || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

      // Clean & Sanitize WhatsApp Number
      const cleanWhatsapp = item.sellerWhatsapp ? item.sellerWhatsapp.replace(/[^\d]/g, '') : '';
      
      // Pre-filled WhatsApp message
      const encodedWaMsg = encodeURIComponent(
        `Hi ${item.sellerName}! 👋 I am interested in buying your item "${item.title}" listed for ₹${formattedPrice} on PR Marketplace. Is it still available for meetup at ${item.location}?`
      );
      
      const whatsappUrl = cleanWhatsapp 
        ? `https://wa.me/${cleanWhatsapp}?text=${encodedWaMsg}`
        : '#';

      // Clean Instagram Handle
      const cleanInsta = item.sellerInstagram ? item.sellerInstagram.replace('@', '').trim() : '';
      const instaUrl = cleanInsta ? `https://instagram.com/${cleanInsta}` : '#';

      const isSold = Boolean(item.isSold);
      let hrsLeft = 5;
      if (isSold && item.soldAt) {
        hrsLeft = Math.max(1, Math.round(5 - ((Date.now() - new Date(item.soldAt).getTime()) / (1000 * 60 * 60))));
      }

      // AUTHORIZATION CHECK: Only item poster can mark as sold; ONLY Developer can manually delete from DB
      const isOwner = window.api.isItemOwnedByCurrentUser(item.id);
      const isDev = Boolean(state.isDevAdminMode);
      const canMarkAsSold = isOwner || isDev;
      const canDeleteManually = isDev; // Manual DB deletion restricted to App Developers

      const displayPhoneNo = item.sellerPhone || item.sellerWhatsapp || '';

      const isFavItem = window.api.getFavoriteIds().includes(String(item.id));

      itemDetailContent.innerHTML = `
        <div class="detail-image-box" id="detailImageBox">
          <img id="detailItemImg" src="${escapeHtml(displayImg)}" alt="${escapeHtml(item.title)}">
          <div class="detail-zoom-toolbar">
            <button type="button" class="btn-detail-zoom" id="btnDetailZoomOut" title="Zoom Out (−)">−</button>
            <span class="detail-zoom-indicator" id="detailZoomIndicator">100%</span>
            <button type="button" class="btn-detail-zoom" id="btnDetailZoomIn" title="Zoom In (+)">+</button>
            <button type="button" class="btn-detail-zoom zoom-reset-btn" id="btnDetailZoomReset" title="Reset Zoom">Reset</button>
          </div>
        </div>

        ${isSold ? `
          <div class="sold-notice-box">
            <span>🔴 <strong>ITEM ALREADY SOLD:</strong> This listing was marked as sold and will automatically be deleted from the database in <strong>${hrsLeft} hours</strong>.</span>
          </div>
        ` : ''}

        <div class="detail-header">
          <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:8px;">
            <div class="detail-tags">
              <span class="tag tag-category">${escapeHtml(item.category)}</span>
              <span class="tag tag-condition">${escapeHtml(item.condition)}</span>
              ${isSold ? `<span class="tag tag-sold">🔴 SOLD</span>` : ''}
            </div>
            <button type="button" id="btnDetailToggleFav" style="background:${isFavItem ? '#FEE2E2' : '#F1F5F9'}; color:${isFavItem ? '#EF4444' : '#475569'}; border:1px solid ${isFavItem ? '#FCA5A5' : '#CBD5E1'}; border-radius:20px; padding:6px 14px; font-weight:700; font-size:0.8rem; display:flex; align-items:center; gap:6px; cursor:pointer;">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="${isFavItem ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span id="txtDetailFavLabel">${isFavItem ? 'Saved' : 'Save Item'}</span>
            </button>
          </div>
          <h2 class="detail-title">${escapeHtml(item.title)}</h2>
          <div class="detail-price ${isSold ? 'line-through' : ''}">₹${formattedPrice}</div>
        </div>

        <div class="detail-desc">
          <strong>Description & Notes:</strong><br>
          ${escapeHtml(item.description || 'No additional description provided.')}
          <br><br>
          📍 <strong>Meetup Location:</strong> ${escapeHtml(item.location)}
          ${displayPhoneNo ? `<br>📞 <strong>Seller Phone Contact:</strong> <a href="tel:${escapeHtml(displayPhoneNo)}" style="color:var(--primary); font-weight:700; text-decoration:none;">${escapeHtml(displayPhoneNo)}</a>` : ''}
        </div>

        ${item.paymentQrUrl ? `
          <!-- SELLER DIRECT PAYMENT QR CODE CARD -->
          <div class="payment-qr-card">
            <div class="qr-header-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <strong>Direct Seller Payment QR Code</strong>
            </div>
            <div class="qr-image-wrapper">
              <img src="${escapeHtml(item.paymentQrUrl)}" alt="Seller Payment QR Code">
            </div>
            <span class="qr-pay-hint">Scan with GPay, PhonePe, Paytm, BHIM UPI or Venmo to pay seller directly</span>
          </div>
        ` : ''}

        <!-- SELLER DIRECT CONTACT CARD -->
        <div class="seller-contact-card">
          <div class="seller-profile-row">
            <div class="seller-avatar">${escapeHtml((item.sellerName || 'S').charAt(0).toUpperCase())}</div>
            <div class="seller-info">
              <h4>${escapeHtml(item.sellerName)}</h4>
              ${displayPhoneNo ? `<div style="font-size:0.85rem; font-weight:700; color:var(--text); margin-top:2px;">📞 Phone: <a href="tel:${escapeHtml(displayPhoneNo)}" style="color:var(--primary); text-decoration:none;">${escapeHtml(displayPhoneNo)}</a></div>` : ''}
            </div>
          </div>

          <!-- IN-APP LIVE DIRECT CHATBOX WIDGET -->
          <div class="item-chatbox-card">
            <div class="chatbox-header-bar">
              <div class="chatbox-header-title">
                <span class="chat-online-dot"></span>
                <h4>💬 Live Chat with ${escapeHtml(item.sellerName)}</h4>
              </div>
              <span class="chat-security-tag">🔒 In-App Direct Chat</span>
            </div>

            <div class="chat-messages-thread" id="chatMessagesThread">
              <div style="text-align:center; padding:15px; color:var(--text-muted); font-size:0.78rem;">Loading chat messages...</div>
            </div>

            ${!isSold ? `
              <form class="chat-input-bar" id="chatInputForm">
                <input type="text" id="chatMessageInput" placeholder="Ask ${escapeHtml(item.sellerName)} about price, meetup..." autocomplete="off" required>
                <button type="submit" class="btn-send-chat">
                  <span>Send</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </form>
            ` : ''}
          </div>

          ${!isSold ? `
            <div class="contact-actions-grid" style="margin-top:14px;">
              ${displayPhoneNo ? `
                <a href="tel:${escapeHtml(displayPhoneNo)}" class="contact-btn btn-phone btn-direct-call-seller" data-phone="${escapeHtml(displayPhoneNo)}" style="background-color:#10b981; color:white; font-weight:800; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:8px; padding:12px; border-radius:12px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span>📞 Call Seller Directly (${escapeHtml(displayPhoneNo)})</span>
                </a>
              ` : ''}

              <!-- AUTHORIZED SELLER MARK AS SOLD & DEVELOPER MANUAL FORCE DELETE BUTTONS -->
              ${canMarkAsSold ? `
                <div class="seller-ownership-banner">
                  <span>${isDev ? '🛡️ Developer Admin Access' : '👤 You are the Owner of this Listing'}</span>
                </div>
                <button class="contact-btn btn-mark-sold" id="markSoldBtn" data-id="${item.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Mark Item as Sold (Auto-Deletes in 5h)</span>
                </button>
              ` : ''}

              ${canDeleteManually ? `
                <button class="contact-btn" id="deleteItemBtn" data-id="${item.id}" style="background-color:#dc2626; color:white; margin-top:6px; font-weight:700;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span>🛡️ Developer: Manual Force Delete from DB</span>
                </button>
              ` : ''}

              ${!canMarkAsSold && !canDeleteManually ? `
                <div class="seller-restriction-notice">
                  <p>🔒 <em>Only the seller who posted this item can mark it as sold. Sold items auto-delete from the database automatically, while manual deletion is restricted to app developers.</em></p>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="sold-disabled-notice">
              <p>🔴 Contact options are disabled because this item is sold. It will automatically be deleted from the database in <strong>${hrsLeft} hours</strong>.</p>
              ${canDeleteManually ? `
                <button class="contact-btn" id="deleteItemBtn" data-id="${item.id}" style="background-color:#dc2626; color:white; margin-top:10px; font-weight:700;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span>🛡️ Developer: Force Delete from Database Now</span>
                </button>
              ` : ''}
            </div>
          `}
        </div>
      `;

      itemDetailModal?.classList.remove('hidden');

      // In-place Zoom Controller for Item Photo Being Sold
      const detailImg = itemDetailContent.querySelector('#detailItemImg');
      const detailZoomIn = itemDetailContent.querySelector('#btnDetailZoomIn');
      const detailZoomOut = itemDetailContent.querySelector('#btnDetailZoomOut');
      const detailZoomReset = itemDetailContent.querySelector('#btnDetailZoomReset');
      const detailZoomIndicator = itemDetailContent.querySelector('#detailZoomIndicator');
      let currentDetailScale = 1.0;

      const updateDetailZoom = (scale) => {
        currentDetailScale = Math.min(3.5, Math.max(1.0, scale));
        if (detailImg) {
          detailImg.style.transform = `scale(${currentDetailScale})`;
        }
        if (detailZoomIndicator) {
          detailZoomIndicator.textContent = `${Math.round(currentDetailScale * 100)}%`;
        }
      };

      detailZoomIn?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateDetailZoom(currentDetailScale + 0.35);
      });

      detailZoomOut?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateDetailZoom(currentDetailScale - 0.35);
      });

      detailZoomReset?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateDetailZoom(1.0);
      });

      // Clicking directly on the image opens the full-screen pinch/pan zoom lightbox
      detailImg?.addEventListener('click', () => {
        window.openImageZoomModal(displayImg, item.title);
      });

      itemDetailContent.querySelector('.qr-image-wrapper')?.addEventListener('click', () => {
        if (item.paymentQrUrl) {
          window.openImageZoomModal(item.paymentQrUrl, `${item.sellerName} Payment QR Code`);
        }
      });
      // Attach Save/Favorite toggle event listener in Detail View
      document.getElementById('btnDetailToggleFav')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const updatedFavs = window.api.toggleFavorite(item.id);
        const nowFav = updatedFavs.includes(String(item.id));
        const btn = document.getElementById('btnDetailToggleFav');
        const txt = document.getElementById('txtDetailFavLabel');
        if (btn) {
          btn.style.background = nowFav ? '#FEE2E2' : '#F1F5F9';
          btn.style.color = nowFav ? '#EF4444' : '#475569';
          btn.style.borderColor = nowFav ? '#FCA5A5' : '#CBD5E1';
          const svg = btn.querySelector('svg');
          if (svg) svg.setAttribute('fill', nowFav ? 'currentColor' : 'none');
        }
        if (txt) txt.textContent = nowFav ? 'Saved' : 'Save Item';
        updateFavoriteBadge();
        showToast(nowFav ? '❤️ Saved to Favorites' : 'Removed from Favorites');
        if (state.currentTab === 'favorites') loadFeed();
      });

      // Attach Call Seller event listeners
      document.querySelectorAll('.btn-direct-call-seller').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const phone = btn.dataset.phone;
          showToast(`📞 Dialing ${phone}...`);
          try {
            window.location.href = `tel:${phone}`;
          } catch (err) {
            console.warn('Native call error:', err);
          }
        });
      });

      // Attach Mark as Sold event listener
      const markSoldBtn = document.getElementById('markSoldBtn');
      markSoldBtn?.addEventListener('click', async () => {
        try {
          await window.api.markItemAsSold(item.id);
          showToast('🔴 Item marked as SOLD! Auto-deletes from database in 5 hours.');
          itemDetailModal?.classList.add('hidden');
          loadFeed();
        } catch (err) {
          console.error(err);
          showToast('⚠️ Failed to mark item as sold');
        }
      });

      // Attach Delete Item event listener (Restricted strictly to Developer Admin Mode)
      const deleteItemBtn = document.getElementById('deleteItemBtn');
      deleteItemBtn?.addEventListener('click', async () => {
        if (!state.isDevAdminMode) {
          showToast('⚠️ Manual database deletion is restricted to app developers only.');
          return;
        }
        if (!confirm('🛡️ Developer Override: Are you sure you want to force delete this listing from the database?')) return;
        try {
          await window.api.deleteItem(item.id);
          showToast('🗑️ Developer Action: Listing deleted from database!');
          itemDetailModal?.classList.add('hidden');
          loadFeed();
        } catch (err) {
          console.error(err);
          showToast('⚠️ Failed to delete item');
        }
      });

      // Render In-App Live Chat Messages
      const renderChatThread = async () => {
        const chatThread = document.getElementById('chatMessagesThread');
        if (!chatThread) return;

        try {
          const messages = await window.api.fetchMessages(item.id);
          if (!messages || messages.length === 0) {
            chatThread.innerHTML = `
              <div style="text-align:center; padding:15px; color:var(--text-muted); font-size:0.78rem;">
                💬 No messages yet. Ask ${escapeHtml(item.sellerName)} about price, meetup location, or condition!
              </div>
            `;
            return;
          }

          chatThread.innerHTML = messages.map(msg => {
            const isMe = msg.senderRole === 'buyer' || (msg.senderName && msg.senderName.includes('You'));
            const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const cleanSenderName = (msg.senderName || 'User').replace(/\s*\(.*?\)/, '').trim();

            return `
              <div class="chat-bubble ${isMe ? 'buyer-msg' : 'seller-msg'}">
                <div class="chat-meta-info">
                  <span>${escapeHtml(msg.senderName)}</span>
                  <span>${timeStr}</span>
                </div>
                <span class="chat-text">${escapeHtml(msg.text)}</span>
                ${!isMe ? `
                  <div style="margin-top:4px;">
                    <button type="button" class="item-chat-pm-btn" data-user-name="${escapeHtml(cleanSenderName)}">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>Private Chat</span>
                    </button>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');

          chatThread.querySelectorAll('.item-chat-pm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const userName = btn.dataset.userName;
              if (userName) {
                window.openPrivateChat(userName, false, { itemTitle: item.title });
              }
            });
          });

          chatThread.scrollTop = chatThread.scrollHeight;
        } catch (err) {
          console.error('Chat load error:', err);
        }
      };

      await renderChatThread();

      // Handle In-App Live Chat Input Form Submission
      const chatInputForm = document.getElementById('chatInputForm');
      chatInputForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chatMessageInput');
        const text = input?.value.trim();
        if (!text) return;

        input.value = '';

        try {
          await window.api.sendMessage(item.id, {
            senderName: 'You (Buyer)',
            senderRole: 'buyer',
            text: text
          });

          await renderChatThread();

          // Add notification for the item message inquiry
          if (typeof addNotification === 'function') {
            addNotification({
              itemId: item.id,
              itemTitle: item.title,
              itemImage: item.imageUrl,
              senderName: 'Buyer Inquiry',
              messageText: text
            });
          }

          // Simulated intelligent seller auto-reply for instant interactive feedback
          setTimeout(async () => {
            const replies = [
              `Hi! Yes, "${item.title}" is available. We can meet up at ${item.location}.`,
              `Thanks for your message! Does ₹${item.price} work for you?`,
              `Hello! Feel free to ask any specific questions about the item condition.`
            ];
            const randomReply = replies[Math.floor(Math.random() * replies.length)];
            await window.api.sendMessage(item.id, {
              senderName: item.sellerName + ' (Seller)',
              senderRole: 'seller',
              text: randomReply
            });
            await renderChatThread();

            // Trigger notification for incoming seller reply
            if (typeof addNotification === 'function') {
              addNotification({
                itemId: item.id,
                itemTitle: item.title,
                itemImage: item.imageUrl,
                senderName: item.sellerName + ' (Seller)',
                messageText: randomReply
              });
            }
          }, 1000);
        } catch (err) {
          console.error('Chat send error:', err);
          showToast('⚠️ Failed to send message');
        }
      });

      itemDetailModal?.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      showToast('⚠️ Unable to open item details');
    }
  }

  window.openItemDetail = openItemDetailModal;
  window.openItemDetailModal = openItemDetailModal;

  closeDetailModalBtn?.addEventListener('click', () => {
    itemDetailModal?.classList.add('hidden');
  });

  /* ==========================================================================
     3. POST NEW LISTING / SELL ITEM FORM & IMAGE UPLOAD
     ========================================================================== */

  openSellModalBtn?.addEventListener('click', () => {
    sellModal?.classList.remove('hidden');
  });

  const openSellModal = () => {
    sellModal?.classList.remove('hidden');
  };

  const closeSellModal = () => {
    sellModal?.classList.add('hidden');
    sellForm?.reset();
    state.uploadedImageDataUrl = null;
    state.uploadedPaymentQrDataUrl = null;
    uploadPlaceholder?.classList.remove('hidden');
    imagePreviewContainer?.classList.add('hidden');
    if (imagePreview) imagePreview.src = '';
    sellerQrPlaceholder?.classList.remove('hidden');
    sellerQrPreviewContainer?.classList.add('hidden');
    if (sellerQrPreview) sellerQrPreview.src = '';
  };

  closeSellModalBtn?.addEventListener('click', closeSellModal);
  cancelSellBtn?.addEventListener('click', closeSellModal);

  // Handle Quick Price & Location Preset Chips
  document.getElementById('pricePresets')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    const price = chip.dataset.price;
    const itemPriceInput = document.getElementById('itemPrice');
    if (itemPriceInput && price) {
      itemPriceInput.value = price;
      showToast(`💰 Set price to ₹${price}`);
    }
  });

  document.getElementById('locationPresets')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    const loc = chip.dataset.loc;
    const itemLocationInput = document.getElementById('itemLocation');
    if (itemLocationInput && loc) {
      itemLocationInput.value = loc;
      showToast(`📍 Set location to ${loc}`);
    }
  });

  // Automatic High-Performance Image Compression Helper (Downscales phone photos to ~80KB)
  async function compressImageFile(file, maxDimension = 1000, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;

          if (w > maxDimension || h > maxDimension) {
            if (w > h) {
              h = Math.round((h * maxDimension) / w);
              w = maxDimension;
            } else {
              w = Math.round((w * maxDimension) / h);
              h = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // Handle Photo File Upload & Reader
  itemImageInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showToast('⏳ Optimizing item photo...');
      const optimizedUrl = await compressImageFile(file, 1000, 0.82);
      state.uploadedImageDataUrl = optimizedUrl;
      if (imagePreview) imagePreview.src = optimizedUrl;
      uploadPlaceholder?.classList.add('hidden');
      imagePreviewContainer?.classList.remove('hidden');
    } catch (err) {
      console.warn('Image process error:', err);
      const reader = new FileReader();
      reader.onload = (ev) => {
        state.uploadedImageDataUrl = ev.target.result;
        if (imagePreview) imagePreview.src = state.uploadedImageDataUrl;
        uploadPlaceholder?.classList.add('hidden');
        imagePreviewContainer?.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });
  
  removePhotoBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.uploadedImageDataUrl = null;
    if (itemImageInput) itemImageInput.value = '';
    uploadPlaceholder?.classList.remove('hidden');
    imagePreviewContainer?.classList.add('hidden');
  });

  // Handle Payment QR File Upload & Reader
  sellerQrCodeInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showToast('⏳ Optimizing QR image...');
      const optimizedQrUrl = await compressImageFile(file, 800, 0.85);
      state.uploadedPaymentQrDataUrl = optimizedQrUrl;
      if (sellerQrPreview) sellerQrPreview.src = optimizedQrUrl;
      sellerQrPlaceholder?.classList.add('hidden');
      sellerQrPreviewContainer?.classList.remove('hidden');
    } catch (err) {
      console.warn('QR process error:', err);
      const reader = new FileReader();
      reader.onload = (ev) => {
        state.uploadedPaymentQrDataUrl = ev.target.result;
        if (sellerQrPreview) sellerQrPreview.src = state.uploadedPaymentQrDataUrl;
        sellerQrPlaceholder?.classList.add('hidden');
        sellerQrPreviewContainer?.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  // In-Place Zoom in Sell Form Photo & QR Previews
  let previewPhotoScale = 1.0;
  const btnPreviewZoomIn = document.getElementById('btnPreviewZoomIn');
  const btnPreviewZoomOut = document.getElementById('btnPreviewZoomOut');

  btnPreviewZoomIn?.addEventListener('click', (e) => {
    e.stopPropagation();
    previewPhotoScale = Math.min(3.0, previewPhotoScale + 0.25);
    if (imagePreview) imagePreview.style.transform = `scale(${previewPhotoScale})`;
  });

  btnPreviewZoomOut?.addEventListener('click', (e) => {
    e.stopPropagation();
    previewPhotoScale = Math.max(1.0, previewPhotoScale - 0.25);
    if (imagePreview) imagePreview.style.transform = `scale(${previewPhotoScale})`;
  });

  let previewQrScale = 1.0;
  const btnQrPreviewZoomIn = document.getElementById('btnQrPreviewZoomIn');
  const btnQrPreviewZoomOut = document.getElementById('btnQrPreviewZoomOut');

  btnQrPreviewZoomIn?.addEventListener('click', (e) => {
    e.stopPropagation();
    previewQrScale = Math.min(3.0, previewQrScale + 0.25);
    if (sellerQrPreview) sellerQrPreview.style.transform = `scale(${previewQrScale})`;
  });

  btnQrPreviewZoomOut?.addEventListener('click', (e) => {
    e.stopPropagation();
    previewQrScale = Math.max(1.0, previewQrScale - 0.25);
    if (sellerQrPreview) sellerQrPreview.style.transform = `scale(${previewQrScale})`;
  });

  /* ==========================================================================
     IMAGE & PAYMENT QR CROPPER CONTROLLER
     ========================================================================== */
  const cropModal = document.getElementById('cropModal');
  const cropModalTitle = document.getElementById('cropModalTitle');
  const closeCropModalBtn = document.getElementById('closeCropModalBtn');
  const cancelCropBtn = document.getElementById('cancelCropBtn');
  const applyCropBtn = document.getElementById('applyCropBtn');
  const cropImageBtn = document.getElementById('cropImageBtn');
  const cropSellerQrBtn = document.getElementById('cropSellerQrBtn');
  const cropperViewport = document.getElementById('cropperViewportContainer');
  const cropCanvas = document.getElementById('cropCanvas');
  const cropBox = document.getElementById('cropSelectionBox');
  const btnRotateCrop = document.getElementById('btnRotateCrop');
  const btnResetCrop = document.getElementById('btnResetCrop');

  let cropState = {
    target: null, // 'image' or 'qr'
    imgObj: new Image(),
    rawSrc: null,
    rotation: 0,
    aspectRatio: 'free',
    box: { x: 20, y: 20, w: 200, h: 200 },
    canvasRect: { x: 0, y: 0, w: 0, h: 0 },
    isDragging: false,
    dragHandle: null,
    dragStart: { x: 0, y: 0 },
    boxStart: { x: 0, y: 0, w: 0, h: 0 }
  };

  function openCropper(targetType) {
    cropState.target = targetType;
    cropState.rawSrc = (targetType === 'qr') ? state.uploadedPaymentQrDataUrl : state.uploadedImageDataUrl;
    if (!cropState.rawSrc) {
      showToast('⚠️ Please upload an image first');
      return;
    }

    if (cropModalTitle) {
      cropModalTitle.textContent = (targetType === 'qr') ? 'Crop & Adjust Payment QR Code' : 'Crop & Adjust Item Photo';
    }

    cropState.rotation = 0;
    cropState.aspectRatio = (targetType === 'qr') ? '1:1' : 'free';

    document.querySelectorAll('.crop-aspect-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === cropState.aspectRatio);
    });

    cropModal?.classList.remove('hidden');

    cropState.imgObj = new Image();
    cropState.imgObj.onload = () => {
      renderCropperCanvas();
    };
    cropState.imgObj.src = cropState.rawSrc;
  }

  function renderCropperCanvas() {
    if (!cropCanvas || !cropperViewport || !cropState.imgObj.complete) return;
    const ctx = cropCanvas.getContext('2d');
    const vpW = cropperViewport.clientWidth || 300;
    const vpH = cropperViewport.clientHeight || 260;

    let srcW = cropState.imgObj.naturalWidth || 600;
    let srcH = cropState.imgObj.naturalHeight || 600;

    const is90or270 = (cropState.rotation % 180 !== 0);
    const rotW = is90or270 ? srcH : srcW;
    const rotH = is90or270 ? srcW : srcH;

    const scale = Math.min((vpW - 20) / rotW, (vpH - 20) / rotH, 1);
    const drawW = Math.round(rotW * scale);
    const drawH = Math.round(rotH * scale);

    cropCanvas.width = drawW;
    cropCanvas.height = drawH;
    cropCanvas.style.width = drawW + 'px';
    cropCanvas.style.height = drawH + 'px';

    ctx.save();
    ctx.clearRect(0, 0, drawW, drawH);
    ctx.translate(drawW / 2, drawH / 2);
    ctx.rotate((cropState.rotation * Math.PI) / 180);

    const origScaledW = srcW * scale;
    const origScaledH = srcH * scale;
    ctx.drawImage(cropState.imgObj, -origScaledW / 2, -origScaledH / 2, origScaledW, origScaledH);
    ctx.restore();

    const canvasOffsetLeft = (vpW - drawW) / 2;
    const canvasOffsetTop = (vpH - drawH) / 2;
    cropState.canvasRect = { x: canvasOffsetLeft, y: canvasOffsetTop, w: drawW, h: drawH };

    resetCropBox();
  }

  function resetCropBox() {
    const c = cropState.canvasRect;
    let boxW = Math.round(c.w * 0.85);
    let boxH = Math.round(c.h * 0.85);

    if (cropState.aspectRatio === '1:1') {
      const minDim = Math.min(boxW, boxH);
      boxW = minDim;
      boxH = minDim;
    } else if (cropState.aspectRatio === '4:3') {
      boxH = Math.round(boxW * (3 / 4));
      if (boxH > c.h) { boxH = c.h; boxW = Math.round(boxH * (4 / 3)); }
    } else if (cropState.aspectRatio === '16:9') {
      boxH = Math.round(boxW * (9 / 16));
      if (boxH > c.h) { boxH = c.h; boxW = Math.round(boxH * (16 / 9)); }
    }

    const boxX = c.x + (c.w - boxW) / 2;
    const boxY = c.y + (c.h - boxH) / 2;

    cropState.box = { x: boxX, y: boxY, w: boxW, h: boxH };
    updateCropBoxDOM();
  }

  function updateCropBoxDOM() {
    if (!cropBox) return;
    cropBox.style.left = cropState.box.x + 'px';
    cropBox.style.top = cropState.box.y + 'px';
    cropBox.style.width = cropState.box.w + 'px';
    cropBox.style.height = cropState.box.h + 'px';
  }

  function applyCroppedImage() {
    if (!cropState.imgObj || !cropState.imgObj.complete) return;
    const c = cropState.canvasRect;
    const b = cropState.box;

    const relX = Math.max(0, b.x - c.x);
    const relY = Math.max(0, b.y - c.y);
    const relW = Math.min(b.w, c.w - relX);
    const relH = Math.min(b.h, c.h - relY);

    if (relW <= 10 || relH <= 10) {
      showToast('⚠️ Crop area too small');
      return;
    }

    const origW = cropState.imgObj.naturalWidth || cropState.imgObj.width || 800;
    const origH = cropState.imgObj.naturalHeight || cropState.imgObj.height || 800;

    const is90or270 = (cropState.rotation % 180 !== 0);
    const rotW = is90or270 ? origH : origW;
    const rotH = is90or270 ? origW : origH;

    const scale = c.w / rotW;

    const realCropW = Math.max(200, Math.round(relW / scale));
    const realCropH = Math.max(200, Math.round(relH / scale));
    const realCropX = Math.round(relX / scale);
    const realCropY = Math.round(relY / scale);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = realCropW;
    outCanvas.height = realCropH;
    const outCtx = outCanvas.getContext('2d');

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';

    if (cropState.rotation === 0) {
      outCtx.drawImage(
        cropState.imgObj,
        realCropX,
        realCropY,
        realCropW,
        realCropH,
        0,
        0,
        realCropW,
        realCropH
      );
    } else {
      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = rotW;
      rotCanvas.height = rotH;
      const rotCtx = rotCanvas.getContext('2d');
      rotCtx.imageSmoothingEnabled = true;
      rotCtx.imageSmoothingQuality = 'high';
      rotCtx.translate(rotW / 2, rotH / 2);
      rotCtx.rotate((cropState.rotation * Math.PI) / 180);
      rotCtx.drawImage(cropState.imgObj, -origW / 2, -origH / 2, origW, origH);

      outCtx.drawImage(
        rotCanvas,
        realCropX,
        realCropY,
        realCropW,
        realCropH,
        0,
        0,
        realCropW,
        realCropH
      );
    }

    const croppedDataUrl = outCanvas.toDataURL('image/jpeg', 0.95);

    if (cropState.target === 'qr') {
      state.uploadedPaymentQrDataUrl = croppedDataUrl;
      if (sellerQrPreview) sellerQrPreview.src = croppedDataUrl;
      showToast('✂️ Payment QR code cropped (HD Quality)!');
    } else {
      state.uploadedImageDataUrl = croppedDataUrl;
      if (imagePreview) imagePreview.src = croppedDataUrl;
      showToast('✂️ Item photo cropped (HD Quality)!');
    }

    cropModal?.classList.add('hidden');
  }

  // Pointer interactions on crop box
  cropBox?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const handleEl = e.target.closest('.crop-handle');
    cropState.isDragging = true;
    cropState.dragHandle = handleEl ? handleEl.dataset.handle : 'move';
    cropState.dragStart = { x: e.clientX, y: e.clientY };
    cropState.boxStart = { ...cropState.box };
  });

  window.addEventListener('pointermove', (e) => {
    if (!cropState.isDragging || cropModal?.classList.contains('hidden')) return;
    const dx = e.clientX - cropState.dragStart.x;
    const dy = e.clientY - cropState.dragStart.y;
    const c = cropState.canvasRect;
    const s = cropState.boxStart;

    if (cropState.dragHandle === 'move') {
      let newX = Math.max(c.x, Math.min(c.x + c.w - s.w, s.x + dx));
      let newY = Math.max(c.y, Math.min(c.y + c.h - s.h, s.y + dy));
      cropState.box.x = newX;
      cropState.box.y = newY;
    } else if (cropState.dragHandle === 'se') {
      let newW = Math.max(50, Math.min(c.x + c.w - s.x, s.w + dx));
      let newH = Math.max(50, Math.min(c.y + c.h - s.y, s.h + dy));
      if (cropState.aspectRatio === '1:1') {
        const d = Math.min(newW, newH);
        newW = d; newH = d;
      }
      cropState.box.w = newW;
      cropState.box.h = newH;
    } else if (cropState.dragHandle === 'sw') {
      let newX = Math.max(c.x, Math.min(s.x + s.w - 50, s.x + dx));
      let newW = s.w + (s.x - newX);
      let newH = Math.max(50, Math.min(c.y + c.h - s.y, s.h + dy));
      if (cropState.aspectRatio === '1:1') {
        const d = Math.min(newW, newH);
        newW = d; newH = d;
        newX = s.x + (s.w - newW);
      }
      cropState.box.x = newX;
      cropState.box.w = newW;
      cropState.box.h = newH;
    } else if (cropState.dragHandle === 'ne') {
      let newY = Math.max(c.y, Math.min(s.y + s.h - 50, s.y + dy));
      let newH = s.h + (s.y - newY);
      let newW = Math.max(50, Math.min(c.x + c.w - s.x, s.w + dx));
      if (cropState.aspectRatio === '1:1') {
        const d = Math.min(newW, newH);
        newW = d; newH = d;
      }
      cropState.box.y = newY;
      cropState.box.w = newW;
      cropState.box.h = newH;
    } else if (cropState.dragHandle === 'nw') {
      let newX = Math.max(c.x, Math.min(s.x + s.w - 50, s.x + dx));
      let newY = Math.max(c.y, Math.min(s.y + s.h - 50, s.y + dy));
      let newW = s.w + (s.x - newX);
      let newH = s.h + (s.y - newY);
      if (cropState.aspectRatio === '1:1') {
        const d = Math.min(newW, newH);
        newW = d; newH = d;
        newX = s.x + (s.w - newW);
        newY = s.y + (s.h - newH);
      }
      cropState.box.x = newX;
      cropState.box.y = newY;
      cropState.box.w = newW;
      cropState.box.h = newH;
    }

    updateCropBoxDOM();
  });

  window.addEventListener('pointerup', () => {
    cropState.isDragging = false;
  });

  // Aspect ratio chips
  document.querySelectorAll('.crop-aspect-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crop-aspect-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cropState.aspectRatio = btn.dataset.ratio;
      resetCropBox();
    });
  });

  // Rotate 90 deg
  btnRotateCrop?.addEventListener('click', () => {
    cropState.rotation = (cropState.rotation + 90) % 360;
    renderCropperCanvas();
  });

  // Reset Crop
  btnResetCrop?.addEventListener('click', () => {
    cropState.rotation = 0;
    renderCropperCanvas();
  });

  cropImageBtn?.addEventListener('click', () => openCropper('image'));
  cropSellerQrBtn?.addEventListener('click', () => openCropper('qr'));
  closeCropModalBtn?.addEventListener('click', () => cropModal?.classList.add('hidden'));
  cancelCropBtn?.addEventListener('click', () => cropModal?.classList.add('hidden'));
  applyCropBtn?.addEventListener('click', applyCroppedImage);

  // Handle Form Submission
  sellForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!state.uploadedImageDataUrl) {
      showToast('⚠️ Please upload an item photo');
      return;
    }

    const currentUser = window.api.getCurrentUser();
    const newItemData = {
      title: document.getElementById('itemTitle').value.trim(),
      category: document.getElementById('itemCategory').value,
      condition: document.getElementById('itemCondition').value,
      price: document.getElementById('itemPrice').value,
      location: document.getElementById('itemLocation').value.trim(),
      description: document.getElementById('itemDescription').value.trim(),
      imageUrl: state.uploadedImageDataUrl,
      paymentQrUrl: state.uploadedPaymentQrDataUrl || null,
      sellerName: document.getElementById('sellerName').value.trim(),
      sellerWhatsapp: '',
      sellerInstagram: '',
      sellerPhone: document.getElementById('sellerPhone') ? document.getElementById('sellerPhone').value.trim() : '',
      userId: currentUser ? currentUser.id : null
    };

    try {
      const submitBtn = document.getElementById('submitSellBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Publishing...</span>';
      }

      await window.api.createItem(newItemData);

      // Reset filters so the newly published item is instantly visible at the very top
      state.currentCategory = 'all';
      state.currentLocation = 'all';
      state.searchQuery = '';
      state.selectedConditions = [];
      state.maxPrice = 10000;
      state.currentTab = 'home';

      document.querySelectorAll('.cat-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.category === 'all');
      });
      document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.tab === 'home');
      });
      if (locationSelect) locationSelect.value = 'all';
      if (searchInput) searchInput.value = '';

      showToast('🎉 Listing Published Successfully!');
      closeSellModal();
      loadFeed();
    } catch (err) {
      console.error('Submit error:', err);
      showToast('⚠️ Failed to post listing');
    } finally {
      const submitBtn = document.getElementById('submitSellBtn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Publish Listing</span><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
      }
    }
  });

  /* ==========================================================================
     4. FILTERS & SEARCH EVENT LISTENERS
     ========================================================================== */

  // Search Input Handler (Debounced)
  let searchTimeout;
  searchInput?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    state.searchQuery = val;
    clearSearchBtn?.classList.toggle('hidden', val.length === 0);

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadFeed(false);
    }, 50);
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn?.classList.add('hidden');
    loadFeed(false);
  });

  // Location Selector & GPS Map Detection Handler
  function handleDetectGpsLocation() {
    if (!navigator.geolocation) {
      showToast('⚠️ Geolocation is not supported by your device');
      return;
    }

    showToast('📡 Detecting your location...');
    btnGpsDetect?.classList.add('locating');

    const onGpsSuccess = async (pos) => {
      btnGpsDetect?.classList.remove('locating');
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      state.userGpsCoords = { lat, lng };

      let placeName = 'Aizawl (GPS Location)';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          placeName = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || addr.town || addr.city || 'Aizawl Nearby';
        }
      } catch (e) {
        console.log('Reverse geocoding error:', e);
      }

      state.currentLocation = placeName;

      if (locationSelect) {
        let existingOpt = Array.from(locationSelect.options).find(o => o.value === placeName);
        if (!existingOpt) {
          const newOpt = document.createElement('option');
          newOpt.value = placeName;
          newOpt.textContent = `🎯 ${placeName} (GPS Active)`;
          locationSelect.appendChild(newOpt);
          newOpt.selected = true;
        } else {
          existingOpt.selected = true;
        }
      }

      showToast(`📍 Location Active: ${placeName}`);
      loadFeed(false);
    };

    const onGpsFallback = (err) => {
      // Retry with network-based geolocation if fine GPS times out
      navigator.geolocation.getCurrentPosition(
        onGpsSuccess,
        (secondErr) => {
          btnGpsDetect?.classList.remove('locating');
          console.warn('Geolocation fallback error:', secondErr);
          showToast('📍 Showing All Aizawl & Nearby listings');
          if (locationSelect) locationSelect.value = 'all';
          state.currentLocation = 'all';
          loadFeed(false);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      onGpsSuccess,
      onGpsFallback,
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
    );
  }

  locationSelect?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'detect_gps') {
      handleDetectGpsLocation();
    } else {
      state.currentLocation = val;
      if (val !== 'all') {
        showToast(`📍 Filtered by location: ${val}`);
      } else {
        showToast(`📍 Showing All Aizawl & Nearby listings`);
      }
      loadFeed(false);
    }
  });

  btnGpsDetect?.addEventListener('click', () => {
    handleDetectGpsLocation();
  });

  // Category Pills Nav
  categoriesNav?.addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;

    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    state.currentCategory = chip.dataset.category;
    loadFeed();
  });

  // Filter Modal Controls
  filterModalBtn?.addEventListener('click', () => {
    filterModal?.classList.remove('hidden');
  });

  closeFilterModalBtn?.addEventListener('click', () => {
    filterModal?.classList.add('hidden');
  });

  priceRange?.addEventListener('input', (e) => {
    if (priceValueDisplay) priceValueDisplay.textContent = `₹${e.target.value}`;
  });

  applyFilterModalBtn?.addEventListener('click', () => {
    // Collect Checked Conditions
    const checked = Array.from(document.querySelectorAll('input[name="condition"]:checked'))
      .map(cb => cb.value);
    
    state.selectedConditions = checked;
    if (priceRange) state.maxPrice = Number(priceRange.value);

    filterModal?.classList.add('hidden');
    filterModalBtn?.classList.toggle('active', checked.length > 0 || state.maxPrice < 5000);
    loadFeed();
  });

  resetFilterModalBtn?.addEventListener('click', () => {
    document.querySelectorAll('input[name="condition"]').forEach(cb => cb.checked = false);
    if (priceRange) priceRange.value = 5000;
    if (priceValueDisplay) priceValueDisplay.textContent = '₹5000';
    state.selectedConditions = [];
    state.maxPrice = 5000;
    filterModalBtn?.classList.remove('active');
  });

  resetFiltersBtn?.addEventListener('click', () => {
    resetFilterModalBtn?.click();
    state.currentCategory = 'all';
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.cat-chip[data-category="all"]')?.classList.add('active');
    loadFeed();
  });

  document.getElementById('emptyResetBtn')?.addEventListener('click', () => {
    resetFiltersBtn?.click();
  });

  const handleResetDb = () => {
    window.api.resetDatabase();
    state.currentCategory = 'all';
    state.searchQuery = '';
    state.selectedConditions = [];
    state.maxPrice = 5000;
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.cat-chip[data-category="all"]')?.classList.add('active');
    loadFeed();
    showToast('🔄 All sample items restored successfully!');
  };

  document.getElementById('btnRestoreSampleData')?.addEventListener('click', handleResetDb);
  document.getElementById('btnResetDb')?.addEventListener('click', handleResetDb);

  function updateActiveFiltersUI() {
    const hasSearch = Boolean(state.searchQuery);
    const hasCategory = state.currentCategory !== 'all';
    const hasConditions = state.selectedConditions.length > 0;
    const hasPrice = state.maxPrice < 5000;

    if (!hasSearch && !hasCategory && !hasConditions && !hasPrice) {
      activeFiltersBar?.classList.add('hidden');
      return;
    }

    activeFiltersBar?.classList.remove('hidden');
    let tagsHtml = '';

    if (hasSearch) {
      tagsHtml += `<span class="check-chip">🔍 "${escapeHtml(state.searchQuery)}"</span>`;
    }
    if (hasCategory) {
      tagsHtml += `<span class="check-chip">${state.currentCategory}</span>`;
    }
    if (hasConditions) {
      tagsHtml += `<span class="check-chip">${state.selectedConditions.join(', ')}</span>`;
    }
    if (hasPrice) {
      tagsHtml += `<span class="check-chip">Under ₹${state.maxPrice}</span>`;
    }

    if (filterTags) filterTags.innerHTML = tagsHtml;
  }

  /* ==========================================================================
     5. BOTTOM NAVIGATION & TABS
     ========================================================================== */

  function updateFavoriteBadge() {
    const favCount = window.api.getFavoriteIds().length;
    if (favBadge) {
      if (favCount > 0) {
        favBadge.textContent = favCount;
        favBadge.classList.remove('hidden');
      } else {
        favBadge.classList.add('hidden');
      }
    }
  }

  /* ==========================================================================
     6. GUIDE & ACCOUNT MODAL CONTROLLER
     ========================================================================== */

  const btnHowItWorks = document.getElementById('btnHowItWorks');
  btnHowItWorks?.addEventListener('click', () => {
    if (infoModalContent) {
      infoModalContent.innerHTML = `
        <h2 style="font-family:'Outfit'; margin-bottom:12px;">💡 How PR Marketplace Works</h2>
        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5; margin-bottom:14px;">
          PR Marketplace is a lightweight P2P local marketplace designed to connect campus students and community members directly.
        </p>
        
        <div style="background:var(--bg-surface); padding:12px; border-radius:10px; font-size:0.82rem; margin-bottom:12px;">
          <strong>1. Browse or Post:</strong> Find textbooks, notes, lab coat, or clothing. Or list your own item in 30 seconds!
        </div>
        
        <div style="background:var(--bg-surface); padding:12px; border-radius:10px; font-size:0.82rem; margin-bottom:12px;">
          <strong>2. Direct Contact:</strong> No middleman fees or complicated carts. Tap "Chat on WhatsApp" or "Instagram" to message the seller directly.
        </div>
        
        <div style="background:var(--bg-surface); padding:12px; border-radius:10px; font-size:0.82rem;">
          <strong>3. Safe Meetup:</strong> Inspect the item in person at your campus library or student center, pay via cash or UPI/Venmo, and complete the deal!
        </div>
      `;
    }
    infoModal?.classList.remove('hidden');
  });

  // Account Section Accordion Toggles
  const btnToggleContactSection = document.getElementById('btnToggleContactSection');
  const contactSectionBody = document.getElementById('contactSectionBody');
  btnToggleContactSection?.addEventListener('click', () => {
    btnToggleContactSection.classList.toggle('open');
    contactSectionBody?.classList.toggle('hidden');
  });

  const btnToggleAboutSection = document.getElementById('btnToggleAboutSection');
  const aboutSectionBody = document.getElementById('aboutSectionBody');
  btnToggleAboutSection?.addEventListener('click', () => {
    btnToggleAboutSection.classList.toggle('open');
    aboutSectionBody?.classList.toggle('hidden');
  });

  // Global Modal Helpers
  window.closeAllModals = function() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  };

  window.openAccountModal = function() {
    window.closeAllModals();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('btnAccount')?.classList.add('active');
    document.getElementById('accountModal')?.classList.remove('hidden');
  };

  const accountModal = document.getElementById('accountModal');
  const btnAccount = document.getElementById('btnAccount');
  const closeAccountModalBtn = document.getElementById('closeAccountModalBtn');
  const btnLogoutUser = document.getElementById('btnLogoutUser');

  btnAccount?.addEventListener('click', (e) => {
    e.preventDefault();
    window.openAccountModal();
  });

  closeAccountModalBtn?.addEventListener('click', () => {
    accountModal?.classList.add('hidden');
    btnAccount?.classList.remove('active');
    navExplore?.classList.add('active');
  });

  /* ==========================================================================
     NOTIFICATIONS SYSTEM
     ========================================================================== */
  const DEFAULT_NOTIFICATIONS = [
    {
      id: 'notif_1',
      itemId: 'sample_item_1',
      itemTitle: 'Organic Chemistry 4th Edition (Paula Yurkanis Bruice)',
      itemImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80',
      senderName: 'Rahul Sharma (Buyer)',
      askerName: 'Rahul Sharma',
      messageText: 'Hi! Is this textbook still available? Can we meet at MZU Library tomorrow?',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      read: false
    },
    {
      id: 'notif_2',
      itemId: 'sample_item_2',
      itemTitle: 'Yamaha F310 Acoustic Guitar with Gig Bag',
      itemImage: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=300&q=80',
      senderName: 'Lalremruata (Buyer)',
      askerName: 'Lalremruata',
      messageText: 'Hello! Does ₹4,200 work for you? I can pick it up today at Zarkawt.',
      timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      read: false
    }
  ];

  function getNotifications() {
    try {
      const stored = localStorage.getItem('pr_notifications');
      return stored ? JSON.parse(stored) : DEFAULT_NOTIFICATIONS;
    } catch (e) {
      return DEFAULT_NOTIFICATIONS;
    }
  }

  function saveNotifications(notifs) {
    try {
      localStorage.setItem('pr_notifications', JSON.stringify(notifs));
    } catch (e) {
      console.warn('Could not save notifications:', e);
    }
    updateNotifBadge();
  }

  function updateNotifBadge() {
    const notifs = getNotifications();
    const unreadCount = notifs.filter(n => !n.read).length;
    if (notifBadge) {
      if (unreadCount > 0) {
        notifBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        notifBadge.classList.remove('hidden');
      } else {
        notifBadge.classList.add('hidden');
      }
    }
  }

  window.addNotification = function(notifData) {
    const notifs = getNotifications();
    const newNotif = {
      id: 'notif_' + Date.now(),
      ...notifData,
      timestamp: new Date().toISOString(),
      read: false
    };
    notifs.unshift(newNotif);
    saveNotifications(notifs);
    renderNotificationsList();
  };

  function timeAgo(isoString) {
    try {
      const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch (e) {
      return 'Recently';
    }
  }

  function renderNotificationsList() {
    if (!notificationsList) return;
    const notifs = getNotifications();

    if (notifs.length === 0) {
      notificationsList.innerHTML = `
        <div class="notif-empty-state">
          <div class="notif-empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <h3 style="font-size:1rem; font-weight:700; color:var(--text-main); margin:0;">No Notifications Yet</h3>
          <p style="font-size:0.8rem; margin:0;">Inquiries and messages from buyers on your posted items will appear here.</p>
        </div>
      `;
      return;
    }

    notificationsList.innerHTML = notifs.map(n => {
      const cleanAsker = n.askerName || (n.privateSender) || (n.senderName || 'Buyer').replace(/\s*\(.*?\)/, '').trim();

      return `
        <div class="notif-card ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" data-item-id="${n.itemId || ''}" data-is-private="${n.isPrivateChat ? 'true' : 'false'}" data-asker-name="${escapeHtml(cleanAsker)}" data-item-title="${escapeHtml(n.itemTitle || '')}" data-inquiry-text="${escapeHtml(n.messageText || '')}">
          <img class="notif-item-thumb" src="${n.itemImage || 'pr_app_icon.jpg'}" alt="Thumbnail" onerror="this.src='pr_app_icon.jpg'">
          <div class="notif-info">
            <div class="notif-title">${escapeHtml(n.senderName)}</div>
            <div class="notif-preview">💬 "${escapeHtml(n.messageText)}"</div>
            <div class="notif-time">On: <strong>${escapeHtml(n.itemTitle)}</strong> • ${timeAgo(n.timestamp)}</div>
            <div style="margin-top:6px;">
              <button type="button" class="btn-notif-pm" data-asker-name="${escapeHtml(cleanAsker)}" data-item-title="${escapeHtml(n.itemTitle || '')}" data-inquiry-text="${escapeHtml(n.messageText || '')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Message Asker Privately</span>
              </button>
            </div>
          </div>
          ${!n.read ? '<div class="notif-unread-dot"></div>' : ''}
        </div>
      `;
    }).join('');

    notificationsList.querySelectorAll('.notif-card').forEach(card => {
      card.addEventListener('click', async () => {
        const notifId = card.dataset.notifId;
        const itemId = card.dataset.itemId;
        const isPrivate = card.dataset.isPrivate === 'true';
        const askerName = card.dataset.askerName;
        const itemTitle = card.dataset.itemTitle;
        const inquiryText = card.dataset.inquiryText;

        // Mark as read
        const currentNotifs = getNotifications();
        const target = currentNotifs.find(n => n.id === notifId);
        if (target) target.read = true;
        saveNotifications(currentNotifs);
        renderNotificationsList();

        // Close notifications modal
        notificationsModal?.classList.add('hidden');
        navNotifications?.classList.remove('active');
        navExplore?.classList.add('active');

        if (askerName) {
          window.openPrivateChat(askerName, false, { itemTitle: itemTitle, initialInquiry: inquiryText });
        } else if (itemId) {
          try {
            const allItems = await window.api.fetchItems({});
            const targetItem = allItems.find(i => String(i.id) === String(itemId)) || allItems[0];
            if (targetItem) {
              window.openItemDetail(targetItem);
            }
          } catch (e) {
            console.error(e);
          }
        }
      });
    });
  }

  btnMarkAllNotifsRead?.addEventListener('click', () => {
    const notifs = getNotifications();
    notifs.forEach(n => n.read = true);
    saveNotifications(notifs);
    renderNotificationsList();
    showToast('✓ All notifications marked as read');
  });

  window.openNotificationsModal = function() {
    window.closeAllModals();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    navNotifications?.classList.add('active');
    renderNotificationsList();
    notificationsModal?.classList.remove('hidden');
  };

  navNotifications?.addEventListener('click', (e) => {
    e.preventDefault();
    window.openNotificationsModal();
  });

  closeNotificationsModalBtn?.addEventListener('click', () => {
    notificationsModal?.classList.add('hidden');
    navNotifications?.classList.remove('active');
    navExplore?.classList.add('active');
  });

  updateNotifBadge();

  /* ==========================================================================
     COMMUNITY ALL CHAT ROOM (OPENS DIRECT PRIVATE CHAT)
     ========================================================================== */
  const DEFAULT_ALL_CHAT = [
    {
      id: 'all_msg_1',
      senderName: 'Rahul (MZU)',
      senderAvatar: 'R',
      text: 'Hey everyone! Is anyone selling 3rd sem civil engineering textbooks or surveying notes?',
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      isMine: false
    },
    {
      id: 'all_msg_2',
      senderName: 'Priya (Science)',
      senderAvatar: 'P',
      text: 'I just posted my Surveying & Mechanics books on the app. Check out my listing or message me privately!',
      timestamp: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
      isMine: false
    },
    {
      id: 'all_msg_3',
      senderName: 'David K.',
      senderAvatar: 'D',
      text: 'Also looking for a study table or chair around Khatla / Zarkawt area. Meetup today works!',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      isMine: false
    }
  ];

  function getAllChatMessages() {
    try {
      const stored = localStorage.getItem('pr_community_all_chat_v1');
      return stored ? JSON.parse(stored) : DEFAULT_ALL_CHAT;
    } catch (e) {
      return DEFAULT_ALL_CHAT;
    }
  }

  function saveAllChatMessages(msgs) {
    try {
      localStorage.setItem('pr_community_all_chat_v1', JSON.stringify(msgs));
    } catch (e) {
      console.warn('Could not save all chat messages:', e);
    }
  }

  function renderAllChatThread() {
    if (!allChatMessagesThread) return;
    const msgs = getAllChatMessages();
    const currentUser = window.api.getCurrentUser();

    allChatMessagesThread.innerHTML = msgs.map(m => {
      const isMine = m.isMine || (currentUser && m.senderEmail && m.senderEmail === currentUser.email);
      const avatarInitial = (m.senderName || 'U').charAt(0).toUpperCase();

      return `
        <div class="all-chat-msg-row ${isMine ? 'mine' : ''}" data-msg-id="${m.id}">
          <div class="all-chat-avatar" style="cursor:pointer;" data-user-name="${escapeHtml(m.senderName || 'User')}" title="Chat with ${escapeHtml(m.senderName || 'User')}">${escapeHtml(avatarInitial)}</div>
          <div class="all-chat-msg-box">
            <div class="all-chat-sender-header">
              <span class="all-chat-sender-name">${escapeHtml(m.senderName || 'Community Member')}</span>
              <span class="all-chat-time">${timeAgo(m.timestamp)}</span>
            </div>

            <div class="all-chat-text">${escapeHtml(m.text)}</div>

            ${!isMine ? `
              <div class="all-chat-actions">
                <button type="button" class="all-chat-dm-btn" data-user-name="${escapeHtml(m.senderName || 'User')}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>Message Privately</span>
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    allChatMessagesThread.scrollTop = allChatMessagesThread.scrollHeight;

    // Attach private message handlers
    allChatMessagesThread.querySelectorAll('.all-chat-dm-btn, .all-chat-avatar').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userName = btn.dataset.userName;
        if (userName && userName !== 'You') {
          window.openPrivateChat(userName, true);
        }
      });
    });
  }

  btnOpenAllChat?.addEventListener('click', () => {
    renderAllChatThread();
    allChatModal?.classList.remove('hidden');
  });

  closeAllChatModalBtn?.addEventListener('click', () => {
    allChatModal?.classList.add('hidden');
  });

  allChatInputForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = allChatMessageInput ? allChatMessageInput.value.trim() : '';
    if (!text) return;

    const currentUser = window.api.getCurrentUser();
    const msgs = getAllChatMessages();
    const newMsg = {
      id: 'all_msg_' + Date.now(),
      senderName: currentUser ? currentUser.fullName : 'You',
      senderEmail: currentUser ? currentUser.email : '',
      senderAvatar: currentUser ? currentUser.fullName.charAt(0).toUpperCase() : 'Y',
      text: text,
      timestamp: new Date().toISOString(),
      isMine: true
    };

    msgs.push(newMsg);
    saveAllChatMessages(msgs);

    if (allChatMessageInput) allChatMessageInput.value = '';
    renderAllChatThread();
  });

  /* ==========================================================================
     DIRECT 1-ON-1 PRIVATE CHAT SYSTEM
     ========================================================================== */
  function getPrivateMessages(recipientName) {
    try {
      const key = `pr_private_chat_${recipientName.replace(/\s+/g, '_').toLowerCase()}`;
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored);

      // Seed realistic initial conversation
      const initialMsgs = [
        {
          id: 'pmsg_init_1',
          senderName: recipientName,
          text: `Hey! I saw your message on PR Marketplace All Chat. How can I help you?`,
          timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          isMine: false
        }
      ];
      localStorage.setItem(key, JSON.stringify(initialMsgs));
      return initialMsgs;
    } catch (e) {
      return [];
    }
  }

  function savePrivateMessages(recipientName, msgs) {
    try {
      const key = `pr_private_chat_${recipientName.replace(/\s+/g, '_').toLowerCase()}`;
      localStorage.setItem(key, JSON.stringify(msgs));
    } catch (e) {
      console.warn('Could not save private messages:', e);
    }
  }

  function renderPrivateChatThread() {
    if (!privateChatMessagesThread || !state.activePrivateChatRecipient) return;
    const recipient = state.activePrivateChatRecipient;
    const msgs = getPrivateMessages(recipient);
    const currentUser = window.api.getCurrentUser();

    if (privateChatRecipientName) privateChatRecipientName.textContent = recipient;
    if (privateChatRecipientAvatar) privateChatRecipientAvatar.textContent = recipient.charAt(0).toUpperCase();

    privateChatMessagesThread.innerHTML = msgs.map(m => {
      const isMine = m.isMine;
      const avatarInitial = (isMine ? (currentUser ? currentUser.fullName : 'You') : recipient).charAt(0).toUpperCase();

      return `
        <div class="all-chat-msg-row ${isMine ? 'mine' : ''}" data-msg-id="${m.id}">
          <div class="all-chat-avatar">${escapeHtml(avatarInitial)}</div>
          <div class="all-chat-msg-box">
            <div class="all-chat-sender-header">
              <span class="all-chat-sender-name">${escapeHtml(isMine ? 'You' : recipient)}</span>
              <span class="all-chat-time">${timeAgo(m.timestamp)}</span>
            </div>
            <div class="all-chat-text">${escapeHtml(m.text)}</div>
          </div>
        </div>
      `;
    }).join('');

    privateChatMessagesThread.scrollTop = privateChatMessagesThread.scrollHeight;
  }

  window.openPrivateChat = function(recipientName, fromAllChat = false, context = null) {
    if (!recipientName) return;
    state.activePrivateChatRecipient = recipientName;
    state.openedPrivateFromAllChat = fromAllChat;

    if (fromAllChat && allChatModal) {
      allChatModal.classList.add('hidden');
    }

    // If initial item context is provided and conversation has <= 1 message, prepend context
    if (context && context.itemTitle) {
      const msgs = getPrivateMessages(recipientName);
      const hasContextAlready = msgs.some(m => m.text && m.text.includes(context.itemTitle));
      if (!hasContextAlready) {
        const contextMsg = {
          id: 'pmsg_ctx_' + Date.now(),
          senderName: recipientName,
          text: context.initialInquiry 
            ? `Inquiry on "${context.itemTitle}": "${context.initialInquiry}"`
            : `Regarding your item listing "${context.itemTitle}"`,
          timestamp: new Date().toISOString(),
          isMine: false
        };
        msgs.unshift(contextMsg);
        savePrivateMessages(recipientName, msgs);
      }
    }

    renderPrivateChatThread();
    privateChatModal?.classList.remove('hidden');
    privateChatMessageInput?.focus();
  };

  btnBackFromPrivateChat?.addEventListener('click', () => {
    privateChatModal?.classList.add('hidden');
    if (state.openedPrivateFromAllChat && allChatModal) {
      allChatModal.classList.remove('hidden');
    }
  });

  closePrivateChatModalBtn?.addEventListener('click', () => {
    privateChatModal?.classList.add('hidden');
  });

  privateChatInputForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = privateChatMessageInput ? privateChatMessageInput.value.trim() : '';
    if (!text || !state.activePrivateChatRecipient) return;

    const recipient = state.activePrivateChatRecipient;
    const msgs = getPrivateMessages(recipient);
    const newMsg = {
      id: 'pmsg_' + Date.now(),
      senderName: 'You',
      text: text,
      timestamp: new Date().toISOString(),
      isMine: true
    };
    msgs.push(newMsg);
    savePrivateMessages(recipient, msgs);
    renderPrivateChatThread();
    if (privateChatMessageInput) privateChatMessageInput.value = '';

    // Simulated responsive interactive recipient auto-reply after 1.2s
    setTimeout(() => {
      const replies = [
        `Sounds great! When and where would be convenient for you to meet up?`,
        `Got it! Let me check and I'll confirm with you shortly.`,
        `Thanks for reaching out privately! That works for me.`,
        `Sure thing! I am around campus today if you want to meet.`
      ];
      const replyText = replies[Math.floor(Math.random() * replies.length)];
      const updatedMsgs = getPrivateMessages(recipient);
      updatedMsgs.push({
        id: 'pmsg_rep_' + Date.now(),
        senderName: recipient,
        text: replyText,
        timestamp: new Date().toISOString(),
        isMine: false
      });
      savePrivateMessages(recipient, updatedMsgs);

      if (state.activePrivateChatRecipient === recipient && !privateChatModal?.classList.contains('hidden')) {
        renderPrivateChatThread();
      }

      // Add notification for incoming direct message
      if (typeof window.addNotification === 'function') {
        window.addNotification({
          itemId: null,
          isPrivateChat: true,
          privateSender: recipient,
          itemTitle: `Private Chat with ${recipient}`,
          itemImage: 'pr_app_icon.jpg',
          senderName: `${recipient} (Private)`,
          messageText: replyText
        });
      }
    }, 1200);
  });

  /* ==========================================================================
     SMART ANDROID MOBILE BACK BUTTON NAVIGATION
     ========================================================================== */
  window.handleAndroidBackButton = function() {
    // 1. Close Zoom Modal if open
    const imageZoomModal = document.getElementById('imageZoomModal');
    if (imageZoomModal && !imageZoomModal.classList.contains('hidden')) {
      imageZoomModal.classList.add('hidden');
      return true;
    }

    // 2. Close Private Chat Modal if open
    if (privateChatModal && !privateChatModal.classList.contains('hidden')) {
      privateChatModal.classList.add('hidden');
      if (state.openedPrivateFromAllChat && allChatModal) {
        allChatModal.classList.remove('hidden');
      }
      return true;
    }

    // 3. Close Community All Chat Modal if open
    if (allChatModal && !allChatModal.classList.contains('hidden')) {
      allChatModal.classList.add('hidden');
      return true;
    }

    // 4. Close Item Detail Modal if open
    if (itemDetailModal && !itemDetailModal.classList.contains('hidden')) {
      itemDetailModal.classList.add('hidden');
      return true;
    }

    // 5. Close Sell Modal if open
    if (sellModal && !sellModal.classList.contains('hidden')) {
      closeSellModal();
      return true;
    }

    // 6. Close Filter Modal if open
    if (filterModal && !filterModal.classList.contains('hidden')) {
      filterModal.classList.add('hidden');
      return true;
    }

    // 7. Close Guide Info Modal if open
    if (infoModal && !infoModal.classList.contains('hidden')) {
      infoModal.classList.add('hidden');
      return true;
    }

    // 8. Close Account Modal if open -> Return to Explore
    if (accountModal && !accountModal.classList.contains('hidden')) {
      accountModal.classList.add('hidden');
      btnAccount?.classList.remove('active');
      navExplore?.click();
      return true;
    }

    // 9. Close Notifications Modal if open -> Return to Explore
    if (notificationsModal && !notificationsModal.classList.contains('hidden')) {
      notificationsModal.classList.add('hidden');
      navNotifications?.classList.remove('active');
      navExplore?.click();
      return true;
    }

    // 10. If on Favorites Tab, navigate back to Explore (Home) Tab
    if (navFavorites && navFavorites.classList.contains('active')) {
      navExplore?.click();
      return true;
    }

    // 11. If Search or Category Filter is active, reset to Home Explore
    if (state.searchQuery || state.currentCategory !== 'all') {
      state.searchQuery = '';
      if (searchInput) searchInput.value = '';
      clearSearchBtn?.classList.add('hidden');
      document.querySelector('.cat-chip[data-category="all"]')?.click();
      return true;
    }

    return false; // Already on Home/Explore default view
  };

  function resetAllFormInputs() {
    // 1. Reset Sell / Post Item Form
    const sellFormEl = document.getElementById('sellForm');
    if (sellFormEl) sellFormEl.reset();
    
    // Clear image previews & internal state
    state.uploadedImageDataUrl = null;
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const imagePreview = document.getElementById('imagePreview');

    if (imagePreviewContainer) imagePreviewContainer.classList.add('hidden');
    if (uploadPlaceholder) uploadPlaceholder.classList.remove('hidden');
    if (imagePreview) imagePreview.src = '';

    // 2. Reset Sign In & Log In Form Input Fields
    const regFullName = document.getElementById('regFullName');
    const regEmail = document.getElementById('regEmail');
    const regPhone = document.getElementById('regPhone');
    const regPassword = document.getElementById('regPassword');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');

    if (regFullName) regFullName.value = '';
    if (regEmail) regEmail.value = '';
    if (regPhone) regPhone.value = '';
    if (regPassword) regPassword.value = '';
    if (loginEmail) loginEmail.value = '';
    if (loginPassword) loginPassword.value = '';

    // 3. Clear Seller Inputs
    const sellerNameInput = document.getElementById('sellerName');
    const sellerPhoneInput = document.getElementById('sellerPhone');
    if (sellerNameInput) sellerNameInput.value = '';
    if (sellerPhoneInput) sellerPhoneInput.value = '';
  }

  btnLogoutUser?.addEventListener('click', () => {
    // 1. Close Account Drawer
    accountModal?.classList.add('hidden');

    // 2. Smooth fade-out & scale-down of marketplace app viewport
    const appViewport = document.getElementById('appViewport');
    if (appViewport) {
      appViewport.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      appViewport.style.opacity = '0';
      appViewport.style.transform = 'scale(0.98)';
    }

    showToast('🚪 Logging out of account...');

    setTimeout(() => {
      window.api.logoutUser();
      state.isDevAdminMode = false;
      resetAllFormInputs();

      // 3. Hide Viewport and reset inline styles
      if (appViewport) {
        appViewport.classList.add('hidden');
        appViewport.style.opacity = '1';
        appViewport.style.transform = 'none';
      }

      // 4. Smooth fade-in of clean white Auth Overlay
      if (authOverlay) {
        authOverlay.style.opacity = '0';
        authOverlay.classList.remove('hidden');
        authOverlay.style.transition = 'opacity 0.4s ease';
        requestAnimationFrame(() => {
          authOverlay.style.opacity = '1';
        });
      }
    }, 450);
  });

  const btnExitApp = document.getElementById('btnExitApp');

  btnExitApp?.addEventListener('click', () => {
    showToast('👋 Exiting PR Application...');
    
    // 1. Android Native App / Cordova Exit
    if (navigator.app && typeof navigator.app.exitApp === 'function') {
      navigator.app.exitApp();
      return;
    }
    if (navigator.device && typeof navigator.device.exitApp === 'function') {
      navigator.device.exitApp();
      return;
    }

    // 2. Standalone Desktop Application Window Exit
    try {
      window.open('', '_self', '');
      window.close();
    } catch (err) {
      console.warn('Window close fallback:', err);
    }

    // 3. Fallback Screen if window.close is blocked by browser security
    document.body.innerHTML = `
      <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#FFFFFF; color:#0F172A; font-family:sans-serif; text-align:center; padding:20px;">
        <img src="pr_app_icon.jpg" style="width:90px; height:90px; border-radius:20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); margin-bottom:20px;">
        <h2 style="margin:0; font-size:1.6rem; font-weight:800; color:#0F172A;">PR Application Terminated</h2>
        <p style="color:#64748B; font-size:0.9rem; margin-top:8px;">You have safely exited the application.</p>
      </div>
    `;
  });

  // ULTRA-FAST STARTUP SPLASH SCREEN CONTROLLER
  const splashScreen = document.getElementById('splashScreen');
  const authOverlay = document.getElementById('authOverlay');
  const appViewport = document.getElementById('appViewport');

  // Ensure both screens remain hidden under splash overlay at start to eliminate flashing
  if (authOverlay) authOverlay.classList.add('hidden');
  if (appViewport) appViewport.classList.add('hidden');

  setTimeout(() => {
    if (splashScreen) {
      splashScreen.classList.add('fade-out');
      setTimeout(() => {
        splashScreen.style.display = 'none';
        checkAuthSession();
      }, 150);
    } else {
      checkAuthSession();
    }
  }, 250); // Ultra-fast 250ms startup screen

  // AUTHENTICATION SESSION CONTROLLER
  function checkAuthSession() {
    const user = window.api.getCurrentUser();
    if (!user) {
      authOverlay?.classList.remove('hidden');
      appViewport?.classList.add('hidden');
    } else {
      authOverlay?.classList.add('hidden');
      appViewport?.classList.remove('hidden');
      syncUserToFormInputs(user);
    }
  }

  function syncUserToFormInputs(user) {
    if (!user) return;
    const sellerNameInput = document.getElementById('sellerName');
    const sellerPhoneInput = document.getElementById('sellerPhone');
    if (sellerNameInput) sellerNameInput.value = user.fullName || '';
    if (sellerPhoneInput) sellerPhoneInput.value = user.phone || '';

    // Update Account Drawer & Profile Card Header Info
    const accountUserName = document.getElementById('accountUserName');
    const accountUserEmail = document.getElementById('accountUserEmail');
    const accountUserAvatar = document.getElementById('accountUserAvatar');

    if (accountUserName) accountUserName.textContent = user.fullName || 'Local Community Member';
    if (accountUserEmail) accountUserEmail.textContent = user.email || (user.phone ? `📞 +91 ${user.phone}` : 'Registered Account');
    if (accountUserAvatar && user.fullName) {
      accountUserAvatar.textContent = user.fullName.charAt(0).toUpperCase();
    }
  }

  // RENDER SAVED ACCOUNTS PICKER (MULTI-ACCOUNT REMEMBER ME)
  function renderSavedAccountsUI() {
    const container = document.getElementById('savedAccountsContainer');
    const chipsBox = document.getElementById('savedAccountsChips');
    if (!container || !chipsBox) return;

    const saved = window.api.getSavedDeviceAccounts();

    if (!saved || saved.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    chipsBox.innerHTML = saved.map((acc, idx) => `
      <div class="saved-account-chip" data-idx="${idx}">
        <div class="saved-account-info">
          <span class="saved-account-email">📧 ${escapeHtml(acc.email)}</span>
          <span class="saved-account-name">👤 ${escapeHtml(acc.fullName)} ${acc.phone ? '• 📞 ' + escapeHtml(acc.phone) : ''}</span>
        </div>
        <button type="button" class="btn-remove-saved-account" data-email="${escapeHtml(acc.email)}" title="Remove account from device">✕</button>
      </div>
    `).join('');

    // Attach chip click listener to pre-fill login inputs
    chipsBox.querySelectorAll('.saved-account-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.btn-remove-saved-account');
        if (removeBtn) {
          e.stopPropagation();
          const emailToRemove = removeBtn.dataset.email;
          window.api.removeAccountFromDevice(emailToRemove);
          showToast('🗑️ Removed saved account from device');
          renderSavedAccountsUI();
          return;
        }

        const idx = parseInt(chip.dataset.idx, 10);
        const acc = saved[idx];
        if (acc) {
          const loginEmail = document.getElementById('loginEmail');
          const loginPassword = document.getElementById('loginPassword');
          if (loginEmail) loginEmail.value = acc.email;
          if (loginPassword) loginPassword.value = acc.password;
          showToast(`⚡ Loaded credentials for ${acc.email}`);
        }
      });
    });
  }

  // Auth Tab Toggles
  const btnTabSignIn = document.getElementById('btnTabSignIn');
  const btnTabLogIn = document.getElementById('btnTabLogIn');
  const authSignInForm = document.getElementById('authSignInForm');
  const authLogInForm = document.getElementById('authLogInForm');
  const linkSwitchToLogin = document.getElementById('linkSwitchToLogin');
  const linkSwitchToRegister = document.getElementById('linkSwitchToRegister');

  function showSignInTab() {
    btnTabSignIn?.classList.add('active');
    btnTabLogIn?.classList.remove('active');
    authSignInForm?.classList.remove('hidden');
    authLogInForm?.classList.add('hidden');
  }

  function showLogInTab() {
    btnTabLogIn?.classList.add('active');
    btnTabSignIn?.classList.remove('active');
    authLogInForm?.classList.remove('hidden');
    authSignInForm?.classList.add('hidden');

    // Auto pre-fill login inputs from register form if available
    const regEmail = document.getElementById('regEmail')?.value.trim();
    const loginEmail = document.getElementById('loginEmail');
    if (regEmail && loginEmail && !loginEmail.value) {
      loginEmail.value = regEmail;
    }
    const regPassword = document.getElementById('regPassword')?.value;
    const loginPassword = document.getElementById('loginPassword');
    if (regPassword && loginPassword && !loginPassword.value) {
      loginPassword.value = regPassword;
    }

    renderSavedAccountsUI();
  }

  btnTabSignIn?.addEventListener('click', showSignInTab);
  btnTabLogIn?.addEventListener('click', showLogInTab);
  linkSwitchToLogin?.addEventListener('click', (e) => { e.preventDefault(); showLogInTab(); });
  linkSwitchToRegister?.addEventListener('click', (e) => { e.preventDefault(); showSignInTab(); });

  // Password Visibility Toggle Button Handler
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    });
  });

  // Handle Sign In (Register) Submission
  authSignInForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('regFullName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value.trim();

    if (!fullName || !email || !phone || !password) {
      showToast('⚠️ Please fill in all required fields');
      return;
    }

    // 1. STRICT EMAIL VALIDATION: Must end with @gmail.com
    if (!email.endsWith('@gmail.com')) {
      showToast('⚠️ Invalid Email! Email must end with @gmail.com (e.g. user@gmail.com)');
      return;
    }

    // 2. STRICT PHONE NUMBER VALIDATION: Cannot exceed 10 digits (must be 10 digits)
    const phoneDigits = phone.replace(/[^\d]/g, '');
    if (phoneDigits.length > 10) {
      showToast('⚠️ Invalid Phone Number! Phone number cannot exceed 10 digits.');
      return;
    }
    if (phoneDigits.length < 10) {
      showToast('⚠️ Invalid Phone Number! Phone number must be exactly 10 digits (e.g. 9876543210)');
      return;
    }

    // 3. STRICT PASSWORD VALIDATION: Must contain both letters (A-Z) AND numbers (0-9)
    const hasAlpha = /[a-zA-Z]/.test(password);
    const hasNumeric = /[0-9]/.test(password);
    if (!hasAlpha || !hasNumeric) {
      showToast('⚠️ Weak Password! Password must contain both letters (A-Z) and numbers (0-9)');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitSignIn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Creating Account...</span>';
    }

    try {
      const newUser = await window.api.signUpUser({ fullName, email, phone: phoneDigits, password });
      window.api.logoutUser(); // Lock app until OTP is verified!
      triggerOtpVerification(newUser);
    } catch (err) {
      console.error('Sign In error:', err);
      if (err.message && err.message.includes('EMAIL')) {
        showToast('⚠️ Email already registered! Please Log In instead.');
        showLogInTab();
      } else if (err.message && err.message.includes('PHONE')) {
        showToast('⚠️ Phone number already registered! Please Log In instead.');
        showLogInTab();
      } else {
        showToast('⚠️ Failed to create account. Try again.');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Create Account & Access App</span>';
      }
    }
  });

  // 4-DIGIT OTP VERIFICATION SYSTEM CONTROLLER
  let pendingUserForOtp = null;
  let currentOtpCode = null;
  let otpResendTimer = null;

  function triggerOtpVerification(user) {
    pendingUserForOtp = user;
    currentOtpCode = Math.floor(1000 + Math.random() * 9000).toString();

    const otpOverlay = document.getElementById('otpOverlay');
    const authOverlay = document.getElementById('authOverlay');
    const otpDisplayEmail = document.getElementById('otpDisplayEmail');
    const otpDisplayPhone = document.getElementById('otpDisplayPhone');
    const otpDisplayCode = document.getElementById('otpDisplayCode');

    if (otpDisplayEmail) otpDisplayEmail.textContent = user.email;
    if (otpDisplayPhone) otpDisplayPhone.textContent = `+91 ${user.phone}`;
    if (otpDisplayCode) otpDisplayCode.textContent = currentOtpCode;

    authOverlay?.classList.add('hidden');
    otpOverlay?.classList.remove('hidden');

    // Reset OTP Digits
    [1,2,3,4].forEach(i => {
      const box = document.getElementById(`otpBox${i}`);
      if (box) box.value = '';
    });

    document.getElementById('otpBox1')?.focus();

    // Notify user of sent OTP code (Simulated Device Inbox)
    showToast(`📩 OTP Code sent to ${user.email} & +91 ${user.phone}: ${currentOtpCode}`, 10000);

    startOtpResendTimer();
    listenForWebOtp();
  }

  function startOtpResendTimer() {
    let secondsLeft = 30;
    const otpCountdownText = document.getElementById('otpCountdownText');
    const linkResendOTP = document.getElementById('linkResendOTP');
    
    if (linkResendOTP) linkResendOTP.style.pointerEvents = 'none';
    if (linkResendOTP) linkResendOTP.style.opacity = '0.5';

    if (otpResendTimer) clearInterval(otpResendTimer);
    
    otpResendTimer = setInterval(() => {
      secondsLeft--;
      if (otpCountdownText) otpCountdownText.textContent = `(${secondsLeft}s)`;
      if (secondsLeft <= 0) {
        clearInterval(otpResendTimer);
        if (otpCountdownText) otpCountdownText.textContent = '';
        if (linkResendOTP) {
          linkResendOTP.style.pointerEvents = 'auto';
          linkResendOTP.style.opacity = '1';
        }
      }
    }, 1000);
  }

  // Web OTP API Machine-Level Inbox Listener Simulation
  function listenForWebOtp() {
    if ('OTPCredential' in window) {
      const ac = new AbortController();
      navigator.credentials.get({
        otp: { transport: ["sms"] },
        signal: ac.signal
      }).then(otp => {
        if (otp && otp.code) {
          fillOtpCode(otp.code);
          verifySubmittedOtp();
        }
      }).catch(err => {
        console.log('Web OTP listener:', err);
      });
    }
  }

  function fillOtpCode(code) {
    if (!code || code.length < 4) return;
    const digits = code.toString().split('');
    [1,2,3,4].forEach((i, idx) => {
      const box = document.getElementById(`otpBox${i}`);
      if (box) box.value = digits[idx] || '';
    });
  }

  // Auto-Focus Next & Previous Input Helper
  [1, 2, 3, 4].forEach(i => {
    const box = document.getElementById(`otpBox${i}`);
    box?.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val && i < 4) {
        document.getElementById(`otpBox${i + 1}`)?.focus();
      }
    });

    box?.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 1) {
        document.getElementById(`otpBox${i - 1}`)?.focus();
      }
    });

    box?.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{4}$/.test(pastedData)) {
        fillOtpCode(pastedData);
      }
    });
  });

  // Auto-Detect OTP from Inbox Button
  const btnAutoDetectOTP = document.getElementById('btnAutoDetectOTP');
  btnAutoDetectOTP?.addEventListener('click', () => {
    if (!currentOtpCode) return;
    fillOtpCode(currentOtpCode);
    showToast('⚡ Machine Level: OTP auto-extracted from device inbox!');
    setTimeout(verifySubmittedOtp, 500);
  });

  // Verify OTP Action
  const btnVerifyOTP = document.getElementById('btnVerifyOTP');
  btnVerifyOTP?.addEventListener('click', verifySubmittedOtp);

  function verifySubmittedOtp() {
    const codeEntered = [1,2,3,4].map(i => document.getElementById(`otpBox${i}`)?.value || '').join('');

    if (codeEntered.length < 4) {
      showToast('⚠️ Please enter the complete 4-digit OTP code');
      return;
    }

    if (codeEntered !== currentOtpCode) {
      showToast('❌ Incorrect OTP code! Please check your inbox or click Resend.');
      return;
    }

    // OTP SUCCESS! Grant Access to Application
    if (pendingUserForOtp) {
      window.api.setCurrentUser(pendingUserForOtp);
      window.api.saveAccountToDevice(pendingUserForOtp);
      showToast(`🎉 OTP Verified! Welcome to PR, ${pendingUserForOtp.fullName}.`);
    } else {
      showToast('🎉 OTP Verified successfully!');
    }

    const otpOverlay = document.getElementById('otpOverlay');
    const appViewport = document.getElementById('appViewport');

    otpOverlay?.classList.add('hidden');
    appViewport?.classList.remove('hidden');

    if (pendingUserForOtp) {
      syncUserToFormInputs(pendingUserForOtp);
      pendingUserForOtp = null;
    }
    loadFeed();
  }

  // Resend OTP Link
  const linkResendOTP = document.getElementById('linkResendOTP');
  linkResendOTP?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!pendingUserForOtp) return;
    currentOtpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const otpDisplayCode = document.getElementById('otpDisplayCode');
    if (otpDisplayCode) otpDisplayCode.textContent = currentOtpCode;
    showToast(`📩 New OTP Code sent to ${pendingUserForOtp.email} & +91 ${pendingUserForOtp.phone}: ${currentOtpCode}`, 10000);
    fillOtpCode('');
    document.getElementById('otpBox1')?.focus();
    startOtpResendTimer();
  });

  // Handle Log In Submission
  authLogInForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailOrPhone = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!emailOrPhone || !password) {
      showToast('⚠️ Please enter your email/phone and password');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitLogIn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Logging In...</span>';
    }

    try {
      const user = await window.api.logInUser(emailOrPhone, password);
      
      const chkRememberMe = document.getElementById('chkRememberMe');
      if (chkRememberMe && chkRememberMe.checked) {
        window.api.saveAccountToDevice({
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          password: password
        });
      }

      showToast(`🔓 Welcome back, ${user.fullName}!`);
      authOverlay?.classList.add('hidden');
      appViewport?.classList.remove('hidden');
      syncUserToFormInputs(user);
      loadFeed();
    } catch (err) {
      console.error('Log In error:', err);
      if (err.message === 'GMAIL_NOT_FOUND' || err.message === 'USER_NOT_FOUND') {
        showToast('❌ Account Not Found! Please check your email/phone or register a new account.');
      } else if (err.message === 'GMAIL_PASSWORD_MISMATCH' || err.message === 'INVALID_PASSWORD') {
        showToast('❌ Incorrect Password! Please verify your password and try again.');
      } else {
        showToast('⚠️ Log In failed. Please check your credentials and network connection.');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Log In to Account</span>';
      }
    }
  });

  closeInfoModalBtn?.addEventListener('click', () => {
    infoModal?.classList.add('hidden');
  });

  /* ==========================================================================
     7. TOAST NOTIFICATIONS & HELPERS
     ========================================================================== */

  function showToast(message, duration = 2500) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeRegExp(str) {
    if (!str) return '';
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ==========================================================================
     8. BOTTOM NAVIGATION CONTROLLER
     ========================================================================== */
  const bottomNav = document.querySelector('.bottom-nav');
  bottomNav?.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('.nav-item, .nav-sell-btn');
    if (!targetBtn) return;

    const id = targetBtn.id;
    if (id === 'btnAccount') {
      window.openAccountModal();
    } else if (id === 'navFavorites') {
      state.currentTab = 'favorites';
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      targetBtn.classList.add('active');
      loadFeed();
    } else if (id === 'navExplore') {
      state.currentTab = 'explore';
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      targetBtn.classList.add('active');
      loadFeed();
    } else if (id === 'openSellModalBtn') {
      openSellModal();
    }
  });

  /* ==========================================================================
     10. MOBILE APPLICATION DOWNLOAD & PWA INSTALL CONTROLLER
     ========================================================================== */
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('📱 Mobile app installation prompt captured');
  });

  const triggerMobileAppDownload = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('🎉 PR Marketplace downloaded & installed to your phone!');
      }
      deferredPrompt = null;
    } else {
      // Guide for iOS Safari or Chrome when prompt is auto-handled
      showToast('📱 To download on phone: Tap Chrome menu (⋮) or Safari Share (⎋) & select "Add to Home Screen"');
    }
  };

  document.getElementById('btnDownloadApp')?.addEventListener('click', triggerMobileAppDownload);
  document.getElementById('btnDownloadAppAccount')?.addEventListener('click', triggerMobileAppDownload);

  // AUTO FULLSCREEN ON FIRST USER INTERACTION
  function enableAutoFullscreen() {
    const docEl = document.documentElement;
    const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    if (requestFs && !document.fullscreenElement) {
      requestFs.call(docEl).catch(() => {});
    }
  }

  /* ==========================================================================
     11. INTERACTIVE IMAGE ZOOM LIGHTBOX CONTROLLER (ONLY IMAGES ZOOMABLE)
     ========================================================================== */
  const imageZoomModal = document.getElementById('imageZoomModal');
  const zoomModalImg = document.getElementById('zoomModalImg');
  const zoomLevelDisplay = document.getElementById('zoomLevelDisplay');
  const btnCloseZoomModal = document.getElementById('btnCloseZoomModal');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomReset = document.getElementById('btnZoomReset');
  const zoomImageContainer = document.getElementById('zoomImageContainer');

  let currentZoom = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let lastTapTime = 0;

  function updateZoomTransform() {
    if (!zoomModalImg) return;
    if (currentZoom <= 1.0) {
      panX = 0;
      panY = 0;
    }
    zoomModalImg.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
    if (zoomLevelDisplay) {
      zoomLevelDisplay.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  window.openImageZoomModal = function(src, alt = 'Zoom Image') {
    if (!imageZoomModal || !zoomModalImg) return;
    zoomModalImg.src = src;
    zoomModalImg.alt = alt;
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    updateZoomTransform();
    imageZoomModal.classList.remove('hidden');
  };

  function closeZoomModal() {
    if (!imageZoomModal) return;
    imageZoomModal.classList.add('hidden');
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    updateZoomTransform();
  }

  btnCloseZoomModal?.addEventListener('click', closeZoomModal);

  imageZoomModal?.addEventListener('click', (e) => {
    if (e.target === imageZoomModal || e.target === zoomImageContainer) {
      closeZoomModal();
    }
  });

  btnZoomIn?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentZoom = Math.min(4.0, Math.round((currentZoom + 0.5) * 100) / 100);
    updateZoomTransform();
  });

  btnZoomOut?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentZoom = Math.max(1.0, Math.round((currentZoom - 0.5) * 100) / 100);
    if (currentZoom <= 1.0) { panX = 0; panY = 0; }
    updateZoomTransform();
  });

  btnZoomReset?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    updateZoomTransform();
  });

  // Double-tap on image to Zoom In / Reset
  zoomModalImg?.addEventListener('click', (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapTime < 300) {
      if (currentZoom > 1.0) {
        currentZoom = 1.0;
        panX = 0;
        panY = 0;
      } else {
        currentZoom = 2.5;
      }
      updateZoomTransform();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
  });

  // Touch Pinch-to-Zoom & Pan handling inside Lightbox
  let initialPinchDist = null;
  let initialPinchScale = 1.0;

  zoomImageContainer?.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDist = Math.hypot(dx, dy);
      initialPinchScale = currentZoom;
    } else if (e.touches.length === 1 && currentZoom > 1.0) {
      isDragging = true;
      startX = e.touches[0].clientX - panX;
      startY = e.touches[0].clientY - panY;
    }
  }, { passive: true });

  zoomImageContainer?.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / initialPinchDist;
      currentZoom = Math.min(4.0, Math.max(1.0, Math.round(initialPinchScale * factor * 100) / 100));
      updateZoomTransform();
    } else if (e.touches.length === 1 && isDragging && currentZoom > 1.0) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;
      updateZoomTransform();
    }
  }, { passive: true });

  zoomImageContainer?.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      initialPinchDist = null;
    }
    if (e.touches.length === 0) {
      isDragging = false;
    }
  }, { passive: true });

  // Initial Load
  loadFeed();
});
