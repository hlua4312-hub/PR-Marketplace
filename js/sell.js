/**
 * PR MARKETPLACE - POST & EDIT A LISTING
 *
 * One form serves both jobs. Photos are prepared in the browser and uploaded
 * to Supabase Storage, so what lands in the database is a short URL rather
 * than a megabyte of base64.
 *
 * A listing has a mode - sell, give away, or swap - and it is asked first,
 * because it decides whether the rest of the form should be asking for a
 * price at all.
 */

import {
  showToast, openModal, closeModal, prepareImage, describeError, confirmAction,
  escapeHtml
} from './ui.js';
import { openCropper } from './cropper.js';
import { isValidVpa } from './upi.js';

const categoryIds = () => (window.PRConfig.CAMPUS.categories || []).map(c => c.id);
const maxPhotos = () => window.PRConfig.MAX_PHOTOS_PER_ITEM || 6;

let els = {};
let hooks = {};

/**
 * Pending listing state.
 *
 * `photos` holds one entry per picture, in the order they will be shown.
 * An entry is either { blob } - picked on this device and not uploaded yet -
 * or { url } - already in Storage from a previous save. Both carry a
 * `previewUrl` for the strip. The first entry is the cover.
 */
const draft = {
  editingId: null,
  listingType: 'sell',
  photos: []
};

export function initSell(injected) {
  hooks = injected;                 // { onSaved, requireLogin }

  els = {
    modal: document.getElementById('sellModal'),
    form: document.getElementById('sellForm'),
    title: document.getElementById('sellModalTitle'),
    subtitle: document.getElementById('sellModalSubtitle'),
    submitBtn: document.getElementById('submitSellBtn'),
    submitLabel: document.getElementById('submitSellLabel'),

    photoInput: document.getElementById('itemImageInput'),
    photoStrip: document.getElementById('photoStrip'),
    photoHint: document.getElementById('photoHint'),

    typePicker: document.getElementById('listingTypePicker'),
    priceGroup: document.getElementById('priceGroup'),
    priceLabel: document.getElementById('priceLabel'),
    barterGroup: document.getElementById('barterWantGroup'),

    fields: {
      title: document.getElementById('itemTitle'),
      category: document.getElementById('itemCategory'),
      condition: document.getElementById('itemCondition'),
      price: document.getElementById('itemPrice'),
      location: document.getElementById('itemLocation'),
      pickupSpot: document.getElementById('itemPickupSpot'),
      barterWant: document.getElementById('itemBarterWant'),
      urgent: document.getElementById('itemUrgent'),
      description: document.getElementById('itemDescription'),
      sellerName: document.getElementById('sellerName'),
      sellerPhone: document.getElementById('sellerPhone'),
      sellerWhatsapp: document.getElementById('sellerWhatsapp'),
      sellerInstagram: document.getElementById('sellerInstagram'),
      sellerUpiVpa: document.getElementById('sellerUpiVpa')
    }
  };

  wirePhotos();
  wireTypePicker();
  wirePresets();
  wireOpenClose();

  els.form?.addEventListener('submit', onSubmit);
}

export function isSellOpen() {
  return Boolean(els.modal) && !els.modal.classList.contains('hidden');
}

/* ================================================================= open === */

export function openSellModal() {
  // Listing needs an identity: the row records who the seller is, and the
  // insert policy checks it. Browsing does not.
  if (!window.api.getCurrentUser()) {
    hooks.requireLogin?.('Log in to post a listing. It takes a minute and your listing stays yours.');
    return;
  }
  resetForm();
  prefillFromProfile();

  els.title.textContent = 'Post an item';
  els.subtitle.textContent = 'Sell it, give it away, or swap it with someone on campus';
  els.submitLabel.textContent = 'Publish Listing';

  openModal(els.modal);
}

