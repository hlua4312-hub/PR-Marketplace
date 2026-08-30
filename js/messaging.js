/**
 * PR MARKETPLACE - MESSAGING
 *
 * The community room, one-to-one chats, and the inbox that replaced the
 * notifications tab.
 *
 * Everything here goes through the messages table and subscribes to Realtime.
 * The previous version kept these conversations in localStorage, so two phones
 * never saw each other's messages while the header claimed to be live.
 */

import {
  escapeHtml, timeAgo, showToast, openModal, closeModal,
  describeError, initials
} from './ui.js';

const COMMUNITY_CHANNEL = 'community';

let els = {};
let hooks = {};

let unsubscribeCommunity = null;
let unsubscribePrivate = null;
let unsubscribeInbox = null;

let activeThread = null;        // { channelType, channelId, peerName, subtitle }
let openedPrivateFromCommunity = false;
let inboxThreads = [];

export function initMessaging(injected) {
  hooks = injected;             // { onOpenItem }

  els = {
    communityModal: document.getElementById('allChatModal'),
    communityThread: document.getElementById('allChatMessagesThread'),
    communityForm: document.getElementById('allChatInputForm'),
    communityInput: document.getElementById('allChatMessageInput'),

    privateModal: document.getElementById('privateChatModal'),
    privateThread: document.getElementById('privateChatMessagesThread'),
    privateForm: document.getElementById('privateChatInputForm'),
    privateInput: document.getElementById('privateChatMessageInput'),
    privateName: document.getElementById('privateChatRecipientName'),
    privateAvatar: document.getElementById('privateChatRecipientAvatar'),
    privateSubtitle: document.getElementById('privateChatSubtitle'),

    inboxModal: document.getElementById('notificationsModal'),
    inboxList: document.getElementById('notificationsList'),
    inboxBadge: document.getElementById('notifBadge')
  };

  wireCommunity();
  wirePrivate();
  wireInbox();
}

/* ============================================================ community === */

function wireCommunity() {
  document.getElementById('btnOpenAllChat')?.addEventListener('click', openCommunityChat);
  document.getElementById('closeAllChatModalBtn')?.addEventListener('click', closeCommunityChat);

  els.communityForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const body = els.communityInput.value.trim();
    if (!body) return;

    els.communityInput.value = '';
    try {
      await window.api.sendMessage('community', COMMUNITY_CHANNEL, body);
    } catch (err) {
      els.communityInput.value = body;
      showToast(describeError(err));
    }
  });

  els.communityThread?.addEventListener('click', event => {
    const avatar = event.target.closest('[data-peer-id]');
    if (!avatar) return;
    openPrivateChat(
      { id: avatar.dataset.peerId, name: avatar.dataset.peerName },
      { fromCommunity: true }
    );
  });
}

export async function openCommunityChat() {
  const user = window.api.getCurrentUser();
  if (!user) {
    hooks.requireLogin?.('Log in to join the community chat.');
    return;
  }

  openModal(els.communityModal);
  els.communityThread.innerHTML = '<div class="chat-loading">Loading the room…</div>';

  try {
    const messages = await window.api.fetchMessages('community', COMMUNITY_CHANNEL);
    renderCommunity(messages, user);
  } catch (err) {
    els.communityThread.innerHTML = `<div class="chat-loading">${escapeHtml(describeError(err))}</div>`;
    return;
  }

  unsubscribeCommunity = window.api.subscribeToMessages('community', COMMUNITY_CHANNEL, message => {
    appendCommunity(message, user);
  });
}

export function closeCommunityChat() {
  unsubscribeCommunity?.();
  unsubscribeCommunity = null;
  closeModal(els.communityModal);
}

export function isCommunityOpen() {
  return Boolean(els.communityModal) && !els.communityModal.classList.contains('hidden');
}

function renderCommunity(messages, user) {
  if (!messages.length) {
    els.communityThread.innerHTML = `
      <div class="chat-empty">
        Nobody has posted yet. Ask for what you're looking for — everyone on PR Marketplace can see this room.
      </div>`;
    return;
  }
  els.communityThread.innerHTML = messages.map(m => communityMarkup(m, user)).join('');
  els.communityThread.scrollTop = els.communityThread.scrollHeight;
}

function appendCommunity(message, user) {
  if (!els.communityThread) return;
  if (els.communityThread.querySelector('.chat-empty')) els.communityThread.innerHTML = '';
  if (els.communityThread.querySelector(`[data-msg="${CSS.escape(message.id)}"]`)) return;

  els.communityThread.insertAdjacentHTML('beforeend', communityMarkup(message, user));
  els.communityThread.scrollTop = els.communityThread.scrollHeight;
}

