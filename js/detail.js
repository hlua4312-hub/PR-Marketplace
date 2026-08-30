/**
 * PR MARKETPLACE - LISTING DETAIL
 *
 * Seller contact, the live chat thread for this listing, and the owner
 * controls (edit, mark sold, relist, delete).
 *
 * The buttons drawn here follow from who owns the row. The database enforces
 * the same rule independently, so a hidden button is a convenience, not the
 * thing standing between a stranger and someone's listing.
 */

import {
  escapeHtml, formatPrice, timeAgo, hoursUntilPurge, showToast,
  openModal, closeModal, confirmAction, describeError,
  PLACEHOLDER_IMAGE, initials
} from './ui.js';

let modal, content;
let currentItem = null;
let unsubscribeChat = null;
let hooks = {};

export function initDetail(injected) {
  hooks = injected;                      // { onEdit, onFeedChanged, openPrivateChat }
  modal = document.getElementById('itemDetailModal');
  content = document.getElementById('itemDetailContent');

  document.getElementById('closeDetailModalBtn')?.addEventListener('click', close);
  modal?.addEventListener('click', event => {
    if (event.target === modal) close();
  });

  content?.addEventListener('click', onContentClick);
  content?.addEventListener('submit', onContentSubmit);

  wireReportModal();
}

export function isDetailOpen() {
  return Boolean(modal) && !modal.classList.contains('hidden');
}

export function close() {
  stopChat();
  currentItem = null;
  closeModal(modal);
}

function stopChat() {
  if (unsubscribeChat) {
    unsubscribeChat();
    unsubscribeChat = null;
  }
}

/* ================================================================= open === */

export async function openItemDetail(itemId) {
  if (!modal || !content) return;

  stopChat();
  content.innerHTML = '<div class="detail-loading">Loading listing…</div>';
  openModal(modal);

  let item;
  try {
    item = await window.api.fetchItemById(itemId);
  } catch (err) {
    content.innerHTML = `<div class="detail-loading">${escapeHtml(describeError(err))}</div>`;
    return;
  }

  if (!item) {
    content.innerHTML = '<div class="detail-loading">This listing is no longer available.</div>';
    return;
  }

  currentItem = item;
  content.innerHTML = detailMarkup(item);
  wireGallery();

  if (!item.isSold) startChat(item);

  // The seller's card - photo, course, verified badge - is a second request,
  // so it fills in after the listing rather than holding it up. A listing
  // that renders in one round trip and gains a badge in two reads better
  // than one that waits for both.
  hydrateSellerCard(item);
}

async function hydrateSellerCard(item) {
  const slot = document.getElementById('sellerCardSlot');
  if (!slot || !item.userId) return;

  let profile = null;
  try {
    profile = await window.api.fetchProfile(item.userId);
  } catch (err) {
    return;                            // the fallback already on screen is fine
  }
  if (!profile || currentItem !== item) return;

  const avatar = slot.querySelector('.seller-avatar');
  if (avatar && profile.avatarUrl) {
    avatar.innerHTML = `<img src="${escapeHtml(profile.avatarUrl)}" alt="">`;
    avatar.classList.add('has-photo');
  }

  const meta = slot.querySelector('.seller-meta');
  if (meta) {
    const course = [profile.department, profile.yearOfStudy].filter(Boolean).join(' · ');
    meta.innerHTML = [
      profile.isVerified
        ? '<span class="verified-badge" title="Registered with a college address">✓ Verified student</span>'
        : '<span class="unverified-badge">Not verified</span>',
      ratingMarkup(profile),
      course ? `<span class="seller-course">${escapeHtml(course)}</span>` : ''
    ].filter(Boolean).join('');
  }

  renderReviews(item, profile);
}

/* ============================================================== reviews === */

/**
 * The score, or nothing.
 *
 * A brand new account shows no stars rather than a zero or an empty row of
 * five - both of which read as "rated badly" when the truth is "not rated
 * yet", and the difference matters most to exactly the people it would be
 * unfair to.
 */