export function openEditModal(item) {
  resetForm();
  draft.editingId = item.id;

  // Older listings predate the gallery and only have a cover.
  const urls = (item.imageUrls && item.imageUrls.length)
    ? item.imageUrls
    : (item.imageUrl ? [item.imageUrl] : []);
  draft.photos = urls.map(url => ({ url, previewUrl: url }));

  setListingType(item.listingType || 'sell');

  els.fields.title.value = item.title || '';
  els.fields.category.value = categoryIds().includes(item.category) ? item.category : 'Other';
  els.fields.condition.value = item.condition || 'Good';
  els.fields.price.value = item.price ?? '';
  els.fields.location.value = item.location || '';
  els.fields.pickupSpot.value = item.pickupSpot || '';
  els.fields.barterWant.value = item.barterWant || '';
  els.fields.urgent.checked = Boolean(item.isUrgent);
  els.fields.description.value = item.description || '';
  els.fields.sellerName.value = item.sellerName || '';
  els.fields.sellerPhone.value = item.sellerPhone || '';
  els.fields.sellerWhatsapp.value = item.sellerWhatsapp || '';
  els.fields.sellerInstagram.value = item.sellerInstagram || '';
  els.fields.sellerUpiVpa.value = item.sellerUpiVpa || '';

  renderPhotoStrip();

  els.title.textContent = 'Edit listing';
  els.subtitle.textContent = 'Update the details buyers see';
  els.submitLabel.textContent = 'Save Changes';

  openModal(els.modal);
}

export async function closeSellModal({ confirm = true } = {}) {
  if (confirm && isDirty()) {
    const leave = await confirmAction({
      title: 'Discard your changes?',
      message: 'What you have filled in here will not be saved.',
      confirmLabel: 'Discard'
    });
    if (!leave) return false;
  }
  resetForm();
  closeModal(els.modal);
  return true;
}

function isDirty() {
  if (draft.photos.some(p => p.blob)) return true;
  return Boolean(
    els.fields.title.value.trim() ||
    els.fields.price.value ||
    els.fields.barterWant.value.trim() ||
    els.fields.description.value.trim()
  );
}

function resetForm() {
  els.form?.reset();
  releasePreviews();
  draft.editingId = null;
  draft.photos = [];
  setListingType('sell');
  renderPhotoStrip();
}

/** Object URLs are held by the browser until revoked; a long session leaks. */
function releasePreviews() {
  draft.photos.forEach(p => {
    if (p.blob && p.previewUrl) {
      try { URL.revokeObjectURL(p.previewUrl); } catch (e) { /* already gone */ }
    }
  });
}

function prefillFromProfile() {
  const user = window.api.getCurrentUser();
  if (!user) return;
  if (els.fields.sellerName && !els.fields.sellerName.value) els.fields.sellerName.value = user.fullName || '';
  if (els.fields.sellerPhone && !els.fields.sellerPhone.value) els.fields.sellerPhone.value = user.phone || '';
}

/* ========================================================= listing type === */

function wireTypePicker() {
  els.typePicker?.addEventListener('click', event => {
    const segment = event.target.closest('.segment');
    if (segment) setListingType(segment.dataset.type);
  });
}

function setListingType(type) {
  draft.listingType = ['sell', 'free', 'barter'].includes(type) ? type : 'sell';

  els.typePicker?.querySelectorAll('.segment').forEach(seg => {
    const on = seg.dataset.type === draft.listingType;
    seg.classList.toggle('active', on);
    seg.setAttribute('aria-checked', String(on));
  });

  const free = draft.listingType === 'free';
  const barter = draft.listingType === 'barter';

  // A giveaway has no price to ask for, so the field goes rather than sitting
  // there disabled. A swap keeps it: "swap, or ₹400" is a real offer.
  els.priceGroup?.classList.toggle('hidden', free);
  els.barterGroup?.classList.toggle('hidden', !barter);

  if (els.priceLabel) {
    els.priceLabel.innerHTML = barter
      ? 'Or asking price (₹) <span class="optional">optional</span>'
      : 'Price (₹) <span class="required">*</span>';
  }
  if (free && els.fields.price) els.fields.price.value = '';
}

/* =============================================================== photos === */

function wirePhotos() {
  els.photoInput?.addEventListener('change', onPick);

  els.photoStrip?.addEventListener('click', async event => {
    const add = event.target.closest('[data-add-photo]');
    if (add) {
      els.photoInput?.click();
      return;
    }

    const remove = event.target.closest('[data-remove]');
    if (remove) {
      event.stopPropagation();
      removePhoto(Number(remove.dataset.remove));
      return;
    }

    const crop = event.target.closest('[data-crop]');
    if (crop) {
      event.stopPropagation();
      await recrop(Number(crop.dataset.crop));
      return;
    }

    // Tapping a photo that is not already the cover promotes it. That is the
    // whole of the reordering story: the cover is the only position anyone
    // actually cares about.
    const tile = event.target.closest('[data-index]');
    if (tile) makeCover(Number(tile.dataset.index));
  });
}