function communityMarkup(message, user) {
  const mine = user && message.senderId === user.id;
  return `
    <div class="all-chat-msg-row ${mine ? 'mine' : ''}" data-msg="${escapeHtml(message.id)}">
      <div class="all-chat-avatar"
           ${mine ? '' : `data-peer-id="${escapeHtml(message.senderId)}" data-peer-name="${escapeHtml(message.senderName)}" role="button" tabindex="0" title="Message ${escapeHtml(message.senderName)} privately"`}>
        ${escapeHtml(initials(message.senderName))}
      </div>
      <div class="all-chat-msg-box">
        <div class="all-chat-sender-header">
          <span class="all-chat-sender-name">${escapeHtml(mine ? 'You' : message.senderName)}</span>
          <span class="all-chat-time">${escapeHtml(timeAgo(message.createdAt))}</span>
        </div>
        <div class="all-chat-msg-text">${escapeHtml(message.body)}</div>
      </div>
    </div>`;
}

/* ============================================================== private === */

function wirePrivate() {
  document.getElementById('closePrivateChatModalBtn')?.addEventListener('click', () => closePrivateChat());
  document.getElementById('btnBackFromPrivateChat')?.addEventListener('click', () => closePrivateChat({ back: true }));

  els.privateForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const body = els.privateInput.value.trim();
    if (!body || !activeThread) return;

    const user = window.api.getCurrentUser();
    if (!user) return;

    els.privateInput.value = '';

    try {
      await window.api.sendMessage(activeThread.channelType, activeThread.channelId, body);
    } catch (err) {
      els.privateInput.value = body;
      showToast(describeError(err));
    }
  });
}

/**
 * Open one conversation, whichever kind it is.
 *
 * A listing thread and a private chat are the same thing on screen, and the
 * seller has no other way to read one: the chat box on a listing is drawn for
 * buyers, so an owner opening their own listing sees the manage controls and
 * nothing else. Tapping a message used to land there, which meant a seller
 * could not answer a buyer at all.
 */
export async function openThread({ channelType, channelId, peerName, subtitle, fromCommunity = false }) {
  const user = window.api.getCurrentUser();
  if (!user) {
    hooks.requireLogin?.('Log in to read your messages.');
    return;
  }

  activeThread = { channelType, channelId, peerName: peerName || 'Conversation', subtitle };
  openedPrivateFromCommunity = fromCommunity;

  if (els.privateName) els.privateName.textContent = activeThread.peerName;
  if (els.privateAvatar) els.privateAvatar.textContent = initials(activeThread.peerName);
  if (els.privateSubtitle) {
    els.privateSubtitle.textContent = subtitle || 'Private conversation';
  }

  if (fromCommunity) closeModal(els.communityModal);
  openModal(els.privateModal);
  els.privateThread.innerHTML = '<div class="chat-loading">Loading conversation…</div>';

  let messages = [];
  try {
    messages = await window.api.fetchMessages(channelType, channelId);
  } catch (err) {
    els.privateThread.innerHTML = `<div class="chat-loading">${escapeHtml(describeError(err))}</div>`;
    return;
  }

  // The inbox only knows who sent the newest message, which may be this user.
  // The other party's name comes from the thread itself.
  const fromOther = messages.find(m => m.senderId !== user.id);
  if (fromOther && els.privateName) {
    activeThread.peerName = fromOther.senderName;
    els.privateName.textContent = fromOther.senderName;
    els.privateAvatar.textContent = initials(fromOther.senderName);
  }

  renderPrivate(messages, user, { name: activeThread.peerName });

  if (channelType === 'item') {
    // channelId is "<itemId>:<buyerId>", so the listing is recoverable and
    // worth naming - "About a listing" tells the seller nothing when they
    // have several.
    const itemId = channelId.split(':')[0];
    window.api.fetchItemById(itemId).then(item => {
      if (item && els.privateSubtitle && activeThread?.channelId === channelId) {
        els.privateSubtitle.textContent = `About “${item.title}”`;
      }
    }).catch(() => {});
  }

  unsubscribePrivate?.();
  unsubscribePrivate = window.api.subscribeToMessages(channelType, channelId, message => {
    appendPrivate(message, user);
  });
}

