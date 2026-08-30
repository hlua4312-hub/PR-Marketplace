/**
 * PR MARKETPLACE - POST & EDIT A LISTING
 *
 * One form serves both jobs. Photos are prepared in the browser and uploaded
 * to Supabase Storage, so what lands in the database is a short URL rather
 * than a megabyte of base64.
 */

import {
  showToast, openModal, closeModal, prepareImage, describeError, confirmAction
} from './ui.js';
import { openCropper } from './cropper.js';
import { isValidVpa } from './upi.js';

const CATEGORIES = [
  'Books & Study Materials', 'Fashion & Clothing', 'Furniture', 'Sports & Fitness',
  'Beauty & Personal Care', 'Vehicles & Accessories', 'Toys & Games',
  'Pets & Pet Supplies', 'Real Estate', 'Musical Instruments', 'Other'
];

let els = {};
let hooks = {};

/** Pending image work: a Blob replaces the photo, a URL keeps the existing one. */
const draft = {
  editingId: null,
  photoBlob: null,
  photoUrl: null
};

export function initSell(injected) {
  hooks = injected;                 // { onSaved }

  els = {
    modal: document.getElementById('sellModal'),
    form: document.getElementById('sellForm'),
    title: document.getElementById('sellModalTitle'),
    subtitle: document.getElementById('sellModalSubtitle'),
    submitBtn: document.getElementById('submitSellBtn'),
    submitLabel: document.getElementById('submitSellLabel'),

    itemInput: document.getElementById('itemImageInput'),
    itemPlaceholder: document.getElementById('uploadPlaceholder'),
    itemPreviewWrap: document.getElementById('imagePreviewContainer'),
    itemPreview: document.getElementById('imagePreview'),
    itemRemove: document.getElementById('removePhotoBtn'),
    itemCrop: document.getElementById('cropImageBtn'),

    fields: {
      title: document.getElementById('itemTitle'),
      category: document.getElementById('itemCategory'),
      condition: document.getElementById('itemCondition'),
      price: document.getElementById('itemPrice'),
      location: document.getElementById('itemLocation'),
      description: document.getElementById('itemDescription'),
      sellerName: document.getElementById('sellerName'),
      sellerPhone: document.getElementById('sellerPhone'),
      sellerWhatsapp: document.getElementById('sellerWhatsapp'),
      sellerInstagram: document.getElementById('sellerInstagram'),
      sellerUpiVpa: document.getElementById('sellerUpiVpa')
    }
  };

  wireImagePickers();
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

  els.title.textContent = 'Post Item for Sale';
  els.subtitle.textContent = 'List your item for local community buyers';
  els.submitLabel.textContent = 'Publish Listing';

  openModal(els.modal);
}

export function openEditModal(item) {
  resetForm();
  draft.editingId = item.id;
  draft.photoUrl = item.imageUrl || null;

  els.fields.title.value = item.title || '';
  els.fields.category.value = CATEGORIES.includes(item.category) ? item.category : 'Other';
  els.fields.condition.value = item.condition || 'Good';
  els.fields.price.value = item.price ?? '';
  els.fields.location.value = item.location || '';
  els.fields.description.value = item.description || '';
  els.fields.sellerName.value = item.sellerName || '';
  els.fields.sellerPhone.value = item.sellerPhone || '';
  els.fields.sellerWhatsapp.value = item.sellerWhatsapp || '';
  els.fields.sellerInstagram.value = item.sellerInstagram || '';
  els.fields.sellerUpiVpa.value = item.sellerUpiVpa || '';

  if (draft.photoUrl) showPreview(draft.photoUrl);

  els.title.textContent = 'Edit Listing';
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
  if (draft.photoBlob) return true;
  return Boolean(
    els.fields.title.value.trim() ||
    els.fields.price.value ||
    els.fields.description.value.trim()
  );
}

function resetForm() {
  els.form?.reset();
  draft.editingId = null;
  draft.photoBlob = null;
  draft.photoUrl = null;
  clearPreview();
}

