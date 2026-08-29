/**
 * PR MARKETPLACE - SHARED UI HELPERS
 * Escaping, toasts, modals, dialogs, dates and image preparation.
 */

/* ---------------------------------------------------------------- text --- */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wrap search matches in a <mark>. Escaping happens first and the needle is
 * escaped the same way, so a query containing & or < still highlights.
 */
export function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const needle = escapeHtml(query).trim();
  if (!needle) return safe;
  return safe.replace(new RegExp(`(${escapeRegExp(needle)})`, 'gi'), '<mark class="search-highlight">$1</mark>');
}

export function formatPrice(value) {
  const n = Number(value) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function timeAgo(isoString) {
  const then = new Date(isoString).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Hours left before a sold listing is purged, or 0 once it is due. */
export function hoursUntilPurge(soldAt) {
  const lifetime = window.PRConfig.SOLD_ITEM_LIFETIME_HOURS;
  const sold = new Date(soldAt).getTime();
  if (!Number.isFinite(sold)) return lifetime;
  const left = lifetime - (Date.now() - sold) / 3600000;
  return Math.max(0, Math.ceil(left));
}

/* -------------------------------------------------------------- toasts --- */

export function showToast(message, duration = 2800) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

/* -------------------------------------------------------------- modals --- */

const modalStack = [];

export function openModal(el) {
  if (!el) return;
  el.classList.remove('hidden');
  document.body.classList.add('modal-open');
  const idx = modalStack.indexOf(el);
  if (idx !== -1) modalStack.splice(idx, 1);
  modalStack.push(el);

  const focusable = el.querySelector('input:not([type=hidden]), textarea, select, button');
  if (focusable && !isCoarsePointer()) setTimeout(() => focusable.focus(), 60);
}

export function closeModal(el) {
  if (!el) return;
  el.classList.add('hidden');
  const idx = modalStack.indexOf(el);
  if (idx !== -1) modalStack.splice(idx, 1);
  if (!modalStack.length) document.body.classList.remove('modal-open');
}

/** Closes the topmost open modal. Returns true when one was closed. */
export function closeTopModal() {
  const top = modalStack[modalStack.length - 1];
  if (!top) return false;
  closeModal(top);
  return true;
}

export function isModalOpen(el) {
  return Boolean(el) && !el.classList.contains('hidden');
}

export function anyModalOpen() {
  return modalStack.length > 0;
}

function isCoarsePointer() {
  return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

/** Close a modal when its backdrop, but not its card, is clicked. */
export function wireBackdropClose(el) {
  el?.addEventListener('click', event => {
    if (event.target === el) closeModal(el);
  });
}

/* ------------------------------------------------------------- dialogs --- */

/**
 * Promise-based confirmation. Used for anything destructive so the app never
 * deletes a listing on a single tap.
 */
export function confirmAction({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = true }) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    if (!modal || !okBtn || !cancelBtn) {
      resolve(window.confirm(message || title));
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = confirmLabel;
    okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

    const finish = answer => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeModal(modal);
      resolve(answer);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    openModal(modal);
  });
}

/* ------------------------------------------------------- error messages --- */

/**
 * Turn an error into something a person can act on. Anything unrecognised
 * keeps its original message rather than being flattened to "try again".
 */
export function describeError(err) {
  const code = err && err.message ? err.message : String(err);

  const known = {
    DUPLICATE_EMAIL: 'That email is already registered. Try logging in instead.',
    DUPLICATE_PHONE: 'That phone number is already registered. Try logging in instead.',
    WEAK_PASSWORD: 'Pick a longer password — at least 8 characters, with letters and numbers.',
    ACCOUNT_NOT_FOUND: 'No account matches that email or phone number.',
    INVALID_CREDENTIALS: 'That email or password is not right. Check both and try again.',
    EMAIL_NOT_CONFIRMED: 'Confirm your email first — open the link we sent you, then log in.',
    NOT_SIGNED_IN: 'Log in to do that.',
    NOT_YOUR_LISTING: 'Only the seller who posted this listing can change it.',
    ALREADY_REPORTED: 'You have already reported this listing. Thanks — we only need it once.',
    EMPTY_MESSAGE: 'Type a message first.',
    MESSAGE_TOO_LONG: 'That message is too long. Keep it under 2000 characters.',
    IMAGE_TOO_LARGE: 'That photo is over 5MB. Pick a smaller one.',
    NOT_AN_IMAGE: 'That file is not an image. Use a PNG, JPG or WEBP.'
  };

  if (known[code]) return known[code];
  if (/failed to fetch|networkerror|load failed/i.test(code)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return code;
}

/* --------------------------------------------------------------- images --- */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Shrink a picked image and hand back a JPEG blob ready to upload, plus a
 * preview URL. Returning a Blob rather than a data URL is what lets photos go
 * to Storage instead of into a database column.
 */
export async function prepareImage(file, maxDimension = window.PRConfig.IMAGE_MAX_DIMENSION) {
  if (!file.type || !file.type.startsWith('image/')) throw new Error('NOT_AN_IMAGE');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('IMAGE_TOO_LARGE');

  const bitmapSrc = await readAsDataURL(file);
  const img = await loadImage(bitmapSrc);

  let { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxDimension);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, window.PRConfig.IMAGE_QUALITY);
  return { blob, previewUrl: URL.createObjectURL(blob) };
}

export function fitWithin(w, h, maxDimension) {
  if (w <= maxDimension && h <= maxDimension) return { width: w, height: h };
  if (w > h) return { width: maxDimension, height: Math.round((h * maxDimension) / w) };
  return { width: Math.round((w * maxDimension) / h), height: maxDimension };
}

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not open that image.'));
    img.src = src;
  });
}

export function canvasToBlob(canvas, quality = 0.82) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))),
      'image/jpeg',
      quality
    );
  });
}

/* ------------------------------------------------------------ fallbacks --- */

/** Neutral placeholder drawn locally, so an empty photo never hits the network. */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
       <rect width="600" height="450" fill="#E8EDEC"/>
       <path d="M215 265l45-55 40 48 30-34 55 66H215z" fill="#B6C2C0"/>
       <circle cx="243" cy="186" r="20" fill="#B6C2C0"/>
     </svg>`
  );

export function initials(name, fallback = 'U') {
  const clean = (name || '').trim();
  return (clean ? clean.charAt(0) : fallback).toUpperCase();
}