function ratingMarkup(profile) {
  if (!profile || !profile.ratingCount) return '';
  const avg = Number(profile.ratingAvg) || 0;
  const people = profile.ratingCount === 1 ? 'person' : 'people';
  return `
    <span class="rating-inline" title="${avg.toFixed(1)} out of 5 from ${profile.ratingCount} ${people}">
      <span class="stars" aria-hidden="true">${stars(Math.round(avg))}</span>
      <span>${avg.toFixed(1)}</span>
      <span class="count">(${profile.ratingCount})</span>
    </span>`;
}

function stars(n) {
  const filled = Math.max(0, Math.min(5, n));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

async function renderReviews(item, profile) {
  const box = document.getElementById('sellerReviews');
  if (!box) return;

  const user = window.api.getCurrentUser();
  const isOwner = window.api.isItemOwnedByCurrentUser(item);

  let reviews = [];
  let mine = null;
  try {
    reviews = await window.api.fetchReviews(item.userId);
    if (user && !isOwner) mine = await window.api.fetchMyReviewOf(item.userId);
  } catch (err) {
    return;                              // a missing score is better than an error box
  }
  if (currentItem !== item) return;

  // Nothing to show and nothing to offer: stay out of the way.
  if (!reviews.length && (!user || isOwner)) return;

  const name = profile.fullName || item.sellerName;

  box.hidden = false;
  box.innerHTML = `
    <h4>${reviews.length ? `What people say about ${escapeHtml(name)}` : 'No reviews yet'}</h4>
    ${reviews.map(reviewRow).join('')}
    ${user && !isOwner ? reviewForm(mine, name) : ''}
  `;

  wireStarPicker(box, mine ? mine.rating : 0);
}

function reviewRow(review) {
  return `
    <div class="review-row">
      <div class="review-row-top">
        <span class="review-author">${escapeHtml(review.authorName)}</span>
        <span class="stars" aria-label="${review.rating} out of 5">${stars(review.rating)}</span>
      </div>
      ${review.body ? `<p class="review-body">${escapeHtml(review.body)}</p>` : ''}
      <span class="review-when">${escapeHtml(timeAgo(review.createdAt))}</span>
    </div>`;
}

function reviewForm(mine, name) {
  return `
    <form id="reviewForm" class="review-form">
      <label class="form-label">${mine ? 'Your review' : `Dealt with ${escapeHtml(name)}?`}</label>
      <div class="star-picker" id="starPicker" role="radiogroup" aria-label="Rating">
        ${[1, 2, 3, 4, 5].map(n => `
          <button type="button" class="star-btn" data-star="${n}" role="radio"
                  aria-checked="false" aria-label="${n} star${n === 1 ? '' : 's'}">★</button>`).join('')}
      </div>
      <input type="hidden" id="reviewRating" value="${mine ? mine.rating : ''}">
      <textarea id="reviewBody" rows="2" maxlength="500"
                placeholder="Turned up on time? Was it as described?">${escapeHtml(mine ? mine.body || '' : '')}</textarea>
      <div class="modal-actions-row">
        ${mine ? '<button type="button" class="btn btn-secondary" data-action="delete-review">Remove</button>' : ''}
        <button type="submit" class="btn btn-primary" id="submitReviewBtn">${mine ? 'Update review' : 'Post review'}</button>
      </div>
      <p class="upload-hint">You can review someone you have messaged. One review each, and you can rewrite it.</p>
    </form>`;
}

function wireStarPicker(box, initial) {
  const picker = box.querySelector('#starPicker');
  const value = box.querySelector('#reviewRating');
  if (!picker || !value) return;

  const paint = n => {
    picker.querySelectorAll('.star-btn').forEach(btn => {
      const star = Number(btn.dataset.star);
      btn.classList.toggle('lit', star <= n);
      btn.setAttribute('aria-checked', String(star === n));
    });
  };

  picker.addEventListener('click', event => {
    const btn = event.target.closest('[data-star]');
    if (!btn) return;
    value.value = btn.dataset.star;
    paint(Number(btn.dataset.star));
  });

  paint(Number(initial) || 0);
}

function detailMarkup(item) {
  const user = window.api.getCurrentUser();
  const isOwner = window.api.isItemOwnedByCurrentUser(item);
  const isSold = Boolean(item.isSold);
  const isFav = window.api.isFavorite(item.id);
  const hrsLeft = isSold && item.soldAt ? hoursUntilPurge(item.soldAt) : null;
  const type = item.listingType || 'sell';
  const photos = (item.imageUrls && item.imageUrls.length)
    ? item.imageUrls
    : [item.imageUrl || PLACEHOLDER_IMAGE];

  const phone = item.sellerPhone || '';
  const whatsapp = (item.sellerWhatsapp || '').replace(/[^\d]/g, '');
  const instagram = (item.sellerInstagram || '').replace(/^@/, '').trim();

  // What the seller is actually asking for, in words, so the opening WhatsApp
  // message makes sense on a giveaway and on a swap as well as on a sale.
  const askingFor =
    type === 'free' ? 'free' :
    type === 'barter' ? `a swap for ${item.barterWant || 'something'}` :
    formatPrice(item.price);

  const waMessage = encodeURIComponent(
    `Hi ${item.sellerName}, I saw your listing "${item.title}" (${askingFor}) on PR Marketplace. Is it still available?`
  );

  const priceLine =
    type === 'free'
      ? '<div class="detail-price is-free">Free \u2014 giving it away</div>'
      : type === 'barter'
        ? `<div class="detail-price is-swap">Swap${item.price > 0 ? ` \u00b7 or ${formatPrice(item.price)}` : ''}</div>`
        : `<div class="detail-price ${isSold ? 'line-through' : ''}">${formatPrice(item.price)}</div>`;

  return `
    <div class="detail-gallery">
      <div class="detail-gallery-track" id="detailGalleryTrack">
        ${photos.map((url, i) => `
          <img class="detail-gallery-slide" src="${escapeHtml(url || PLACEHOLDER_IMAGE)}"
               alt="${escapeHtml(item.title)} \u2014 photo ${i + 1} of ${photos.length}"
               data-slide="${i}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async">`).join('')}
      </div>

      <button type="button" class="detail-expand-btn" data-action="zoom" title="View full size" aria-label="View photo full size">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
      </button>

      ${photos.length > 1 ? `
        <div class="detail-gallery-dots" id="detailGalleryDots" role="tablist" aria-label="Photos">
          ${photos.map((_, i) => `
            <button type="button" class="gallery-dot ${i === 0 ? 'active' : ''}" data-goto="${i}"
                    role="tab" aria-selected="${i === 0}" aria-label="Photo ${i + 1}"></button>`).join('')}
        </div>` : ''}
    </div>

    ${isSold ? `
      <div class="sold-notice-box">
        <strong>This item is sold.</strong>
        ${hrsLeft ? ` It comes off the marketplace in about ${hrsLeft} hour${hrsLeft === 1 ? '' : 's'}.` : ' It is being removed now.'}
      </div>` : ''}

    <div class="detail-header">
      <div class="detail-header-row">
        <div class="detail-tags">
          <span class="tag tag-category">${escapeHtml(item.category)}</span>
          <span class="tag tag-condition">${escapeHtml(item.condition)}</span>
          ${type === 'free' ? '<span class="tag tag-free">Free</span>' : ''}
          ${type === 'barter' ? '<span class="tag tag-swap">Swap</span>' : ''}
          ${item.isUrgent && !isSold ? '<span class="tag tag-urgent">Leaving campus</span>' : ''}
          ${isSold ? '<span class="tag tag-sold">Sold</span>' : ''}
        </div>
        <button type="button" class="fav-toggle-btn ${isFav ? 'is-fav' : ''}" data-action="fav" aria-pressed="${isFav}">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span>${isFav ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      <h2 class="detail-title">${escapeHtml(item.title)}</h2>
      ${priceLine}
      ${type === 'barter' && item.barterWant
        ? `<div class="detail-swap-want"><strong>Wants in exchange:</strong> ${escapeHtml(item.barterWant)}</div>`
        : ''}
      <div class="detail-posted">Posted ${escapeHtml(timeAgo(item.createdAt))}</div>
    </div>

    <div class="detail-desc">
      <strong>Description</strong>
      <p>${escapeHtml(item.description || 'The seller did not add a description.')}</p>
      <p class="detail-meta">Area: ${escapeHtml(item.location)}</p>
      ${item.pickupSpot
        ? `<p class="detail-meta detail-pickup">Usual pickup: <strong>${escapeHtml(item.pickupSpot)}</strong></p>`
        : ''}
    </div>

    <div class="seller-contact-card" id="sellerCardSlot">
      <div class="seller-profile-row">
        <div class="seller-avatar">${escapeHtml(initials(item.sellerName, 'S'))}</div>
        <div class="seller-info">
          <h4>${escapeHtml(item.sellerName)}</h4>
          <div class="seller-meta"></div>
          ${phone && user ? `<div class="seller-phone">${escapeHtml(phone)}</div>` : ''}
        </div>
      </div>

      ${isOwner ? ownerPanel(item, isSold) : buyerPanel(item, { user, isSold, phone, whatsapp, instagram, waMessage })}

      <div class="review-block" id="sellerReviews" hidden></div>
    </div>
  `;
}

/* ============================================================== gallery === */

/**
 * Dots follow the scroll rather than driving it. The track is a plain
 * scroll-snap strip, so swiping works with no JavaScript at all and this only
 * has to keep the indicator honest - which means a dropped listener degrades
 * to a gallery that still swipes.
 */
function wireGallery() {
  const track = document.getElementById('detailGalleryTrack');
  const dots = document.getElementById('detailGalleryDots');
  if (!track) return;

  const update = () => {
    const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    dots?.querySelectorAll('.gallery-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
      dot.setAttribute('aria-selected', String(i === index));
    });
  };

  track.addEventListener('scroll', () => {
    clearTimeout(track._dotTimer);
    track._dotTimer = setTimeout(update, 60);
  }, { passive: true });

  dots?.addEventListener('click', event => {
    const dot = event.target.closest('[data-goto]');
    if (!dot) return;
    track.scrollTo({ left: track.clientWidth * Number(dot.dataset.goto), behavior: 'smooth' });
  });
}

