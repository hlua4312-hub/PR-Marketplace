/**
 * PR MARKETPLACE - UPI PAYMENT LINKS
 *
 * Builds the `upi://pay` deep link and the QR that encodes it, from the
 * seller's VPA and the listing price. No gateway, no fee, no money passing
 * through this app - the buyer's UPI app talks to the seller's bank directly.
 *
 * Two things worth knowing before relying on any of this:
 *
 *  - The amount in a UPI link is a suggestion. Most apps let the payer edit
 *    it before sending, and some ignore it entirely for person-to-person
 *    transfers. The seller has to check what actually arrived.
 *
 *  - Nothing here confirms a payment happened. That needs a payment gateway.
 *    What the app records is the buyer's own claim, for the seller to check
 *    against their bank app.
 */

/**
 * A VPA looks like name@bank. This is deliberately permissive about the
 * handle - banks use a wide range - while rejecting the things that would
 * break the link: spaces, a missing @, and characters that need escaping.
 */
export function isValidVpa(vpa) {
  const clean = String(vpa || '').trim();
  if (!clean || clean.length > 100) return false;
  // One character before the @ is unusual but not invalid, and UPI does not
  // mandate a minimum. Rejecting a real VPA costs a seller their payment;
  // accepting an odd one costs a link that fails visibly in the buyer's app.
  return /^[a-zA-Z0-9._-]+@[a-zA-Z][a-zA-Z0-9.-]+$/.test(clean);
}

export function normaliseVpa(vpa) {
  return String(vpa || '').trim().toLowerCase();
}

/**
 * Build the deep link. Every value is URL-encoded: a payee name with an
 * ampersand in it would otherwise inject a parameter into the link.
 */
export function buildUpiLink({ vpa, payeeName, amount, note }) {
  if (!isValidVpa(vpa)) throw new Error('INVALID_VPA');

  const params = new URLSearchParams();
  params.set('pa', normaliseVpa(vpa));
  params.set('pn', String(payeeName || 'Seller').slice(0, 50));

  const value = Number(amount);
  if (Number.isFinite(value) && value > 0) {
    // UPI wants a plain decimal with two places, not a formatted number.
    params.set('am', value.toFixed(2));
  }

  params.set('cu', 'INR');
  if (note) params.set('tn', String(note).slice(0, 50));

  return 'upi://pay?' + params.toString()
    // URLSearchParams encodes a space as "+", which some UPI apps render
    // literally in the payee name shown to the buyer.
    .replace(/\+/g, '%20')
    // "@" is legal unencoded in a query string (RFC 3986 pchar), and UPI
    // apps are documented against pa=name@bank. Some are picky enough to
    // choke on %40, so leave the separator the way they expect to see it.
    .replace(/%40/g, '@');
}

/**
 * Render the link as a QR into a container element.
 *
 * Uses the vendored qrcode-generator rather than an image service, so a
 * seller's VPA and a buyer's payment amount are never sent to a third party
 * just to draw a square.
 */
export function renderUpiQr(container, link, { size = 220 } = {}) {
  if (!container) return false;

  const generator = window.qrcode;
  if (typeof generator !== 'function') {
    container.innerHTML = '<p class="upi-qr-fallback">QR could not be drawn. Use the button below instead.</p>';
    return false;
  }

  try {
    // Type 0 picks the smallest version that fits; M correction tolerates a
    // little print or screen damage without inflating the pattern.
    const qr = generator(0, 'M');
    qr.addData(link);
    qr.make();

    const cells = qr.getModuleCount();
    const scale = Math.max(2, Math.floor(size / cells));
    const quiet = 4 * scale;              // the spec's required quiet zone
    const pixels = cells * scale + quiet * 2;

    const canvas = document.createElement('canvas');
    canvas.width = pixels;
    canvas.height = pixels;
    canvas.style.width = '100%';
    canvas.style.maxWidth = `${size}px`;
    canvas.style.height = 'auto';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'UPI payment QR code');

    const ctx = canvas.getContext('2d');
    // Always black on white: a QR tinted to match a dark theme fails to scan.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pixels, pixels);
    ctx.fillStyle = '#000000';

    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(quiet + col * scale, quiet + row * scale, scale, scale);
        }
      }
    }

    container.innerHTML = '';
    container.appendChild(canvas);
    return true;
  } catch (err) {
    console.warn('Could not draw the UPI QR:', err);
    container.innerHTML = '<p class="upi-qr-fallback">QR could not be drawn. Use the button below instead.</p>';
    return false;
  }
}

/**
 * A UTR (or RRN) is the reference a UPI app shows after a transfer. Lengths
 * vary by bank, so this checks the shape rather than pinning one format -
 * rejecting a real reference because it is 16 characters instead of 12 would
 * be worse than accepting a made-up one, which the seller catches anyway.
 */
export function isPlausibleUtr(utr) {
  const clean = String(utr || '').trim();
  return /^[A-Za-z0-9]{6,40}$/.test(clean);
}

export function normaliseUtr(utr) {
  return String(utr || '').trim().toUpperCase();
}