/** A one-to-one chat, opened from an avatar in the community room. */
export async function openPrivateChat(peer, { fromCommunity = false } = {}) {
  const user = window.api.getCurrentUser();
  if (!user) {
    hooks.requireLogin?.('Log in to send a private message.');
    return;
  }
  if (peer.id === user.id) {
    showToast('That is you.');
    return;
  }

  await openThread({
    channelType: 'direct',
    channelId: window.api.directChannelId(user.id, peer.id),
    peerName: peer.name,
    subtitle: 'Private conversation',
    fromCommunity
  });
}

export function closePrivateChat({ back = false } = {}) {
  unsubscribePrivate?.();
  unsubscribePrivate = null;
  activeThread = null;
  closeModal(els.privateModal);

  if (back && openedPrivateFromCommunity) {
    openModal(els.communityModal);
  }
  openedPrivateFromCommunity = false;
}

export function isPrivateOpen() {
  return Boolean(els.privateModal) && !els.privateModal.classList.contains('hidden');
}

function renderPrivate(messages, user, peer) {
  if (!messages.length) {
    els.privateThread.innerHTML = `
      <div class="chat-empty">
        This is the start of your conversation with ${escapeHtml(peer.name)}.
      </div>`;
    return;
  }
  els.privateThread.innerHTML = messages.map(m => privateMarkup(m, user)).join('');
  els.privateThread.scrollTop = els.privateThread.scrollHeight;
}

function appendPrivate(message, user) {
  if (!els.privateThread) return;
  if (els.privateThread.querySelector('.chat-empty')) els.privateThread.innerHTML = '';
  if (els.privateThread.querySelector(`[data-msg="${CSS.escape(message.id)}"]`)) return;

  els.privateThread.insertAdjacentHTML('beforeend', privateMarkup(message, user));
  els.privateThread.scrollTop = els.privateThread.scrollHeight;
}

function privateMarkup(message, user) {
  const mine = user && message.senderId === user.id;
  return `
    <div class="all-chat-msg-row ${mine ? 'mine' : ''}" data-msg="${escapeHtml(message.id)}">
      <div class="all-chat-avatar">${escapeHtml(initials(message.senderName))}</div>
      <div class="all-chat-msg-box">
        <div class="all-chat-sender-header">
          <span class="all-chat-sender-name">${escapeHtml(mine ? 'You' : message.senderName)}</span>
          <span class="all-chat-time">${escapeHtml(timeAgo(message.createdAt))}</span>
        </div>
        <div class="all-chat-msg-text">${escapeHtml(message.body)}</div>
      </div>
    </div>`;
}

/* ================================================================ inbox === */

function wireInbox() {
  document.getElementById('navNotifications')?.addEventListener('click', openInbox);
  document.getElementById('closeNotificationsModalBtn')?.addEventListener('click', closeInbox);

  document.getElementById('btnMarkAllNotifsRead')?.addEventListener('click', () => {
    window.api.markAllSeen(inboxThreads.map(t => t.id));
    renderInbox();
    updateInboxBadge();
  });

  els.inboxList?.addEventListener('click', event => {
    const row = event.target.closest('[data-thread]');
    if (!row) return;

    const { channelType, channelId, peerId, peerName, itemId, messageId } = row.dataset;
    window.api.markThreadSeen(messageId);

    if (channelType === 'direct') {
      closeInbox();
      openThread({ channelType: 'direct', channelId, peerName, subtitle: 'Private conversation' });
    } else if (channelType === 'item') {
      // Opening the listing instead of the thread left a seller looking at
      // their own manage controls with the message nowhere in sight.
      closeInbox();
      openThread({ channelType: 'item', channelId, peerName, subtitle: 'About a listing' });
    } else if (channelType === 'community') {
      closeInbox();
      openCommunityChat();
    }
    updateInboxBadge();
  });
}

export async function openInbox() {
  const user = window.api.getCurrentUser();
  if (!user) {
    hooks.requireLogin?.('Log in to see your messages.');
    return;
  }

  openModal(els.inboxModal);
  document.getElementById('navNotifications')?.classList.add('active');
  els.inboxList.innerHTML = '<p class="section-subtitle">Loading your messages…</p>';

  await refreshInbox();
}

export function closeInbox() {
  closeModal(els.inboxModal);
  document.getElementById('navNotifications')?.classList.remove('active');
}

export function isInboxOpen() {
  return Boolean(els.inboxModal) && !els.inboxModal.classList.contains('hidden');
}