/** Whichever photo is on screen right now, for the fullscreen viewer. */
function visiblePhotoUrl() {
  const track = document.getElementById('detailGalleryTrack');
  if (!track) return (currentItem && currentItem.imageUrl) || PLACEHOLDER_IMAGE;
  const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const slide = track.querySelector(`[data-slide="${index}"]`);
  return slide?.getAttribute('src') || (currentItem && currentItem.imageUrl) || PLACEHOLDER_IMAGE;
}

function ownerPanel(item, isSold) {
  return `
    <div class="owner-panel">
      <div class="seller-ownership-banner">This is your listing</div>

      <div class="owner-actions">
        <button class="contact-btn btn-edit-listing" data-action="edit">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
          <span>Edit listing</span>
        </button>

        ${isSold ? `
          <button class="contact-btn btn-mark-sold" data-action="relist">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span>Put back on sale</span>
          </button>` : `
          <button class="contact-btn btn-mark-sold" data-action="sold">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Mark as sold</span>
          </button>`}

        <button class="contact-btn btn-delete-listing" data-action="delete">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Delete listing</span>
        </button>
      </div>

      <p class="owner-hint">Marking an item sold takes it off the marketplace ${window.PRConfig.SOLD_ITEM_LIFETIME_HOURS} hours later. Buyer messages are in your Messages tab.</p>
    </div>
  `;
}