function prefillFromProfile() {
  const user = window.api.getCurrentUser();
  if (!user) return;
  if (els.fields.sellerName && !els.fields.sellerName.value) els.fields.sellerName.value = user.fullName || '';
  if (els.fields.sellerPhone && !els.fields.sellerPhone.value) els.fields.sellerPhone.value = user.phone || '';
}

/* =============================================================== images === */

function wireImagePickers() {
  els.itemInput?.addEventListener('change', onPick);

  els.itemRemove?.addEventListener('click', event => {
    event.stopPropagation();
    draft.photoBlob = null;
    draft.photoUrl = null;
    clearPreview();
  });

  els.itemCrop?.addEventListener('click', event => {
    event.stopPropagation();
    recrop();
  });
}

async function onPick(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';           // let the same file be picked again
  if (!file) return;

  try {
    showToast('Preparing photo…', 1200);
    const { blob, previewUrl } = await prepareImage(file);
    setImage(blob, previewUrl);
  } catch (err) {
    showToast(describeError(err));
  }
}

async function recrop() {
  const source = draft.photoBlob ? URL.createObjectURL(draft.photoBlob) : draft.photoUrl;
  if (!source) {
    showToast('Add a photo first.');
    return;
  }

  const cropped = await openCropper(source, { title: 'Crop & Adjust Item Photo' });
  if (cropped) setImage(cropped, URL.createObjectURL(cropped));
}

function setImage(blob, previewUrl) {
  draft.photoBlob = blob;
  showPreview(previewUrl);
}

function showPreview(url) {
  if (els.itemPreview) els.itemPreview.src = url;
  els.itemPreviewWrap?.classList.remove('hidden');
  els.itemPlaceholder?.classList.add('hidden');
}

function clearPreview() {
  if (els.itemPreview) els.itemPreview.src = '';
  els.itemPreviewWrap?.classList.add('hidden');
  els.itemPlaceholder?.classList.remove('hidden');
}

/* ============================================================== presets === */

function wirePresets() {
  document.getElementById('pricePresets')?.addEventListener('click', event => {
    const chip = event.target.closest('.preset-chip');
    if (chip) els.fields.price.value = chip.dataset.price;
  });

  document.getElementById('locationPresets')?.addEventListener('click', event => {
    const chip = event.target.closest('.preset-chip');
    if (chip) els.fields.location.value = chip.dataset.loc;
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
    let imageUrl = draft.photoUrl;

    if (draft.photoBlob) {
      setSubmitting(true, 'Uploading photo…');
      imageUrl = await window.api.uploadImage(draft.photoBlob, 'item');
    }

    setSubmitting(true, draft.editingId ? 'Saving…' : 'Publishing…');

    const payload = { ...values, imageUrl };

    if (draft.editingId) {
      await window.api.updateItem(draft.editingId, payload);
      showToast('Listing updated.');
    } else {
      await window.api.createItem(payload);
      showToast('Listing published.');
    }

    resetForm();
    closeModal(els.modal);
    hooks.onSaved?.();
  } catch (err) {
    console.error('Could not save the listing:', err);
    showToast(describeError(err));
  } finally {
    setSubmitting(false);
  }
}

function readForm() {
  const f = els.fields;
  return {
    title: f.title.value.trim(),
    category: f.category.value,
    condition: f.condition.value,
    price: f.price.value,
    location: f.location.value.trim(),
    description: f.description.value.trim(),
    sellerName: f.sellerName.value.trim(),
    sellerPhone: f.sellerPhone.value.trim(),
    sellerWhatsapp: f.sellerWhatsapp.value.replace(/[^\d]/g, ''),
    sellerInstagram: f.sellerInstagram.value.replace(/^@/, '').trim(),
    sellerUpiVpa: f.sellerUpiVpa.value.trim().toLowerCase()
  };
}

function validate(values) {
  if (!draft.photoBlob && !draft.photoUrl) return 'Add a photo of the item.';
  if (values.title.length < 3) return 'Give the listing a title of at least 3 characters.';
  if (values.title.length > 120) return 'That title is too long — keep it under 120 characters.';

  const price = Number(values.price);
  if (!Number.isFinite(price) || price < 0) return 'Enter a price of zero or more.';
  if (price > 10000000) return 'That price looks too high. Check the number.';

  if (!values.location) return 'Add a meetup location.';
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
