/**
 * PR MARKETPLACE - APPLICATION BOOTSTRAP
 *
 * Starts the app, wires the modules to each other, and owns the pieces that
 * do not belong to any one feature: the splash screen, bottom navigation,
 * hardware back button, GPS, and the fullscreen image viewer.
 */

import { showToast, closeTopModal, openModal, closeModal, describeError, wireBackdropClose } from './ui.js';
import { setTab, setFilter, filters, view, resetFilters } from './store.js';
import { initFeed, loadFeed, wireGridDelegation, updateFavoriteBadge, syncFilterControls, syncNavButtons } from './feed.js';
import { initDetail, openItemDetail, isDetailOpen, close as closeDetail } from './detail.js';
import { initSell, openSellModal, openEditModal, closeSellModal, isSellOpen } from './sell.js';
import {
  initMessaging, openCommunityChat, closeCommunityChat, isCommunityOpen,
  closePrivateChat, isPrivateOpen, closeInbox, isInboxOpen,
  watchForNewMessages, stopWatching, refreshInbox
} from './messaging.js';
import {
  initAuth, showAuth, hideAuth, isAuthOpen, showApp,
  showNewPasswordScreen, clearAuthForms,
  isRecoveryOtpOpen, closeRecoveryOtp
} from './auth.js';
import { initAccount, openAccount, closeAccount, isAccountOpen } from './account.js';
import { cancelCropper } from './cropper.js';

/* ================================================================= start === */

document.addEventListener('DOMContentLoaded', () => {
  initFeed({ onOpenItem: openItemDetail });
  wireGridDelegation();

  initDetail({
    onEdit: openEditModal,
    onFeedChanged: () => loadFeed(),
    openZoom: openZoomViewer,
    requireLogin
  });

  initSell({
    requireLogin,
    onSaved: async () => {
      // Show the seller their new listing at the top of an unfiltered feed.
      resetFilters();
      syncFilterControls();
      setTab('explore');
      syncNavButtons('explore');
      document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.category === 'all');
      });
      const search = document.getElementById('searchInput');
      if (search) search.value = '';
      document.getElementById('clearSearchBtn')?.classList.add('hidden');
      await loadFeed();
    }
  });

  initMessaging({ onOpenItem: openItemDetail, requireLogin });

  initAuth({
    onSignedIn,
    onSignedOut,
    onDismissed: () => loadFeed()
  });

  initAccount({
    onEdit: openEditModal,
    onOpenItem: openItemDetail,
    onFeedChanged: () => loadFeed(),
    onSignedOut,
    requireLogin
  });

  wireBottomNav();
  wireBackButton();
  wireGps();
  wireZoomViewer();
  wireModalBackdrops();
  wireConnectivity();

  start();
});

async function start() {
  const splash = document.getElementById('splashScreen');

  if (!window.api.isReady()) {
    // Show the shell rather than a sign-in wall: the thing that fixes this
    // lives in Account, and the user has to be able to reach it.
    hideSplash(splash);
    showApp();
    showToast('No database connection. Open Account → Database Connection to set one.', 6000);
    return;
  }

  // Supabase puts a recovery token in the URL fragment when someone follows a
  // password-reset link, so check for that before deciding what to show.
  const arrivingFromReset = /type=recovery/.test(window.location.hash);

  window.api.onAuthStateChange((event, profile) => {
    if (event === 'PASSWORD_RECOVERY') {
      showNewPasswordScreen();
    } else if (event === 'SIGNED_OUT') {
      onSignedOut({ silent: true });
    } else if (event === 'SIGNED_IN' && profile && !arrivingFromReset) {
      showApp();
    }
  });

  const user = await window.api.refreshUser();
  hideSplash(splash);

  if (arrivingFromReset) {
    showNewPasswordScreen();
    return;
  }

  // Browsing does not need an account. The marketplace opens for everyone and
  // asks for a sign-in only when someone tries to post, message or contact -
  // which is what the row-level security policies already allow for.
  await enterApp();
  applyLaunchIntent();

  if (!user) {
    setTimeout(() => showToast('Browsing as a guest. Log in from Account to sell or message.', 4500), 900);
  }
}

/**
 * The manifest advertises "Post an item" and "Saved items" shortcuts. Honour
 * them once the feed is up, then clear the query so a refresh does not repeat
 * the action.
 */
function applyLaunchIntent() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const tab = params.get('tab');

  if (action === 'sell') {
    openSellModal();
  } else if (tab === 'favorites') {
    setTab('favorites');
    syncNavButtons('favorites');
    loadFeed();
  } else {
    return;
  }

  history.replaceState(null, '', window.location.pathname);
}