function buyerPanel(item, { user, isSold, phone, whatsapp, instagram, waMessage }) {
  const type = item.listingType || 'sell';

  // Offered only when the seller published a UPI ID and there is actually a
  // sum to send. A giveaway has nothing to pay, and a swap only does when the
  // seller named a cash difference.
  const canPay = Boolean(item.sellerUpiVpa) && item.price > 0 && type !== 'free';

  if (isSold) {
    return `
      <div class="sold-disabled-notice">
        <p>Contact options are closed because this item is sold.</p>
      </div>`;
  }

  if (!user) {
    // Guests can browse the whole marketplace; contact details are the point
    // at which an identity starts to matter, for the seller's sake as much
    // as anything.
    return `
      <div class="guest-prompt">
        <p>Log in to message ${escapeHtml(item.sellerName)} or see their contact details.</p>
        <button type="button" class="btn btn-primary" data-action="login">Log in or register</button>
      </div>`;
  }

  return `
    <div class="item-chatbox-card">
      <div class="chatbox-header-bar">
        <div class="chatbox-header-title">
          <span class="chat-online-dot"></span>
          <h4>Chat with ${escapeHtml(item.sellerName)}</h4>
        </div>
        <span class="chat-security-tag">Private thread</span>
      </div>

      <div class="chat-messages-thread" id="chatMessagesThread">
        <div class="chat-loading">Loading messages…</div>
      </div>

      <div class="quick-replies" id="quickReplies">
        ${quickReplyOptions(type, item).map(
          text => `<button type="button" class="quick-reply-chip" data-quick="${escapeHtml(text)}">${escapeHtml(text)}</button>`
        ).join('')}
      </div>

      <form class="chat-input-bar" id="chatInputForm">
        <input type="text" id="chatMessageInput" maxlength="2000"
               placeholder="${type === 'barter'
                 ? 'Offer something in exchange…'
                 : type === 'free'
                   ? 'Ask if it is still going…'
                   : 'Ask about price, condition or meetup…'}" autocomplete="off" required>
        <button type="submit" class="btn-send-chat">
          <span>Send</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>

    <div class="contact-actions-grid">
      ${phone ? `
        <a href="tel:${escapeHtml(phone)}" class="contact-btn btn-phone">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>Call ${escapeHtml(phone)}</span>
        </a>` : ''}

      ${whatsapp ? `
        <a href="https://wa.me/${escapeHtml(whatsapp)}?text=${waMessage}" target="_blank" rel="noopener noreferrer" class="contact-btn btn-whatsapp">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.34 4.95L2 22l5.23-1.37a9.9 9.9 0 0 0 4.81 1.23h.01c5.5 0 9.96-4.46 9.96-9.96 0-2.66-1.04-5.16-2.92-7.04A9.88 9.88 0 0 0 12.04 2zm5.8 14.13c-.24.68-1.4 1.3-1.95 1.35-.5.05-.96.23-3.24-.68-2.73-1.08-4.47-3.85-4.6-4.03-.14-.18-1.1-1.46-1.1-2.79s.7-1.98.94-2.25c.25-.27.54-.34.72-.34.18 0 .36 0 .52.01.17.01.39-.06.61.47.23.54.77 1.87.84 2.01.07.14.11.3.02.48-.09.18-.14.29-.27.45-.14.16-.29.35-.41.47-.14.14-.28.29-.12.57.16.27.71 1.17 1.53 1.9 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.22.61-.13.25.09 1.57.74 1.84.88.27.13.45.2.52.31.07.11.07.63-.17 1.31z"/></svg>
          <span>WhatsApp</span>
        </a>` : ''}

      ${instagram ? `
        <a href="https://instagram.com/${escapeHtml(instagram)}" target="_blank" rel="noopener noreferrer" class="contact-btn btn-instagram">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          <span>@${escapeHtml(instagram)}</span>
        </a>` : ''}

      ${canPay ? `
        <button type="button" class="contact-btn btn-pay" data-action="pay">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          <span>Pay ${escapeHtml(item.sellerName)} ${escapeHtml(formatPrice(item.price))} by UPI</span>
        </button>` : ''}

      <button type="button" class="contact-btn btn-report" data-action="report">
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        <span>Report this listing</span>
      </button>
    </div>
  `;
}

