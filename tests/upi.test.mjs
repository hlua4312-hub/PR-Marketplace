import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserEnv } from './helpers/env.mjs';

let upi;

before(async () => {
  installBrowserEnv();
  upi = await import('../js/upi.js');
});

describe('isValidVpa', () => {
  test('accepts the handles Indian banks actually issue', () => {
    for (const vpa of ['rina@okhdfcbank', 'philip.kumar@ybl', '9876543210@paytm',
                       'shop-name@okaxis', 'a_b@upi', 'x.y-z@icici']) {
      assert.equal(upi.isValidVpa(vpa), true, `${vpa} should be valid`);
    }
  });

  test('rejects anything that would break the link', () => {
    for (const bad of ['', 'nobank', '@okhdfcbank', 'rina@', 'ri na@ybl',
                       'rina@@ybl', 'rina@1bank', 'rina@b', null, undefined]) {
      assert.equal(upi.isValidVpa(bad), false, `${JSON.stringify(bad)} should be rejected`);
    }
  });

  test('rejects a VPA long enough to be an attack rather than a typo', () => {
    assert.equal(upi.isValidVpa('a'.repeat(120) + '@okhdfcbank'), false);
  });
});

describe('buildUpiLink', () => {
  test('produces the scheme UPI apps expect', () => {
    const link = upi.buildUpiLink({ vpa: 'rina@okhdfcbank', payeeName: 'Rina', amount: 2500 });
    assert.ok(link.startsWith('upi://pay?'));

    const params = new URLSearchParams(link.slice('upi://pay?'.length));
    assert.equal(params.get('pa'), 'rina@okhdfcbank');
    assert.equal(params.get('pn'), 'Rina');
    assert.equal(params.get('cu'), 'INR');
  });

  test('formats the amount with two decimals, not as a display string', () => {
    const params = new URLSearchParams(
      upi.buildUpiLink({ vpa: 'r@ybl', payeeName: 'R', amount: 2500 }).split('?')[1]
    );
    // ₹2,500 or 2500 would both be rejected by a UPI app.
    assert.equal(params.get('am'), '2500.00');
  });

  test('omits the amount when there is nothing sensible to send', () => {
    for (const amount of [0, -5, undefined, NaN, 'free']) {
      const params = new URLSearchParams(
        upi.buildUpiLink({ vpa: 'r@ybl', payeeName: 'R', amount }).split('?')[1]
      );
      assert.equal(params.has('am'), false, `amount ${amount} should be omitted`);
    }
  });

  test('encodes a payee name that would otherwise inject a parameter', () => {
    // "R & Co&am=1" must not smuggle in its own am value.
    const link = upi.buildUpiLink({
      vpa: 'r@ybl', payeeName: 'R & Co&am=1', amount: 100
    });
    const params = new URLSearchParams(link.split('?')[1]);
    assert.equal(params.get('pn'), 'R & Co&am=1');
    assert.equal(params.get('am'), '100.00');
  });

  test('leaves the @ in the VPA unencoded, as UPI apps expect', () => {
    // Legal either way per RFC 3986, but apps are documented against
    // pa=name@bank and some choke on %40.
    const link = upi.buildUpiLink({ vpa: 'rina@okhdfcbank', payeeName: 'R', amount: 10 });
    assert.ok(link.includes('pa=rina@okhdfcbank'), link);
    assert.ok(!link.includes('%40'));
  });

  test('encodes spaces as %20 rather than +', () => {
    // URLSearchParams gives "+", which some UPI apps render literally in the
    // payee name shown to the buyer.
    const link = upi.buildUpiLink({ vpa: 'r@ybl', payeeName: 'Rina Devi', amount: 10 });
    assert.ok(link.includes('Rina%20Devi'), link);
    assert.ok(!link.includes('Rina+Devi'));
  });

  test('refuses to build a link from an invalid VPA', () => {
    assert.throws(() => upi.buildUpiLink({ vpa: 'nope', payeeName: 'X', amount: 1 }),
                  /INVALID_VPA/);
  });

  test('caps the payee name and note so a long title cannot bloat the QR', () => {
    const link = upi.buildUpiLink({
      vpa: 'r@ybl', payeeName: 'N'.repeat(200), amount: 1, note: 'T'.repeat(200)
    });
    const params = new URLSearchParams(link.split('?')[1]);
    assert.equal(params.get('pn').length, 50);
    assert.equal(params.get('tn').length, 50);
  });
});

describe('normaliseVpa', () => {
  test('trims and lowercases, since VPAs are case-insensitive', () => {
    assert.equal(upi.normaliseVpa('  Rina@OKHDFCBank '), 'rina@okhdfcbank');
  });
});

describe('isPlausibleUtr', () => {
  test('accepts the reference formats different banks return', () => {
    for (const utr of ['412345678901', 'ICIC0A1B2C3D4E5', '123456', 'a'.repeat(40)]) {
      assert.equal(upi.isPlausibleUtr(utr), true, `${utr} should be accepted`);
    }
  });

  test('rejects what is obviously not a reference', () => {
    for (const bad of ['', '12345', '4123 4567 8901', 'ref#123', 'a'.repeat(41), null]) {
      assert.equal(upi.isPlausibleUtr(bad), false, `${JSON.stringify(bad)} should be rejected`);
    }
  });

  test('does not pretend to validate a real transaction', () => {
    // Worth pinning as a fact about the design: this checks shape only.
    // Confirming a UPI transfer needs a payment gateway, so a made-up
    // reference of the right shape passes here and the seller catches it.
    assert.equal(upi.isPlausibleUtr('000000000000'), true);
  });
});

describe('normaliseUtr', () => {
  test('trims and uppercases so the same reference cannot be filed twice', () => {
    assert.equal(upi.normaliseUtr('  icic0a1b2c3  '), 'ICIC0A1B2C3');
  });
});
