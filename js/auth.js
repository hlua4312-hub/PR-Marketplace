/**
 * PR MARKETPLACE - AUTHENTICATION SCREENS
 *
 * Register, log in, password reset, and the email-confirmation notice.
 * No password is ever stored, compared or cached here - every check happens
 * inside Supabase Auth.
 */

import { escapeHtml, showToast, describeError } from './ui.js';

let els = {};
let hooks = {};

export function initAuth(injected) {
  hooks = injected;              // { onSignedIn, onSignedOut }

  els = {
    overlay: document.getElementById('authOverlay'),
    viewport: document.getElementById('appViewport'),
    confirmOverlay: document.getElementById('confirmEmailOverlay'),
    newPasswordOverlay: document.getElementById('newPasswordOverlay'),

    signInForm: document.getElementById('authSignInForm'),
    logInForm: document.getElementById('authLogInForm'),
    resetForm: document.getElementById('authResetForm'),
    newPasswordForm: document.getElementById('newPasswordForm'),

    tabSignIn: document.getElementById('btnTabSignIn'),
    tabLogIn: document.getElementById('btnTabLogIn'),

    savedBox: document.getElementById('savedAccountsContainer'),
    savedChips: document.getElementById('savedAccountsChips'),

    reasonBox: document.getElementById('authReason'),
    dismissBtn: document.getElementById('btnDismissAuth'),
    browseLink: document.getElementById('linkKeepBrowsing'),

    confirmAddress: document.getElementById('confirmEmailAddress')
  };

  wireDismiss();
  wireTabs();
  wirePasswordToggles();
  wireRegister();
  wireLogin();
  wireReset();
  wireNewPassword();
}

/* ============================================================= visibility === */

/**
 * Show the sign-in screen over the marketplace.
 *
 * Browsing does not require an account, so this is a prompt rather than a
 * gate: it appears when someone tries to do something that needs an identity,
 * explains why, and can be dismissed back to browsing.
 *
 * @param {string}  [reason]      one line explaining what prompted it
 * @param {boolean} [dismissible] false only on a genuine hard stop
 */
export function showAuth({ reason = '', dismissible = true, tab = 'login' } = {}) {
  els.overlay?.classList.remove('hidden');
  els.confirmOverlay?.classList.add('hidden');
  els.newPasswordOverlay?.classList.add('hidden');

  // The marketplace stays mounted underneath, so dismissing returns the
  // browser to exactly the listing they were looking at.
  els.viewport?.classList.remove('hidden');

  if (els.reasonBox) {
    els.reasonBox.textContent = reason;
    els.reasonBox.classList.toggle('hidden', !reason);
  }
  els.dismissBtn?.classList.toggle('hidden', !dismissible);
  els.browseLink?.classList.toggle('hidden', !dismissible);

  showTab(tab);
}

export function hideAuth() {
  els.overlay?.classList.add('hidden');
  els.confirmOverlay?.classList.add('hidden');
  els.newPasswordOverlay?.classList.add('hidden');
}

export function isAuthOpen() {
  return Boolean(els.overlay) && !els.overlay.classList.contains('hidden');
}

export function showApp() {
  els.overlay?.classList.add('hidden');
  els.confirmOverlay?.classList.add('hidden');
  els.newPasswordOverlay?.classList.add('hidden');
  els.viewport?.classList.remove('hidden');
}

export function showNewPasswordScreen() {
  els.overlay?.classList.add('hidden');
  els.confirmOverlay?.classList.add('hidden');
  els.viewport?.classList.add('hidden');
  els.newPasswordOverlay?.classList.remove('hidden');
}

function showConfirmEmail(email) {
  if (els.confirmAddress) els.confirmAddress.textContent = email;
  els.overlay?.classList.add('hidden');
  els.confirmOverlay?.classList.remove('hidden');
}

/* =================================================================== tabs === */