async function onPick(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';           // let the same file be picked again
  if (!files.length) return;

  const room = maxPhotos() - draft.photos.length;
  if (room <= 0) {
    showToast(`That is the limit — ${maxPhotos()} photos per listing.`);
    return;
  }
  if (files.length > room) {
    showToast(`Only ${room} more photo${room === 1 ? '' : 's'} will fit. Adding the first ${room}.`, 3600);
  }

  showToast('Preparing photos…', 1200);

  for (const file of files.slice(0, room)) {
    try {
      const { blob, previewUrl } = await prepareImage(file);
      draft.photos.push({ blob, previewUrl });
    } catch (err) {
      // One bad file should not throw away the good ones picked alongside it.
      showToast(`${file.name}: ${describeError(err)}`, 4000);
    }
  }
  renderPhotoStrip();
}

async function recrop(index) {
  const photo = draft.photos[index];
  if (!photo) return;

  const source = photo.blob ? photo.previewUrl : photo.url;
  const cropped = await openCropper(source, { title: 'Crop & Adjust Photo' });
  if (!cropped) return;

  if (photo.blob && photo.previewUrl) {
    try { URL.revokeObjectURL(photo.previewUrl); } catch (e) { /* already gone */ }
  }
  draft.photos[index] = { blob: cropped, previewUrl: URL.createObjectURL(cropped) };
  renderPhotoStrip();
}

function removePhoto(index) {
  const [gone] = draft.photos.splice(index, 1);
  if (gone && gone.blob && gone.previewUrl) {
    try { URL.revokeObjectURL(gone.previewUrl); } catch (e) { /* already gone */ }
  }
  renderPhotoStrip();
}

function makeCover(index) {
  if (index <= 0 || index >= draft.photos.length) return;
  const [moved] = draft.photos.splice(index, 1);
  draft.photos.unshift(moved);
  renderPhotoStrip();
  showToast('Cover photo changed');
}

function renderPhotoStrip() {
  if (!els.photoStrip) return;

  const tiles = draft.photos.map((photo, i) => `
    <div class="photo-tile ${i === 0 ? 'is-cover' : ''}" data-index="${i}"
         title="${i === 0 ? 'Cover photo' : 'Tap to make this the cover'}">
      <img src="${escapeHtml(photo.previewUrl || photo.url || '')}" alt="Photo ${i + 1}">
      ${i === 0 ? '<span class="photo-cover-tag">Cover</span>' : ''}
      <div class="photo-tile-actions">
        <button type="button" class="photo-tile-btn" data-crop="${i}" aria-label="Crop photo ${i + 1}">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
        </button>
        <button type="button" class="photo-tile-btn photo-remove" data-remove="${i}" aria-label="Remove photo ${i + 1}">&times;</button>
      </div>
    </div>`);

  if (draft.photos.length < maxPhotos()) {
    tiles.push(`
    <button type="button" class="photo-add-tile" data-add-photo="1">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      <span>${draft.photos.length ? 'Add photo' : 'Add photos'}</span>
    </button>`);
  }

  els.photoStrip.innerHTML = tiles.join('');

  if (els.photoHint) {
    els.photoHint.textContent = draft.photos.length > 1
      ? `${draft.photos.length} of ${maxPhotos()}. Tap any photo to make it the cover.`
      : `The first photo is the cover buyers see. Up to ${maxPhotos()}, 5MB each.`;
  }
}

/* ============================================================== presets === */

function wirePresets() {
  document.getElementById('pricePresets')?.addEventListener('click', event => {
    const chip = event.target.closest('.preset-chip');
    if (chip) els.fields.price.value = chip.dataset.price;
  });

  document.getElementById('btnCopyPhoneToWhatsapp')?.addEventListener('click', () => {
    const phone = els.fields.sellerPhone.value.replace(/[^\d]/g, '');
    if (!phone) {
      showToast('Add your phone number first.');
      return;
    }
    // Indian numbers are the common case here; add the country code if missing.
    els.fields.sellerWhatsapp.value = phone.length === 10 ? `91${phone}` : phone;
  });
}

function wireOpenClose() {
  document.getElementById('closeSellModalBtn')?.addEventListener('click', () => closeSellModal());
  document.getElementById('cancelSellBtn')?.addEventListener('click', () => closeSellModal());
}

/* =============================================================== submit === */

