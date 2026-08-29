/**
 * PR MARKETPLACE - ACCOUNT PANEL
 *
 * Profile summary, My Listings, the database connection card, install prompt
 * and password change.
 */

import {
  escapeHtml, formatPrice, timeAgo, showToast, openModal, closeModal,
  confirmAction, describeError, initials, PLACEHOLDER_IMAGE
} from './ui.js';

let els = {};
let hooks = {};
let deferredInstallPrompt = null;

export function initAccount(injected) {
  hooks = injected;          // { onEdit, onOpenItem, onFeedChanged, onSignedOut }

  els = {
    modal: document.getElementById('accountModal'),
    avatar: document.getElementById('accountUserAvatar'),
    name: document.getElementById('accountUserName'),
    email: document.getElementById('accountUserEmail'),
    listings: document.getElementById('myListingsList'),
    dbDot: document.getElementById('dbStatusDot'),
    dbText: document.getElementById('dbStatusText'),
    urlInput: document.getElementById('supabaseUrlInput'),
    keyInput: document.getElementById('supabaseKeyInput'),
    installHint: document.getElementById('installHintText')
  };

  wireSections();
  wireOpenClose();
  wireDatabaseCard();
  wireInstall();
  wireSecurity();
  wireListings();
}

export function isAccountOpen() {
  return Boolean(els.modal) && !els.modal.classList.contains('hidden');
}

/* ================================================================== open === */

export async function openAccount() {
  renderProfile();
  renderConnectionStatus();
  openModal(els.modal);
  document.getElementById('btnAccount')?.classList.add('active');
  await renderMyListings();
}

export function closeAccount() {
  closeModal(els.modal);
  document.getElementById('btnAccount')?.classList.remove('active');
}

function renderProfile() {
  const user = window.api.getCurrentUser();
  if (!user) return;

  if (els.avatar) els.avatar.textContent = initials(user.fullName, 'P');
  if (els.name) els.name.textContent = user.fullName || 'PR Marketplace member';
  if (els.email) els.email.textContent = user.email || '';
}

/* ========================================================== my listings === */

function wireListings() {
  els.listings?.addEventListener('click', async event => {
    const button = event.target.closest('[data-listing-action]');
    if (!button) return;

    const { listingAction: action, id, title } = button.dataset;

    if (action === 'view') {
      closeAccount();
      hooks.onOpenItem?.(id);
      return;
    }

    if (action === 'edit') {
      const item = await window.api.fetchItemById(id);
      if (!item) return;
      closeAccount();
      hooks.onEdit?.(item);
      return;
    }

    if (action === 'sold') {
      await run(() => window.api.markItemAsSold(id), 'Marked as sold.');
      return;
    }

    if (action === 'relist') {
      await run(() => window.api.relistItem(id), 'Back on sale.');
      return;
    }

    if (action === 'delete') {
      const ok = await confirmAction({
        title: 'Delete this listing?',
        message: `“${title}” and its photo are removed for good. This cannot be undone.`,
        confirmLabel: 'Delete listing'
      });
      if (ok) await run(() => window.api.deleteItem(id), 'Listing deleted.');
    }
  });
}

async function run(work, message) {
  try {
    await work();
    showToast(message);
    await renderMyListings();
    hooks.onFeedChanged?.();
  } catch (err) {
    showToast(describeError(err));
  }
}

async function renderMyListings() {
  if (!els.listings) return;

  const user = window.api.getCurrentUser();
  if (!user) {
    els.listings.innerHTML = '<p class="section-subtitle">Log in to see your listings.</p>';
    return;
  }

  els.listings.innerHTML = '<p class="section-subtitle">Loading your listings…</p>';

  try {
    const { items } = await window.api.fetchItems({ sellerId: user.id, sort: 'newest', pageSize: 50 });

    if (!items.length) {
      els.listings.innerHTML = `
        <div class="my-listings-empty">
          <p>You haven't posted anything yet.</p>
          <button type="button" class="btn btn-primary" id="btnPostFirstItem">Post your first item</button>
        </div>`;
      document.getElementById('btnPostFirstItem')?.addEventListener('click', () => {
        closeAccount();
        document.getElementById('openSellModalBtn')?.click();
      });
      return;
    }

    els.listings.innerHTML = items.map(listingRow).join('');
  } catch (err) {
    els.listings.innerHTML = `<p class="section-subtitle">${escapeHtml(describeError(err))}</p>`;
  }
}