export async function refreshInbox() {
  try {
    inboxThreads = await window.api.fetchInbox();
    renderInbox();
    updateInboxBadge();
  } catch (err) {
    if (els.inboxList) {
      els.inboxList.innerHTML = `<p class="section-subtitle">${escapeHtml(describeError(err))}</p>`;
    }
  }
}

function renderInbox() {
  if (!els.inboxList) return;

  const user = window.api.getCurrentUser();
  if (!inboxThreads.length) {
    els.inboxList.innerHTML = `
      <div class="notif-empty-state">
        <div class="notif-empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h3>No messages yet</h3>
        <p>When someone messages you about a listing, the conversation shows up here.</p>
      </div>`;
    return;
  }

  const seen = window.api.getSeenMessageIds();

  els.inboxList.innerHTML = inboxThreads.map(thread => {
    const unread = !seen.includes(thread.id) && thread.senderId !== user?.id;
    const meta = describeThread(thread, user);

    return `
      <button type="button" class="notif-row ${unread ? 'unread' : ''}"
              data-thread="1"
              data-message-id="${escapeHtml(thread.id)}"
              data-channel-type="${escapeHtml(thread.channelType)}"
              data-channel-id="${escapeHtml(thread.channelId)}"
              data-peer-id="${escapeHtml(meta.peerId || '')}"
              data-peer-name="${escapeHtml(meta.peerName || '')}"
              data-item-id="${escapeHtml(meta.itemId || '')}">
        <div class="notif-avatar">${escapeHtml(initials(meta.peerName || thread.senderName))}</div>
        <div class="notif-body">
          <div class="notif-top">
            <span class="notif-title">${escapeHtml(meta.title)}</span>
            <span class="notif-time">${escapeHtml(timeAgo(thread.createdAt))}</span>
          </div>
          <span class="notif-preview">${escapeHtml(previewOf(thread, user))}</span>
          <span class="notif-kind">${escapeHtml(meta.kind)}</span>
        </div>
        ${unread ? '<span class="notif-dot" aria-label="Unread"></span>' : ''}
      </button>`;
  }).join('');
}

function describeThread(thread, user) {
  if (thread.channelType === 'community') {
    return { title: 'Community chat', kind: 'Everyone', peerName: thread.senderName };
  }

  if (thread.channelType === 'direct') {
    const parts = thread.channelId.split(':');
    const peerId = parts.find(p => p !== user?.id) || parts[0];
    const peerName = thread.senderId === user?.id ? 'Conversation' : thread.senderName;
    return { title: peerName, kind: 'Private message', peerId, peerName };
  }

  const itemId = thread.channelId.split(':')[0];
  return {
    title: thread.senderId === user?.id ? 'Your enquiry' : `${thread.senderName} about a listing`,
    kind: 'Listing enquiry',
    itemId,
    peerName: thread.senderName
  };
}

function previewOf(thread, user) {
  const prefix = thread.senderId === user?.id ? 'You: ' : '';
  const body = thread.body.length > 90 ? `${thread.body.slice(0, 90)}…` : thread.body;
  return prefix + body;
}

export function updateInboxBadge() {
  if (!els.inboxBadge) return;
  const user = window.api.getCurrentUser();
  const seen = window.api.getSeenMessageIds();
  const count = inboxThreads.filter(t => !seen.includes(t.id) && t.senderId !== user?.id).length;

  els.inboxBadge.textContent = count > 99 ? '99+' : String(count);
  els.inboxBadge.classList.toggle('hidden', count === 0);
}

let inboxPoll = null;

/**
 * Keep the unread badge current while the app is open, so a seller notices a
 * buyer's message without reopening the tab.
 *
 * Realtime filters on a single channel_id, and a user has one conversation per
 * counterparty, so holding a live channel for each would mean an unbounded
 * number of subscriptions. Refreshing when the window regains focus, plus a
 * slow interval, covers the same ground for a fraction of the connections.
 */
export function watchForNewMessages() {
  stopWatching();
  if (!window.api.getCurrentUser()) return;

  refreshInbox();
  window.addEventListener('focus', refreshInbox);
  inboxPoll = setInterval(refreshInbox, 60000);
}

export function stopWatching() {
  unsubscribeInbox?.();
  unsubscribeInbox = null;
  window.removeEventListener('focus', refreshInbox);
  if (inboxPoll) {
    clearInterval(inboxPoll);
    inboxPoll = null;
  }
  inboxThreads = [];
  updateInboxBadge();
}