function hideSplash(splash) {
  if (!splash) return;
  splash.classList.add('fade-out');
  setTimeout(() => { splash.style.display = 'none'; }, 200);
}

/* ============================================================== sessions === */

async function onSignedIn() {
  clearAuthForms();
  history.replaceState(null, '', window.location.pathname + window.location.search);
  await enterApp();
}

async function enterApp() {
  showApp();
  setTab('explore');
  syncNavButtons('explore');
  syncFilterControls();
  updateFavoriteBadge();

  await loadFeed();
  watchForNewMessages();

  // Clear out sold listings whose window has passed. Harmless if another
  // client already did it, and cheap enough to run on start.
  window.api.purgeExpiredSoldItems().catch(() => {});
}

async function onSignedOut({ silent = false } = {}) {
  stopWatching();
  closeAccount();
  closeDetail();
  closeCommunityChat();
  closeInbox();
  clearAuthForms();
  resetFilters();
  syncFilterControls();

  // Logging out drops you back to browsing as a guest rather than to a wall,
  // so the marketplace stays visible.
  setTab('explore');
  syncNavButtons('explore');
  updateFavoriteBadge();
  await loadFeed();

  if (!silent) showToast('Logged out. You can still browse.');
}

/**
 * Ask for a sign-in because the user tried to do something that needs one.
 * Everything that requires an identity funnels through here, so the reason
 * shown is always the actual reason.
 */
function requireLogin(reason) {
  showAuth({ reason, dismissible: true });
}

/* ============================================================ navigation === */

function wireBottomNav() {
  document.querySelector('.bottom-nav')?.addEventListener('click', event => {
    const button = event.target.closest('.nav-item, .nav-sell-btn');
    if (!button) return;

    switch (button.id) {
      case 'navExplore':
        setTab('explore');
        syncNavButtons('explore');
        loadFeed();
        break;

      case 'navFavorites':
        setTab('favorites');
        syncNavButtons('favorites');
        loadFeed();
        break;

      case 'openSellModalBtn':
        openSellModal();
        break;

      case 'btnAccount':
        openAccount();
        break;

      // navNotifications is handled inside messaging.js
    }
  });
}

/* =========================================================== back button === */

/**
 * Android's hardware back walks the app backwards one layer at a time instead
 * of leaving immediately. MainActivity calls this and only exits when it
 * returns false.
 */
function wireBackButton() {
  window.handleAndroidBackButton = function handleBack() {
    if (isRecoveryOtpOpen()) { closeRecoveryOtp(); showAuth({ tab: 'login' }); return true; }
    if (isAuthOpen() && window.api.getCurrentUser()) { hideAuth(); return true; }
    if (isAuthOpen()) { hideAuth(); loadFeed(); return true; }
    if (cancelCropper()) return true;
    if (isZoomOpen()) { closeZoomViewer(); return true; }
    if (isPrivateOpen()) { closePrivateChat({ back: true }); return true; }
    if (isCommunityOpen()) { closeCommunityChat(); return true; }
    if (isSellOpen()) { closeSellModal(); return true; }
    if (isDetailOpen()) { closeDetail(); return true; }
    if (isInboxOpen()) { closeInbox(); return true; }
    if (isAccountOpen()) { closeAccount(); return true; }
    if (closeTopModal()) return true;

    if (view.tab !== 'explore') {
      setTab('explore');
      syncNavButtons('explore');
      loadFeed();
      return true;
    }

    if (filters.search || filters.category !== 'all') {
      resetFilters();
      syncFilterControls();
      const search = document.getElementById('searchInput');
      if (search) search.value = '';
      document.getElementById('clearSearchBtn')?.classList.add('hidden');
      document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.category === 'all');
      });
      loadFeed();
      return true;
    }

    return false;
  };

  // Escape mirrors the back button on desktop.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.handleAndroidBackButton();
  });
}

function wireModalBackdrops() {
  ['filterModal', 'infoModal', 'reportModal', 'accountModal'].forEach(id => {
    wireBackdropClose(document.getElementById(id));
  });

  document.getElementById('filterModalBtn')?.addEventListener('click', () => {
    syncFilterControls();
    openModal(document.getElementById('filterModal'));
  });
  document.getElementById('closeFilterModalBtn')?.addEventListener('click', () => {
    closeModal(document.getElementById('filterModal'));
  });
}

/* ================================================================== GPS === */

const AIZAWL_AREAS = [
  { name: 'Aizawl City', lat: 23.7271, lon: 92.7176 },
  { name: 'MZU Campus', lat: 23.7420, lon: 92.6620 },
  { name: 'Zarkawt', lat: 23.7305, lon: 92.7210 },
  { name: 'Chanmari', lat: 23.7420, lon: 92.7180 },
  { name: 'Khatla', lat: 23.7180, lon: 92.7160 },
  { name: 'Bawngkawn', lat: 23.7620, lon: 92.7220 },
  { name: 'Vaivakawn', lat: 23.7350, lon: 92.6980 },
  { name: 'Luangmual', lat: 23.7450, lon: 92.6850 }
];

