/**
 * CAMPUS CART - UPDATES
 *
 * Two separate problems, because they are genuinely different:
 *
 *  1. The web app. A service worker downloads the new version in the
 *     background and then waits. This offers the reload rather than taking it,
 *     because swapping the assets under someone mid-message loses what they
 *     were typing.
 *
 *  2. The Android app. A sideloaded APK cannot silently replace itself -
 *     Android requires the user to confirm every install, and only the Play
 *     Store or a package-installer permission avoids that. So this checks a
 *     published version file and tells the user a newer build exists, with a
 *     link. Honest about what it can do rather than pretending to auto-update.
 */

import { showToast } from './ui.js';

/** How often to look for a new version while the app stays open. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

let updateBannerShown = false;

/* ============================================================ web app === */

export function initWebUpdates() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  navigator.serviceWorker.getRegistration().then(registration => {
    if (!registration) return;

    // Already downloaded and waiting from a previous visit.
    if (registration.waiting) offerUpdate(registration);

    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing;
      if (!incoming) return;

      incoming.addEventListener('statechange', () => {
        // "installed" with an existing controller means this is an update
        // rather than the very first install.
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
          offerUpdate(registration);
        }
      });
    });

    // Ask for a new version now, when the tab regains focus, and periodically.
    // A phone left on the home screen for a week should not stay on an old build.
    const check = () => registration.update().catch(() => {});
    check();
    window.addEventListener('focus', check);
    setInterval(check, CHECK_INTERVAL_MS);
  }).catch(() => {});

  // The new worker has taken over, so the page has to reload to use it.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function offerUpdate(registration) {
  if (updateBannerShown) return;
  updateBannerShown = true;

  const banner = document.getElementById('updateBanner');
  const button = document.getElementById('btnApplyUpdate');
  const dismiss = document.getElementById('btnDismissUpdate');

  if (!banner || !button) {
    showToast('A new version is ready. Reload to use it.', 8000);
    return;
  }

  banner.classList.remove('hidden');

  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Updating…';
    // controllerchange fires once this worker activates, and that reloads us.
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }, { once: true });

  dismiss?.addEventListener('click', () => {
    banner.classList.add('hidden');
    // Not shown again this session; it will reappear on the next visit,
    // because the worker is still waiting.
  }, { once: true });
}

/* ============================================================ android === */

/**
 * Compare two dotted version strings. Returns true when `candidate` is newer.
 * String comparison gets 3.10.0 vs 3.9.0 wrong, which is exactly the case
 * that matters once a project has had ten releases.
 */
export function isNewerVersion(candidate, current) {
  const parse = v => String(v || '0').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Check the published version file and tell the user if their installed APK
 * is behind. Silent when there is nothing to say, including when offline -
 * a failed update check is not something to interrupt anyone about.
 */
export async function checkAndroidUpdate({ currentVersion, manifestUrl }) {
  if (!currentVersion || !manifestUrl) return null;

  try {
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) return null;

    const info = await response.json();
    if (!isNewerVersion(info.version, currentVersion)) return null;

    return {
      version: info.version,
      notes: info.notes || '',
      url: info.apkUrl || info.url || ''
    };
  } catch (err) {
    // Offline, or the file is not published yet. Neither is worth a message.
    return null;
  }
}
