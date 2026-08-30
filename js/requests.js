/**
 * CAMPUS CART - THE WANTED BOARD
 *
 * The mirror of the feed. A listing says "I have this"; a request says "I need
 * this", and anyone holding it can answer.
 *
 * There is no matching engine on purpose. Pairing requests to listings
 * automatically sounds obvious and behaves badly at campus scale: a few
 * hundred listings produce almost no matches, and a notification feed that
 * never fires reads as a broken feature rather than an empty one. People read
 * the board.
 */

import {
  escapeHtml, formatPrice, timeAgo, showToast, openModal, closeModal,
  confirmAction, describeError
} from './ui.js';
import { renderCategoryOptions } from './campus.js';

let els = {};
let hooks = {};
let editingId = null;
let loadToken = 0;

export function initRequests(injected) {
  hooks = injected;              // { requireLogin, onOpenPeerChat }

  els = {
    board: document.getElementById('requestsBoard'),
    list: document.getElementById('requestsList'),
    main: document.querySelector('.main-content'),
    tabs: document.getElementById('listingTypeTabs'),

    modal: document.getElementById('requestModal'),
    form: document.getElementById('requestForm'),
    title: document.getElementById('requestModalTitle'),
    submitBtn: document.getElementById('submitRequestBtn'),

    fields: {
      title: document.getElementById('requestTitle'),
      category: document.getElementById('requestCategory'),
      description: document.getElementById('requestDescription'),
      budget: document.getElementById('requestBudget'),
      neededBy: document.getElementById('requestNeededBy')
    }
  };

  renderCategoryOptions(els.fields.category,
                        document.getElementById('requestCategoryHint'));

  els.tabs?.addEventListener('click', event => {
    const tab = event.target.closest('[data-board]');
    if (tab) openBoard();
  });

  document.getElementById('btnPostRequest')?.addEventListener('click', openRequestForm);
  document.getElementById('closeRequestModalBtn')?.addEventListener('click', () => closeModal(els.modal));
  document.getElementById('cancelRequestBtn')?.addEventListener('click', () => closeModal(els.modal));

  els.form?.addEventListener('submit', onSubmit);
  els.list?.addEventListener('click', onListClick);
}

/* ================================================================ board === */

export function isBoardOpen() {
  return Boolean(els.main) && els.main.classList.contains('board-mode');
}

export async function openBoard() {
  els.main?.classList.add('board-mode');
  els.board?.classList.remove('hidden');
  syncTabs('requests');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await loadBoard();
}

/** Called by app.js when any other tab is chosen. */
export function closeBoard() {
  els.main?.classList.remove('board-mode');
  els.board?.classList.add('hidden');
}

function syncTabs(active) {
  els.tabs?.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.board === active);
  });
}

export async function loadBoard() {
  if (!els.list) return;

  const token = ++loadToken;
  els.list.innerHTML = '<p class="section-subtitle">Loading requests…</p>';

  try {
    const requests = await window.api.fetchRequests({ status: 'open', pageSize: 50 });
    if (token !== loadToken) return;

    if (!requests.length) {
      els.list.innerHTML = `
        <div class="board-empty">
          <div class="empty-icon" aria-hidden="true">?</div>
          <h3>Nobody has asked for anything yet</h3>
          <p>Post what you are looking for. Someone on campus probably has it sitting in a drawer.</p>
        </div>`;
      return;
    }

    const user = window.api.getCurrentUser();
    els.list.innerHTML = requests.map(r => requestCard(r, user)).join('');
  } catch (err) {
    if (token !== loadToken) return;
    els.list.innerHTML = `<p class="section-subtitle">${escapeHtml(describeError(err))}</p>`;
  }
}

function requestCard(request, user) {
  const mine = Boolean(user && request.userId === user.id);
  const due = dueLabel(request.neededBy);

  return `
    <article class="request-card ${mine ? 'is-mine' : ''}" data-request="${escapeHtml(request.id)}">
      <div class="request-top">
        <span class="request-category">${escapeHtml(request.category)}</span>
        ${due ? `<span class="request-due ${due.urgent ? 'is-urgent' : ''}">${escapeHtml(due.text)}</span>` : ''}
      </div>

      <h3 class="request-title">${escapeHtml(request.title)}</h3>
      ${request.description ? `<p class="request-desc">${escapeHtml(request.description)}</p>` : ''}

      <div class="request-meta">
        <span>${escapeHtml(request.requesterName)}</span>
        <span>·</span>
        <span>${escapeHtml(timeAgo(request.createdAt))}</span>
        ${request.budgetMax !== null
          ? `<span>·</span><span class="request-budget">up to ${escapeHtml(formatPrice(request.budgetMax))}</span>`
          : ''}
      </div>

      <div class="request-actions">
        ${mine ? `
          <button type="button" class="listing-action" data-req-action="edit" data-id="${escapeHtml(request.id)}">Edit</button>
          <button type="button" class="listing-action" data-req-action="fulfilled" data-id="${escapeHtml(request.id)}">Got it</button>
          <button type="button" class="listing-action danger" data-req-action="delete"
                  data-id="${escapeHtml(request.id)}" data-title="${escapeHtml(request.title)}">Delete</button>
        ` : `
          <button type="button" class="btn btn-primary btn-small" data-req-action="offer"
                  data-id="${escapeHtml(request.id)}"
                  data-peer="${escapeHtml(request.userId)}"
                  data-peer-name="${escapeHtml(request.requesterName)}"
                  data-title="${escapeHtml(request.title)}">I have this</button>
        `}
      </div>
    </article>`;
}

