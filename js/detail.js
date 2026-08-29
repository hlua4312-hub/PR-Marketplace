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

  if (!item.isSold) startChat(item);
}

function detailMarkup(item) {
  const user = window.api.getCurrentUser();
  const isOwner = window.api.isItemOwnedByCurrentUser(item);
  const isSold = Boolean(item.isSold);
  const isFav = window.api.isFavorite(item.id);
  const hrsLeft = isSold && item.soldAt ? hoursUntilPurge(item.soldAt) : null;
  const image = item.imageUrl || PLACEHOLDER_IMAGE;

  const phone = item.sellerPhone || '';
  const whatsapp = (item.sellerWhatsapp || '').replace(/[^\d]/g, '');
  const instagram = (item.sellerInstagram || '').replace(/^@/, '').trim();

  const waMessage = encodeURIComponent(
    `Hi ${item.sellerName}, I saw your listing "${item.title}" for ${formatPrice(item.price)} on PR Marketplace. Is it still available?`
  );

  return `
    <div class="detail-image-box">
      <img id="detailItemImg" src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}">
      <button type="button" class="detail-expand-btn" data-action="zoom" title="View full size" aria-label="View photo full size">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
      </button>
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
          ${isSold ? '<span class="tag tag-sold">Sold</span>' : ''}
        </div>
        <button type="button" class="fav-toggle-btn ${isFav ? 'is-fav' : ''}" data-action="fav" aria-pressed="${isFav}">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span>${isFav ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      <h2 class="detail-title">${escapeHtml(item.title)}</h2>
      <div class="detail-price ${isSold ? 'line-through' : ''}">${formatPrice(item.price)}</div>
      <div class="detail-posted">Posted ${escapeHtml(timeAgo(item.createdAt))}</div>
    </div>

    <div class="detail-desc">
      <strong>Description</strong>
      <p>${escapeHtml(item.description || 'The seller did not add a description.')}</p>
      <p class="detail-meta">Meetup: ${escapeHtml(item.location)}</p>
    </div>

    ${item.paymentQrUrl ? `
      <div class="payment-qr-card">
        <div class="qr-header-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <strong>Direct Seller Payment QR Code</strong>
        </div>
        <div class="qr-image-wrapper">
          <img src="${escapeHtml(item.paymentQrUrl)}" alt="Seller payment QR code">
        </div>
        <span class="qr-pay-hint">Scan with GPay, PhonePe, Paytm, BHIM UPI or Venmo to pay the seller directly</span>
      </div>` : ''}

    <div class="seller-contact-card">
      <div class="seller-profile-row">
        <div class="seller-avatar">${escapeHtml(initials(item.sellerName, 'S'))}</div>
        <div class="seller-info">
          <h4>${escapeHtml(item.sellerName)}</h4>
          ${phone ? `<div class="seller-phone">${escapeHtml(phone)}</div>` : ''}
        </div>
      </div>

      ${isOwner ? ownerPanel(item, isSold) : buyerPanel(item, { user, isSold, phone, whatsapp, instagram, waMessage })}
    </div>
  `;
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
  if (isSold) {
    return `
      <div class="sold-disabled-notice">
        <p>Contact options are closed because this item is sold.</p>
      </div>`;
  }

  if (!user) {
    return `
      <div class="sold-disabled-notice">
        <p>Log in to message this seller or see their contact details.</p>
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

      <form class="chat-input-bar" id="chatInputForm">
        <input type="text" id="chatMessageInput" maxlength="2000"
               placeholder="Ask about price, condition or meetup…" autocomplete="off" required>
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

      <button type="button" class="contact-btn btn-report" data-action="report">
        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        <span>Report this listing</span>
      </button>
    </div>
  `;
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

/* ============================================================== actions === */

async function onContentClick(event) {
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

  if (action === 'zoom') {
    hooks.openZoom?.(currentItem.imageUrl || PLACEHOLDER_IMAGE);
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

  if (action === 'report') {
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