async function onSubmit(event) {
  event.preventDefault();

  const values = readForm();
  const problem = validate(values);
  if (problem) {
    showToast(problem);
    return;
  }

  setSubmitting(true);

  try {
    const imageUrls = [];
    let uploaded = 0;
    const pending = draft.photos.filter(p => p.blob).length;

    for (const photo of draft.photos) {
      if (photo.blob) {
        uploaded += 1;
        setSubmitting(true, `Uploading photo ${uploaded} of ${pending}…`);
        imageUrls.push(await window.api.uploadImage(photo.blob, 'item'));
      } else {
        imageUrls.push(photo.url);
      }
    }

    setSubmitting(true, draft.editingId ? 'Saving…' : 'Publishing…');

    // image_url stays the cover so anything still reading the old column -
    // a cached feed, an older build on someone's phone - keeps working.
    const payload = { ...values, imageUrls, imageUrl: imageUrls[0] || null };

    if (draft.editingId) {
      await window.api.updateItem(draft.editingId, payload);
      showToast('Listing updated.');
    } else {
      await window.api.createItem(payload);
      showToast(values.listingType === 'free' ? 'Giveaway posted.' : 'Listing published.');
    }

    resetForm();
    closeModal(els.modal);
    hooks.onSaved?.();
  } catch (err) {
    console.error('Could not save the listing:', err);
    showToast(describeError(err), 5000);
  } finally {
    setSubmitting(false);
  }
}

function readForm() {
  const f = els.fields;
  const free = draft.listingType === 'free';
  return {
    listingType: draft.listingType,
    title: f.title.value.trim(),
    category: f.category.value,
    condition: f.condition.value,
    price: free ? 0 : f.price.value,
    location: f.location.value.trim(),
    pickupSpot: f.pickupSpot.value.trim(),
    barterWant: draft.listingType === 'barter' ? f.barterWant.value.trim() : '',
    isUrgent: Boolean(f.urgent.checked),
    description: f.description.value.trim(),
    sellerName: f.sellerName.value.trim(),
    sellerPhone: f.sellerPhone.value.trim(),
    sellerWhatsapp: f.sellerWhatsapp.value.replace(/[^\d]/g, ''),
    sellerInstagram: f.sellerInstagram.value.replace(/^@/, '').trim(),
    sellerUpiVpa: f.sellerUpiVpa.value.trim().toLowerCase()
  };
}

function validate(values) {
  if (!draft.photos.length) return 'Add at least one photo of the item.';
  if (values.title.length < 3) return 'Give the listing a title of at least 3 characters.';
  if (values.title.length > 120) return 'That title is too long — keep it under 120 characters.';
  if (!values.category) return 'Pick a category.';

  if (values.listingType === 'barter' && !values.barterWant) {
    return 'Say what you want in exchange, or switch to selling it.';
  }
  if (values.barterWant.length > 200) return 'Keep the exchange line under 200 characters.';

  if (values.listingType !== 'free') {
    const price = Number(values.price);
    const priceRequired = values.listingType === 'sell';
    if (priceRequired && values.price === '') return 'Enter a price, or switch to giving it away.';
    if (values.price !== '' && (!Number.isFinite(price) || price < 0)) return 'Enter a price of zero or more.';
    if (price > 10000000) return 'That price looks too high. Check the number.';
  }

  if (!values.location) return 'Pick the area you are in.';
  if (!values.sellerName) return 'Add the name buyers should ask for.';

  const phoneDigits = values.sellerPhone.replace(/[^\d]/g, '');
  if (phoneDigits.length < 7) return 'Enter a phone number buyers can reach you on.';

  if (values.description.length > 2000) return 'That description is too long — keep it under 2000 characters.';

  // Optional, but a malformed one produces a payment link that silently fails
  // in the buyer's UPI app, which is worse than not offering one at all.
  if (values.sellerUpiVpa && !isValidVpa(values.sellerUpiVpa)) {
    return 'That UPI ID does not look right. It should read something like name@okhdfcbank.';
  }
  return null;
}

function setSubmitting(busy, label) {
  if (!els.submitBtn) return;
  els.submitBtn.disabled = busy;
  if (els.submitLabel) {
    if (busy) {
      els.submitLabel.textContent = label || 'Working…';
    } else {
      els.submitLabel.textContent = draft.editingId ? 'Save Changes' : 'Publish Listing';
    }
  }
}