function listingRow(item) {
  const image = item.imageUrl || PLACEHOLDER_IMAGE;
  const safeTitle = escapeHtml(item.title);

  return `
    <div class="my-listing-row ${item.isSold ? 'is-sold' : ''}">
      <img class="my-listing-thumb" src="${escapeHtml(image)}" alt="" loading="lazy">

      <div class="my-listing-info">
        <span class="my-listing-title">${safeTitle}</span>
        <span class="my-listing-meta">
          ${escapeHtml(formatPrice(item.price))} · ${escapeHtml(item.category)} · ${escapeHtml(timeAgo(item.createdAt))}
        </span>
        ${item.isSold ? '<span class="my-listing-flag">Sold</span>' : ''}
      </div>

      <div class="my-listing-actions">
        <button type="button" class="listing-action" data-listing-action="view" data-id="${escapeHtml(item.id)}" title="View">View</button>
        <button type="button" class="listing-action" data-listing-action="edit" data-id="${escapeHtml(item.id)}" title="Edit">Edit</button>
        ${item.isSold
          ? `<button type="button" class="listing-action" data-listing-action="relist" data-id="${escapeHtml(item.id)}">Relist</button>`
          : `<button type="button" class="listing-action" data-listing-action="sold" data-id="${escapeHtml(item.id)}">Sold</button>`}
        <button type="button" class="listing-action danger" data-listing-action="delete"
                data-id="${escapeHtml(item.id)}" data-title="${safeTitle}">Delete</button>
      </div>
    </div>`;
}

/* ============================================================== database === */

function wireDatabaseCard() {
  document.getElementById('btnConnectSupabase')?.addEventListener('click', () => {
    const url = els.urlInput?.value || '';
    const key = els.keyInput?.value || '';

    try {
      window.PRConfig.setCredentials(url, key);
    } catch (err) {
      showToast(err.message);
      return;
    }

    const connected = window.api.reconnect();
    renderConnectionStatus();

    if (connected) {
      showToast('Connected. Log in again to use this project.');
      hooks.onSignedOut?.();
    } else {
      showToast('Saved, but the client could not start. Check the URL and key.');
    }
  });

  document.getElementById('btnUseDefaultDb')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Switch back to the default project?',
      message: 'This device will use the shared PR Marketplace database again, and you will be signed out.',
      confirmLabel: 'Switch back',
      danger: false
    });
    if (!ok) return;

    window.PRConfig.clearCredentials();
    if (els.urlInput) els.urlInput.value = '';
    if (els.keyInput) els.keyInput.value = '';

    window.api.reconnect();
    renderConnectionStatus();
    showToast('Using the default project.');
    hooks.onSignedOut?.();
  });
}

function renderConnectionStatus() {
  if (!els.dbDot || !els.dbText) return;

  const ready = window.api.isReady();
  const custom = window.PRConfig.isOverridden;

  els.dbDot.className = `db-status-dot ${ready ? 'ok' : 'down'}`;
  els.dbText.textContent = ready
    ? (custom ? `Connected to ${shortHost(window.PRConfig.url)}` : 'Connected to the default project')
    : 'Not connected — check the URL and key below';

  if (custom && els.urlInput && !els.urlInput.value) {
    els.urlInput.value = window.PRConfig.url;
  }
}

function shortHost(url) {
  try {
    return new URL(url).hostname.replace('.supabase.co', '');
  } catch (e) {
    return url;
  }
}

/* =============================================================== install === */