function showTab(which) {
  const forms = { signin: els.signInForm, login: els.logInForm, reset: els.resetForm };
  Object.entries(forms).forEach(([key, form]) => form?.classList.toggle('hidden', key !== which));

  els.tabSignIn?.classList.toggle('active', which === 'signin');
  els.tabLogIn?.classList.toggle('active', which !== 'signin');

  if (which === 'login') renderSavedIdentifiers();
}

function wireDismiss() {
  const dismiss = event => {
    event?.preventDefault();
    hideAuth();
    hooks.onDismissed?.();
  };

  els.dismissBtn?.addEventListener('click', dismiss);
  els.browseLink?.addEventListener('click', dismiss);

  els.overlay?.addEventListener('click', event => {
    if (event.target === els.overlay && !els.dismissBtn?.classList.contains('hidden')) {
      dismiss(event);
    }
  });
}

function wireTabs() {
  els.tabSignIn?.addEventListener('click', () => showTab('signin'));
  els.tabLogIn?.addEventListener('click', () => showTab('login'));

  document.getElementById('linkSwitchToLogin')?.addEventListener('click', e => { e.preventDefault(); showTab('login'); });
  document.getElementById('linkSwitchToRegister')?.addEventListener('click', e => { e.preventDefault(); showTab('signin'); });
  document.getElementById('linkForgotPassword')?.addEventListener('click', e => { e.preventDefault(); showTab('reset'); });
  document.getElementById('linkBackToLogin')?.addEventListener('click', e => { e.preventDefault(); showTab('login'); });

  document.getElementById('linkConfirmedGoToLogin')?.addEventListener('click', e => {
    e.preventDefault();
    els.confirmOverlay?.classList.add('hidden');
    els.overlay?.classList.remove('hidden');
    showTab('login');
  });
}

function wirePasswordToggles() {
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const revealed = input.type === 'text';
      input.type = revealed ? 'password' : 'text';
      btn.textContent = revealed ? '👁️' : '🙈';
      btn.setAttribute('aria-label', revealed ? 'Show password' : 'Hide password');
    });
  });
}

/* =============================================================== register === */

function wireRegister() {
  els.signInForm?.addEventListener('submit', async event => {
    event.preventDefault();

    const fullName = document.getElementById('regFullName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;

    const problem = validateRegistration({ fullName, email, phone, password });
    if (problem) {
      showToast(problem);
      return;
    }

    const btn = document.getElementById('btnSubmitSignIn');
    setBusy(btn, true, 'Creating account…');

    try {
      const { user, needsEmailConfirmation } = await window.api.signUp({
        fullName, email, phone: phone.replace(/[^\d]/g, ''), password
      });

      window.api.saveIdentifier(email, fullName);

      if (needsEmailConfirmation) {
        showConfirmEmail(email);
        showToast('Check your inbox for the confirmation link.', 4500);
      } else {
        showToast(`Welcome to PR Marketplace, ${user.fullName}.`);
        hooks.onSignedIn?.(user);
      }
    } catch (err) {
      const message = describeError(err);
      showToast(message);
      if (err.message === 'DUPLICATE_EMAIL' || err.message === 'DUPLICATE_PHONE') showTab('login');
    } finally {
      setBusy(btn, false, 'Create Account & Access App');
    }
  });

  document.getElementById('btnResendConfirmation')?.addEventListener('click', async event => {
    const email = els.confirmAddress?.textContent;
    if (!email) return;

    const btn = event.currentTarget;
    setBusy(btn, true, 'Sending…');

    try {
      await window.api.resendConfirmation(email);
      showToast('Confirmation email sent again. Check your inbox and spam folder.', 4500);
    } catch (err) {
      showToast(describeError(err), 6000);
    } finally {
      setBusy(btn, false, 'Resend Confirmation Email');
    }
  });
}

function validateRegistration({ fullName, email, phone, password }) {
  if (!fullName || !email || !phone || !password) return 'Fill in every field to continue.';
  if (fullName.length < 2) return 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That email address does not look right.';

  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length !== 10) return 'Enter a 10-digit phone number, for example 9876543210.';

  if (password.length < 8) return 'Use at least 8 characters for your password.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Your password needs both letters and numbers.';
  }
  return null;
}