/**
 * "Needed by" as something a person reads at a glance. A date on its own makes
 * the reader do arithmetic, which is exactly the work an urgency tag is for.
 */
function dueLabel(neededBy) {
  if (!neededBy) return null;

  const due = new Date(`${neededBy}T23:59:59`);
  if (!Number.isFinite(due.getTime())) return null;

  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: 'Overdue', urgent: true };
  if (days === 0) return { text: 'Needed today', urgent: true };
  if (days === 1) return { text: 'Needed tomorrow', urgent: true };
  if (days <= 7) return { text: `Needed in ${days} days`, urgent: true };
  return { text: `By ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, urgent: false };
}

/* =============================================================== actions === */

async function onListClick(event) {
  const button = event.target.closest('[data-req-action]');
  if (!button) return;

  const { reqAction: action, id, title } = button.dataset;

  if (action === 'offer') {
    // Answering a request is a private message, not a public reply. The
    // opener is filled in for them - "I have this" with nothing after it is
    // the message people fail to write.
    hooks.onOpenPeerChat?.(
      { id: button.dataset.peer, name: button.dataset.peerName },
      `Hi — I saw you're looking for "${title}". I have one.`
    );
    return;
  }

  if (action === 'edit') {
    const request = await window.api.fetchRequestById(id).catch(() => null);
    if (request) openRequestForm(request);
    return;
  }

  if (action === 'fulfilled') {
    await run(() => window.api.updateRequest(id, { status: 'fulfilled' }), 'Marked as found.');
    return;
  }

  if (action === 'delete') {
    const ok = await confirmAction({
      title: 'Delete this request?',
      message: `“${title}” comes off the board for good.`,
      confirmLabel: 'Delete request'
    });
    if (ok) await run(() => window.api.deleteRequest(id), 'Request deleted.');
  }
}

async function run(work, message) {
  try {
    await work();
    showToast(message);
    await loadBoard();
  } catch (err) {
    showToast(describeError(err), 5000);
  }
}

/* ================================================================== form === */

function openRequestForm(request) {
  if (!window.api.getCurrentUser()) {
    hooks.requireLogin?.('Log in to post what you are looking for.');
    return;
  }

  els.form?.reset();
  // `request` arrives as a click event when the button is wired directly.
  const editing = request && request.id ? request : null;
  editingId = editing ? editing.id : null;

  if (editing) {
    els.fields.title.value = editing.title || '';
    els.fields.category.value = editing.category || '';
    els.fields.description.value = editing.description || '';
    els.fields.budget.value = editing.budgetMax ?? '';
    els.fields.neededBy.value = editing.neededBy || '';
  }

  if (els.title) els.title.textContent = editing ? 'Edit your request' : 'Post what you need';
  if (els.submitBtn) els.submitBtn.textContent = editing ? 'Save changes' : 'Post request';

  openModal(els.modal);
}

async function onSubmit(event) {
  event.preventDefault();

  const values = {
    title: els.fields.title.value.trim(),
    category: els.fields.category.value,
    description: els.fields.description.value.trim(),
    budgetMax: els.fields.budget.value,
    neededBy: els.fields.neededBy.value,
    requesterName: window.api.getCurrentUser()?.fullName || ''
  };

  if (values.title.length < 3) {
    showToast('Say what you are looking for, in at least 3 characters.');
    return;
  }
  if (!values.category) {
    showToast('Pick a category so the right people see it.');
    return;
  }
  if (values.description.length > 1000) {
    showToast('Keep the description under 1000 characters.');
    return;
  }

  els.submitBtn.disabled = true;
  const label = els.submitBtn.textContent;
  els.submitBtn.textContent = 'Posting…';

  try {
    if (editingId) {
      await window.api.updateRequest(editingId, values);
      showToast('Request updated.');
    } else {
      await window.api.createRequest(values);
      showToast('Posted to the board.');
    }
    closeModal(els.modal);
    els.form.reset();
    editingId = null;
    await loadBoard();
  } catch (err) {
    showToast(describeError(err), 5000);
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = label;
  }
}