function wireInstall() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (els.installHint) els.installHint.textContent = 'Ready to install on this device';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (els.installHint) els.installHint.textContent = 'Installed';
    showToast('PR Marketplace installed.');
  });

  document.getElementById('btnInstallApp')?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (outcome === 'accepted') showToast('Installing…');
      return;
    }

    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    showToast(
      iOS
        ? 'Tap Share, then "Add to Home Screen".'
        : 'Open your browser menu and choose "Install app" or "Add to Home screen".',
      5000
    );
  });
}

/* ============================================================== security === */

function wireSecurity() {
  document.getElementById('btnChangePassword')?.addEventListener('click', async () => {
    const user = window.api.getCurrentUser();
    if (!user?.email) return;

    const ok = await confirmAction({
      title: 'Send a password reset link?',
      message: `We'll email ${user.email} a link to choose a new password.`,
      confirmLabel: 'Send link',
      danger: false
    });
    if (!ok) return;

    try {
      await window.api.requestPasswordReset(user.email);
      showToast('Link sent. Check your inbox.');
    } catch (err) {
      showToast(describeError(err));
    }
  });
}

/* =============================================================== sections === */

function wireSections() {
  const pairs = [
    ['btnToggleContactSection', 'contactSectionBody'],
    ['btnToggleAboutSection', 'aboutSectionBody'],
    ['btnToggleListingsSection', 'listingsSectionBody'],
    ['btnToggleDbSection', 'dbSectionBody'],
    ['btnToggleAppSection', 'appSectionBody']
  ];

  pairs.forEach(([btnId, bodyId]) => {
    const btn = document.getElementById(btnId);
    const body = document.getElementById(bodyId);
    btn?.addEventListener('click', () => {
      const open = body.classList.toggle('hidden');
      btn.classList.toggle('open', !open);
      btn.setAttribute('aria-expanded', String(!open));
    });
    btn?.setAttribute('aria-expanded', String(!body?.classList.contains('hidden')));
  });

  document.getElementById('btnHowItWorks')?.addEventListener('click', openGuide);
  document.getElementById('closeInfoModalBtn')?.addEventListener('click', () => {
    closeModal(document.getElementById('infoModal'));
  });
}

function wireOpenClose() {
  document.getElementById('closeAccountModalBtn')?.addEventListener('click', closeAccount);

  document.getElementById('btnLogoutUser')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Log out?',
      message: 'Your listings and saved items stay where they are.',
      confirmLabel: 'Log out',
      danger: false
    });
    if (!ok) return;

    closeAccount();
    try {
      await window.api.signOut();
    } catch (err) {
      console.warn('Sign out reported an error:', err);
    }
    showToast('Logged out.');
    hooks.onSignedOut?.();
  });

  document.getElementById('btnExitApp')?.addEventListener('click', () => {
    // A web page cannot close a tab it did not open, so send the app to the
    // background where that is possible and otherwise say what happened.
    if (window.AndroidBridge?.moveToBackground) {
      window.AndroidBridge.moveToBackground();
      return;
    }
    showToast('Use your device’s home or back gesture to leave the app.', 3500);
  });
}

/* ================================================================== guide === */

function openGuide() {
  const modal = document.getElementById('infoModal');
  const content = document.getElementById('infoModalContent');
  if (!modal || !content) return;

  content.innerHTML = `
    <ol class="guide-list">
      <li><strong>Browse or search.</strong> Filter by category, condition, price or your part of town.</li>
      <li><strong>Message the seller.</strong> Every listing has a private thread. Phone, WhatsApp and Instagram show up when the seller adds them.</li>
      <li><strong>Meet somewhere public.</strong> A campus library, a café, the main gate. Check the item before you pay.</li>
      <li><strong>Selling?</strong> Tap Sell, add a photo, set a price. You can edit or delete the listing any time from Account.</li>
      <li><strong>Sold something?</strong> Mark it sold and it comes off the marketplace ${window.PRConfig.SOLD_ITEM_LIFETIME_HOURS} hours later.</li>
      <li><strong>Something wrong?</strong> Use Report on any listing. Reports are anonymous to the seller.</li>
    </ol>
    <p class="guide-note">PR Marketplace does not handle payments or delivery. You arrange both directly with the other person.</p>
  `;
  openModal(modal);
}
