/**
 * CAMPUS CART - PAYING A SELLER
 *
 * The buyer's half of the flow: show the seller's UPI QR and deep link with
 * the amount filled in, then take the reference number they got back.
 *
 * The app is not in the middle of this. Money goes from the buyer's UPI app
 * to the seller's bank, and what gets stored here is the buyer's own claim
 * that it happened, for the seller to check against their statement.
 */

import {
  escapeHtml, formatPrice, showToast, openModal, closeModal, describeError
} from './ui.js';
import { buildUpiLink, renderUpiQr, isValidVpa, isPlausibleUtr, normaliseUtr } from './upi.js';

let els = {};
let current = null;      // { item, existingPayment }
let hooks = {};

export function initPayments(injected) {
  hooks = injected;       // { requireLogin, onPaymentFiled }

  els = {
    modal: document.getElementById('payModal'),
    subtitle: document.getElementById('payModalSubtitle'),
    itemTitle: document.getElementById('payItemTitle'),
    amount: document.getElementById('payAmount'),
    qrHolder: document.getElementById('payQrHolder'),
    vpa: document.getElementById('payVpa'),
    openApp: document.getElementById('btnOpenUpiApp'),
    form: document.getElementById('payConfirmForm'),
    utr: document.getElementById('payUtr'),
    submit: document.getElementById('btnSubmitUtr'),
    statusBox: document.getElementById('payStatusBox'),
    statusTitle: document.getElementById('payStatusTitle'),
    statusDetail: document.getElementById('payStatusDetail')
  };

  document.getElementById('closePayModalBtn')?.addEventListener('click', close);
  els.modal?.addEventListener('click', event => {
    if (event.target === els.modal) close();
  });

  els.form?.addEventListener('submit', onSubmitUtr);
}

export function isPayOpen() {
  return Boolean(els.modal) && !els.modal.classList.contains('hidden');
}

export function close() {
  closeModal(els.modal);
  current = null;
}

/* ================================================================ open === */

export async function openPaySheet(item) {
  const user = window.api.getCurrentUser();
  if (!user) {
    hooks.requireLogin?.(`Log in to pay ${item.sellerName} for “${item.title}”.`);
    return;
  }
  if (item.userId === user.id) {
    showToast(describeError(new Error('CANNOT_PAY_YOURSELF')));
    return;
  }
  if (!isValidVpa(item.sellerUpiVpa)) {
    showToast(describeError(new Error('NO_SELLER_VPA')), 5000);
    return;
  }

  let link;
  try {
    link = buildUpiLink({
      vpa: item.sellerUpiVpa,
      payeeName: item.sellerName,
      amount: item.price,
      note: `Campus Cart ${String(item.title).slice(0, 28)}`
    });
  } catch (err) {
    showToast(describeError(err));
    return;
  }

  current = { item, link, existingPayment: null };

  els.itemTitle.textContent = item.title;
  els.amount.textContent = formatPrice(item.price);
  els.vpa.textContent = item.sellerUpiVpa;
  els.subtitle.textContent = `Direct UPI transfer to ${item.sellerName}`;
  els.openApp.href = link;
  els.utr.value = '';

  renderUpiQr(els.qrHolder, link, { size: 220 });
  openModal(els.modal);

  // If they already filed one, show where it stands instead of asking again.
  try {
    const existing = await window.api.fetchMyPaymentForItem(item.id);
    if (existing) {
      current.existingPayment = existing;
      showExistingStatus(existing);
    } else {
      els.statusBox.classList.add('hidden');
      els.form.classList.remove('hidden');
    }
  } catch (err) {
    // Not being able to look up a previous claim should not block a new one.
    console.warn('Could not load an existing payment:', err.message);
  }
}

function showExistingStatus(payment) {
  const wording = {
    submitted: {
      title: 'Payment submitted',
      detail: `Reference ${payment.utr}. Waiting for the seller to confirm.`
    },
    received: {
      title: 'Seller confirmed this payment',
      detail: `Reference ${payment.utr}.` + (payment.sellerNote ? ` “${payment.sellerNote}”` : '')
    },
    rejected: {
      title: 'Seller could not find this payment',
      detail: (payment.sellerNote ? `“${payment.sellerNote}” ` : '') +
              'Check the reference with them, or your bank app.'
    }
  }[payment.status];

  els.statusTitle.textContent = wording.title;
  els.statusDetail.textContent = wording.detail;
  els.statusBox.className = `pay-status is-${payment.status}`;

  // A rejected claim can be replaced; a submitted or confirmed one cannot.
  els.form.classList.toggle('hidden', payment.status !== 'rejected');
}

/* ============================================================== submit === */

async function onSubmitUtr(event) {
  event.preventDefault();
  if (!current) return;

  const utr = normaliseUtr(els.utr.value);
  if (!isPlausibleUtr(utr)) {
    showToast(describeError(new Error('INVALID_UTR')), 5000);
    return;
  }

  els.submit.disabled = true;
  els.submit.textContent = 'Submitting…';

  try {
    const payment = await window.api.createPayment({
      itemId: current.item.id,
      sellerId: current.item.userId,
      amount: current.item.price,
      itemTitle: current.item.title,
      utr
    });

    current.existingPayment = payment;
    showExistingStatus(payment);
    showToast('Sent to the seller. They will confirm it against their bank app.', 5000);
    hooks.onPaymentFiled?.(payment);
  } catch (err) {
    showToast(describeError(err), 5000);
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = 'Submit payment reference';
  }
}

/* ====================================================== account listing === */

/**
 * Render both directions of a user's payments: what they have paid, and what
 * has been claimed against their listings. The seller settles from here.
 */
export function renderPaymentsList(container, payments, currentUserId) {
  if (!payments.length) {
    container.innerHTML = `
      <p class="section-subtitle">
        No payments yet. When you pay a seller over UPI, or someone pays you,
        the record shows up here.
      </p>`;
    return;
  }

  container.innerHTML = payments.map(p => {
    const incoming = p.sellerId === currentUserId;
    const label = { submitted: 'Pending', received: 'Received', rejected: 'Not received' }[p.status];

    return `
      <div class="payment-row is-${escapeHtml(p.status)}">
        <div class="payment-main">
          <div class="payment-top">
            <span class="payment-title">${escapeHtml(p.itemTitle)}</span>
            <span class="payment-amount">${escapeHtml(formatPrice(p.amount))}</span>
          </div>
          <span class="payment-meta">
            ${incoming ? 'Paid to you' : 'You paid'} · Ref ${escapeHtml(p.utr)}
          </span>
          ${p.sellerNote ? `<span class="payment-note">“${escapeHtml(p.sellerNote)}”</span>` : ''}
        </div>

        <div class="payment-side">
          <span class="payment-status">${escapeHtml(label)}</span>
          ${incoming && p.status === 'submitted' ? `
            <div class="payment-actions">
              <button type="button" class="listing-action" data-settle="received" data-id="${escapeHtml(p.id)}">Received</button>
              <button type="button" class="listing-action danger" data-settle="rejected" data-id="${escapeHtml(p.id)}">Not received</button>
            </div>` : ''}
        </div>
      </div>`;
  }).join('');
}