/**
 * Openers, by mode. Kept to three: a longer list becomes a menu to read
 * rather than a shortcut to tap.
 */
function quickReplyOptions(type, item) {
  if (type === 'free') {
    return ['Is this still available?', 'Can I collect it today?', 'Where should I meet you?'];
  }
  if (type === 'barter') {
    return [
      'Is this still available?',
      item.barterWant ? `I have ${item.barterWant} \u2014 interested?` : 'What would you swap it for?',
      'Can we meet to compare?'
    ];
  }
  return ['Is this still available?', 'Would you take a little less?', 'Can we meet today?'];
}

/* ================================================================= chat === */

async function startChat(item) {
  const user = window.api.getCurrentUser();
  if (!user || window.api.isItemOwnedByCurrentUser(item)) return;

  const thread = document.getElementById('chatMessagesThread');
  if (!thread) return;

  const channelId = window.api.itemChannelId(item.id, user.id);

  try {
    const messages = await window.api.fetchMessages('item', channelId);
    renderThread(thread, messages, user, item);
  } catch (err) {
    thread.innerHTML = `<div class="chat-loading">${escapeHtml(describeError(err))}</div>`;
    return;
  }

  // Live updates, so a reply appears without reopening the listing.
  unsubscribeChat = window.api.subscribeToMessages('item', channelId, message => {
    appendMessage(thread, message, user);
  });
}