function wireGps() {
  const button = document.getElementById('btnGpsDetect');
  const select = document.getElementById('locationSelect');

  const detect = () => {
    if (!navigator.geolocation) {
      showToast('This device cannot share its location.');
      return;
    }

    showToast('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        view.gpsCoords = { latitude, longitude };

        const nearest = AIZAWL_AREAS
          .map(area => ({ ...area, distance: haversine(latitude, longitude, area.lat, area.lon) }))
          .sort((a, b) => a.distance - b.distance)[0];

        if (nearest.distance > 60) {
          showToast('You seem to be outside Aizawl — showing everything instead.');
          setFilter({ location: 'all' });
          if (select) select.value = 'all';
        } else {
          setFilter({ location: nearest.name });
          if (select) select.value = nearest.name;
          showToast(`Showing listings near ${nearest.name}.`);
        }
        loadFeed();
      },
      error => {
        const reasons = {
          1: 'Location permission is off. Turn it on in your browser or app settings.',
          2: 'Your location is not available right now.',
          3: 'Finding your location took too long.'
        };
        showToast(reasons[error.code] || 'Could not get your location.');
        if (select) select.value = filters.location;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  button?.addEventListener('click', detect);
  select?.addEventListener('change', event => {
    if (event.target.value === 'detect_gps') detect();
  });
}

/** Great-circle distance in kilometres. */
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ========================================================== zoom viewer === */

let zoomScale = 1;
let panX = 0;
let panY = 0;

function wireZoomViewer() {
  const modal = document.getElementById('imageZoomModal');
  const img = document.getElementById('zoomModalImg');
  const label = document.getElementById('zoomLevelDisplay');
  const container = document.getElementById('zoomImageContainer');

  const apply = () => {
    zoomScale = Math.min(4, Math.max(1, zoomScale));
    if (zoomScale === 1) { panX = 0; panY = 0; }
    if (img) img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    if (label) label.textContent = `${Math.round(zoomScale * 100)}%`;
  };

  document.getElementById('btnZoomIn')?.addEventListener('click', () => { zoomScale += 0.4; apply(); });
  document.getElementById('btnZoomOut')?.addEventListener('click', () => { zoomScale -= 0.4; apply(); });
  document.getElementById('btnZoomReset')?.addEventListener('click', () => { zoomScale = 1; apply(); });
  document.getElementById('btnCloseZoomModal')?.addEventListener('click', closeZoomViewer);

  modal?.addEventListener('click', event => {
    if (event.target === modal || event.target === container) closeZoomViewer();
  });

  // Drag to pan once zoomed in.
  let dragging = false;
  let startX = 0;
  let startY = 0;

  img?.addEventListener('pointerdown', event => {
    if (zoomScale <= 1) return;
    dragging = true;
    startX = event.clientX - panX;
    startY = event.clientY - panY;
    img.setPointerCapture(event.pointerId);
    img.style.cursor = 'grabbing';
  });

  img?.addEventListener('pointermove', event => {
    if (!dragging) return;
    panX = event.clientX - startX;
    panY = event.clientY - startY;
    apply();
  });

  const endDrag = () => {
    dragging = false;
    if (img) img.style.cursor = 'grab';
  };
  img?.addEventListener('pointerup', endDrag);
  img?.addEventListener('pointercancel', endDrag);

  img?.addEventListener('dblclick', () => {
    zoomScale = zoomScale > 1 ? 1 : 2;
    apply();
  });

  window.__applyZoom = apply;
}

function openZoomViewer(src) {
  const modal = document.getElementById('imageZoomModal');
  const img = document.getElementById('zoomModalImg');
  if (!modal || !img) return;

  img.src = src;
  zoomScale = 1;
  panX = 0;
  panY = 0;
  window.__applyZoom?.();
  openModal(modal);
}

function closeZoomViewer() {
  closeModal(document.getElementById('imageZoomModal'));
}

function isZoomOpen() {
  const modal = document.getElementById('imageZoomModal');
  return Boolean(modal) && !modal.classList.contains('hidden');
}

/* =========================================================== connectivity === */

function wireConnectivity() {
  window.addEventListener('online', () => {
    showToast('Back online.');
    loadFeed();
    refreshInbox();
  });

  window.addEventListener('offline', () => {
    showToast('You are offline. You can still browse what is saved on this device.', 4000);
  });
}