/* ================================================================== login === */

function wireLogin() {
  els.logInForm?.addEventListener('submit', async event => {
    event.preventDefault();

    const identifier = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('chkRememberMe')?.checked;

    if (!identifier || !password) {
      showToast('Enter your email or phone, and your password.');
      return;
    }

    const btn = document.getElementById('btnSubmitLogIn');
    setBusy(btn, true, 'Logging in…');

    try {
      const user = await window.api.signIn(identifier, password);
      if (remember) window.api.saveIdentifier(identifier, user.fullName);

      document.getElementById('loginPassword').value = '';
      showToast(`Welcome back, ${user.fullName}.`);
      hooks.onSignedIn?.(user);
    } catch (err) {
      if (err.message === 'EMAIL_NOT_CONFIRMED') {
        showConfirmEmail(identifier.includes('@') ? identifier : '');
        showToast('This account still needs confirming. Resend the email below if it never arrived.', 5500);
      } else {
        showToast(describeError(err));
      }
    } finally {
      setBusy(btn, false, 'Log In to Account');
    }
  });
}

function renderSavedIdentifiers() {
  if (!els.savedBox || !els.savedChips) return;

  const saved = window.api.getSavedIdentifiers();
  els.savedBox.classList.toggle('hidden', saved.length === 0);
  if (!saved.length) return;

  els.savedChips.innerHTML = saved.map(account => `
    <span class="saved-account-chip">
      <button type="button" class="saved-chip-fill" data-identifier="${escapeHtml(account.identifier)}">
        ${escapeHtml(account.name)}
      </button>
      <button type="button" class="saved-chip-remove" data-remove="${escapeHtml(account.identifier)}"
              aria-label="Forget ${escapeHtml(account.name)}">&times;</button>
    </span>
  `).join('');

  els.savedChips.onclick = event => {
    const remove = event.target.closest('[data-remove]');
    if (remove) {
      window.api.removeIdentifier(remove.dataset.remove);
      renderSavedIdentifiers();
      return;
    }
    const fill = event.target.closest('[data-identifier]');
    if (fill) {
      document.getElementById('loginEmail').value = fill.dataset.identifier;
      document.getElementById('loginPassword').focus();
    }
  };
}

/* ========================================================== password reset === */

function wireReset() {
  els.resetForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) return;

    const btn = document.getElementById('btnSubmitReset');
    setBusy(btn, true, 'Sending…');

    try {
      await window.api.requestPasswordReset(email);
      // Deliberately the same message whether or not the address is registered.
      showToast('If that email is registered, a reset link is on its way.', 4500);
      showTab('login');
    } catch (err) {
      showToast(describeError(err));
    } finally {
      setBusy(btn, false, 'Send Reset Link');
    }
  });
}

function wireNewPassword() {
  els.newPasswordForm?.addEventListener('submit', async event => {
    event.preventDefault();

    const password = document.getElementById('newPassword').value;
    const confirm = document.getElementById('newPasswordConfirm').value;

    if (password.length < 8) {
      showToast('Use at least 8 characters.');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      showToast('Your password needs both letters and numbers.');
      return;
    }
    if (password !== confirm) {
      showToast('Those two passwords do not match.');
      return;
    }

    const btn = document.getElementById('btnSaveNewPassword');
    setBusy(btn, true, 'Saving…');

    try {
      await window.api.updatePassword(password);
      const user = await window.api.refreshUser();
      showToast('Password updated.');
      hooks.onSignedIn?.(user);
    } catch (err) {
      showToast(describeError(err));
    } finally {
      setBusy(btn, false, 'Save Password & Continue');
    }
  });
}

/* ================================================================= helpers === */

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  const span = button.querySelector('span');
  if (span) span.textContent = label;
}

export function clearAuthForms() {
  ['regFullName', 'regEmail', 'regPhone', 'regPassword', 'loginPassword', 'resetEmail']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
}