function renderThread(thread, messages, user, item) {
  if (!messages.length) {
    thread.innerHTML = `
      <div class="chat-empty">
        Say hello to ${escapeHtml(item.sellerName)}. Only the two of you can read this thread.
      </div>`;
    return;
  }
  thread.innerHTML = messages.map(m => messageMarkup(m, user)).join('');
  thread.scrollTop = thread.scrollHeight;
}

function appendMessage(thread, message, user) {
  if (thread.querySelector('.chat-empty')) thread.innerHTML = '';
  if (thread.querySelector(`[data-msg="${CSS.escape(message.id)}"]`)) return;
  thread.insertAdjacentHTML('beforeend', messageMarkup(message, user));
  thread.scrollTop = thread.scrollHeight;
}

function messageMarkup(message, user) {
  const mine = user && message.senderId === user.id;
  return `
    <div class="chat-msg ${mine ? 'mine' : ''}" data-msg="${escapeHtml(message.id)}">
      ${mine ? '' : `<span class="chat-msg-sender">${escapeHtml(message.senderName)}</span>`}
      <span class="chat-msg-body">${escapeHtml(message.body)}</span>
      <span class="chat-msg-time">${escapeHtml(timeAgo(message.createdAt))}</span>
    </div>`;
}

async function onContentSubmit(event) {
  if (event.target.id === 'reviewForm') {
    event.preventDefault();
    await postReview();
    return;
  }
  if (event.target.id !== 'chatInputForm') return;
  event.preventDefault();

  const input = document.getElementById('chatMessageInput');
  const thread = document.getElementById('chatMessagesThread');
  const user = window.api.getCurrentUser();
  if (!input || !currentItem || !user) return;

  const body = input.value.trim();
  if (!body) return;

  input.value = '';
  const channelId = window.api.itemChannelId(currentItem.id, user.id);

  try {
    const message = await window.api.sendMessage('item', channelId, body);
    appendMessage(thread, message, user);
  } catch (err) {
    input.value = body;
    showToast(describeError(err));
  }
}

async function postReview() {
  const rating = Number(document.getElementById('reviewRating')?.value);
  const body = document.getElementById('reviewBody')?.value || '';
  const button = document.getElementById('submitReviewBtn');

  if (!rating) {
    showToast('Pick a star rating first.');
    return;
  }
  if (!currentItem) return;

  const item = currentItem;
  if (button) button.disabled = true;

  try {
    await window.api.submitReview({ subjectId: item.userId, rating, body });
    showToast('Thanks — your review is up.');
    // Re-read the seller card: the trigger has just moved their average.
    hydrateSellerCard(item);
  } catch (err) {
    showToast(describeError(err), 5000);
  } finally {
    if (button) button.disabled = false;
  }
}

/* ============================================================== actions === */

