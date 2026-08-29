import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserEnv } from './helpers/env.mjs';

let ui;

before(async () => {
  installBrowserEnv();
  ui = await import('../js/ui.js');
});

describe('escapeHtml', () => {
  test('neutralises the characters that would close a tag or attribute', () => {
    assert.equal(
      ui.escapeHtml('<script>alert("x")</script>'),
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    assert.equal(ui.escapeHtml("O'Brien & Sons"), 'O&#39;Brien &amp; Sons');
  });

  test('renders null and undefined as empty, not as the words', () => {
    assert.equal(ui.escapeHtml(null), '');
    assert.equal(ui.escapeHtml(undefined), '');
  });
});

describe('highlight', () => {
  test('wraps a match without letting the needle inject markup', () => {
    const out = ui.highlight('Organic Chemistry notes', 'chem');
    assert.equal(out, 'Organic <mark class="search-highlight">Chem</mark>istry notes');
  });

  test('escapes the haystack before matching, so tags never survive', () => {
    const out = ui.highlight('<b>bold</b>', 'b');
    assert.ok(!out.includes('<b>'), 'raw tag leaked into the output');
    assert.ok(out.includes('&lt;'), 'expected the tag to be escaped');
  });

  test('matches a query containing an ampersand, which the old version could not', () => {
    // The previous implementation escaped the text but not the needle, so
    // searching "Books & Study" never highlighted anything.
    const out = ui.highlight('Books & Study Materials', 'Books & Study');
    assert.ok(out.includes('<mark class="search-highlight">Books &amp; Study</mark>'));
  });

  test('treats regex metacharacters as literal text', () => {
    assert.doesNotThrow(() => ui.highlight('price (used)', '('));
    assert.equal(ui.highlight('a.b', '.').includes('<mark'), true);
    assert.ok(!ui.highlight('xyz', '.').includes('<mark'), 'dot should not match any character');
  });

  test('returns the plain escaped string when there is no query', () => {
    assert.equal(ui.highlight('Guitar', ''), 'Guitar');
    assert.equal(ui.highlight('Guitar', '   '), 'Guitar');
  });
});

describe('formatPrice', () => {
  test('formats with the rupee symbol and Indian grouping', () => {
    assert.equal(ui.formatPrice(1200), '₹1,200');
    assert.equal(ui.formatPrice(0), '₹0');
  });

  test('treats junk as zero rather than printing NaN', () => {
    assert.equal(ui.formatPrice(undefined), '₹0');
    assert.equal(ui.formatPrice('not a number'), '₹0');
  });
});

describe('hoursUntilPurge', () => {
  test('counts down from the configured lifetime', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    assert.equal(ui.hoursUntilPurge(twoHoursAgo), 3);   // 5 - 2
  });

  test('never goes negative once the window has passed', () => {
    const longAgo = new Date(Date.now() - 40 * 3600 * 1000).toISOString();
    assert.equal(ui.hoursUntilPurge(longAgo), 0);
  });

  test('falls back to the full lifetime for an unparseable date', () => {
    assert.equal(ui.hoursUntilPurge('not a date'), 5);
  });
});

describe('timeAgo', () => {
  test('describes recent moments in words', () => {
    assert.equal(ui.timeAgo(new Date().toISOString()), 'just now');
    assert.equal(ui.timeAgo(new Date(Date.now() - 5 * 60000).toISOString()), '5m ago');
    assert.equal(ui.timeAgo(new Date(Date.now() - 3 * 3600000).toISOString()), '3h ago');
  });

  test('returns empty rather than "Invalid Date" for bad input', () => {
    assert.equal(ui.timeAgo(undefined), '');
    assert.equal(ui.timeAgo('nonsense'), '');
  });
});

describe('fitWithin', () => {
  test('leaves an already-small image alone', () => {
    assert.deepEqual(ui.fitWithin(800, 600, 1400), { width: 800, height: 600 });
  });

  test('scales the long edge down and keeps the aspect ratio', () => {
    assert.deepEqual(ui.fitWithin(2800, 1400, 1400), { width: 1400, height: 700 });
    assert.deepEqual(ui.fitWithin(1400, 2800, 1400), { width: 700, height: 1400 });
  });
});

describe('describeError', () => {
  test('turns known codes into something a person can act on', () => {
    assert.match(ui.describeError(new Error('NOT_YOUR_LISTING')), /only the seller/i);
    assert.match(ui.describeError(new Error('INVALID_CREDENTIALS')), /email or password/i);
  });

  test('recognises a network failure by its message', () => {
    assert.match(ui.describeError(new Error('Failed to fetch')), /connection/i);
  });

  test('passes an unknown message through instead of flattening it', () => {
    assert.equal(ui.describeError(new Error('column foo does not exist')), 'column foo does not exist');
  });
});