async function onContentClick(event) {
  // A tapped opener fills the box rather than sending it. Nobody should fire
  // off a message they have not read, least of all one about money.
  const quick = event.target.closest('[data-quick]');
  if (quick) {
    const input = document.getElementById('chatMessageInput');
    if (input) {
      input.value = quick.dataset.quick;
      input.focus();
    }
    return;
  }

  const trigger = event.target.closest('[data-action]');
  if (!trigger || !currentItem) return;

  const action = trigger.dataset.action;

  if (action === 'fav') {
    window.api.toggleFavorite(currentItem.id);
    const isFav = window.api.isFavorite(currentItem.id);
    trigger.classList.toggle('is-fav', isFav);
    trigger.setAttribute('aria-pressed', String(isFav));
    trigger.querySelector('svg')?.setAttribute('fill', isFav ? 'currentColor' : 'none');
    trigger.querySelector('span').textContent = isFav ? 'Saved' : 'Save';
    showToast(isFav ? 'Saved' : 'Removed from saved');
    hooks.onFeedChanged?.({ soft: true });
    return;
  }

  if (action === 'delete-review') {
    try {
      await window.api.deleteMyReview(currentItem.userId);
      showToast('Review removed.');
      hydrateSellerCard(currentItem);
    } catch (err) {
      showToast(describeError(err));
    }
    return;
  }

  if (action === 'zoom') {
    hooks.openZoom?.(visiblePhotoUrl());
    return;
  }

  if (action === 'login') {
    hooks.requireLogin?.(`Log in to contact ${currentItem.sellerName} about “${currentItem.title}”.`);
    return;
  }

  if (action === 'edit') {
    const item = currentItem;
    close();
    hooks.onEdit?.(item);
    return;
  }

  if (action === 'sold') {
    const ok = await confirmAction({
      title: 'Mark this as sold?',
      message: `“${currentItem.title}” stops appearing to buyers and is removed from the marketplace in ${window.PRConfig.SOLD_ITEM_LIFETIME_HOURS} hours.`,
      confirmLabel: 'Mark as sold',
      danger: false
    });
    if (!ok) return;
    await runOwnerAction(() => window.api.markItemAsSold(currentItem.id), 'Marked as sold.');
    return;
  }

  if (action === 'relist') {
    await runOwnerAction(() => window.api.relistItem(currentItem.id), 'Back on sale.');
    return;
  }

  if (action === 'delete') {
    const ok = await confirmAction({
      title: 'Delete this listing?',
      message: `“${currentItem.title}” and its photo are removed for good. This cannot be undone.`,
      confirmLabel: 'Delete listing'
    });
    if (!ok) return;
    await runOwnerAction(() => window.api.deleteItem(currentItem.id), 'Listing deleted.', { closeAfter: true });
    return;
  }

  if (action === 'pay') {
    hooks.onPay?.(currentItem);
    return;
  }

  if (action === 'report') {
    if (!window.api.getCurrentUser()) {
      hooks.requireLogin?.('Log in to report a listing. Reports are anonymous to the seller.');
      return;
    }
    openReportModal(currentItem);
  }
}

async function runOwnerAction(work, successMessage, { closeAfter = false } = {}) {
  try {
    await work();
    showToast(successMessage);
    hooks.onFeedChanged?.();
    if (closeAfter) {
      close();
    } else if (currentItem) {
      await openItemDetail(currentItem.id);
    }
  } catch (err) {
    showToast(describeError(err));
  }
}

/* =============================================================== report === */

let reportTargetId = null;

function wireReportModal() {
  const reportModal = document.getElementById('reportModal');
  const form = document.getElementById('reportForm');

  document.getElementById('closeReportModalBtn')?.addEventListener('click', () => closeModal(reportModal));
  document.getElementById('cancelReportBtn')?.addEventListener('click', () => closeModal(reportModal));

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!reportTargetId) return;

    const reason = document.getElementById('reportReason').value;
    const details = document.getElementById('reportDetails').value.trim();
    const full = details ? `${reason} — ${details}` : reason;

    const submitBtn = document.getElementById('submitReportBtn');
    submitBtn.disabled = true;

    try {
      await window.api.reportItem(reportTargetId, full);
      closeModal(reportModal);
      showToast('Report sent. Thanks for flagging it.');
      form.reset();
    } catch (err) {
      showToast(describeError(err));
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function openReportModal(item) {
  reportTargetId = item.id;
  openModal(document.getElementById('reportModal'));
}
