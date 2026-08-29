import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserEnv } from './helpers/env.mjs';

let env;

beforeEach(() => {
  env = installBrowserEnv();
});

describe('legacy storage cleanup', () => {
  // Version 1 wrote raw passwords and base64 images into localStorage. Every
  // device that upgrades has to have those keys removed, not merely ignored.

  const LEGACY = {
    pr_marketplace_users_v1: '[{"password":"hunter2"}]',
    pr_marketplace_remembered_accounts_v1: '[{"password":"hunter2"}]',
    pr_marketplace_active_user_v1: '{"id":"user-1"}',
    pr_marketplace_items_v13_empty: '[{"imageUrl":"data:image/jpeg;base64,AAAA"}]',
    pr_user_permanent_posts: '[]',
    pr_marketplace_my_items_v13: '["item-1"]',
    pr_marketplace_favorites_v13: '["item-1"]',
    pr_marketplace_chats_v1: '{}',
    pr_community_all_chat_v1: '[]',
    pr_notifications: '[]',
    pr_private_chat_rahul_mzu: '[]'
  };

  test('clears every v1 key, including the ones holding passwords', () => {
    const upgraded = installBrowserEnv({ seed: LEGACY });

    for (const key of Object.keys(LEGACY)) {
      assert.equal(upgraded.storage.getItem(key), null, `${key} should have been cleared`);
    }
  });

  test('leaves no trace of a stored password anywhere in storage', () => {
    const upgraded = installBrowserEnv({ seed: LEGACY });

    const everything = Array.from(upgraded.storage.map.values()).join('|');
    assert.ok(!/hunter2/.test(everything), 'a password survived the migration');
  });

  test('does not disturb keys belonging to the current version', () => {
    const upgraded = installBrowserEnv({
      seed: { ...LEGACY, pr_favorites_v2: '["keep-me"]' }
    });
    assert.equal(upgraded.storage.getItem('pr_favorites_v2'), '["keep-me"]');
  });
});

describe('favourites', () => {
  test('toggle adds then removes, and survives numeric ids', () => {
    const api = globalThis.window.api;

    api.toggleFavorite('abc');
    assert.deepEqual(api.getFavoriteIds(), ['abc']);
    assert.ok(api.isFavorite('abc'));

    api.toggleFavorite('abc');
    assert.deepEqual(api.getFavoriteIds(), []);
    assert.ok(!api.isFavorite('abc'));
  });

  test('compares ids as strings, so a number and its text form are the same item', () => {
    const api = globalThis.window.api;
    api.toggleFavorite(42);
    assert.ok(api.isFavorite('42'));
    assert.ok(api.isFavorite(42));
  });
});

describe('saved sign-in identifiers', () => {
  test('stores the email but never a password', () => {
    const api = globalThis.window.api;
    api.saveIdentifier('Someone@Gmail.com', 'Someone');

    const raw = env.storage.getItem('pr_saved_identifiers_v2');
    assert.ok(!/password/i.test(raw), 'a password field must never be written');
    assert.deepEqual(JSON.parse(raw).map(a => a.identifier), ['someone@gmail.com']);
  });

  test('keeps the most recent five without duplicating an address', () => {
    const api = globalThis.window.api;
    for (let i = 0; i < 7; i++) api.saveIdentifier(`user${i}@gmail.com`, `User ${i}`);
    api.saveIdentifier('user6@gmail.com', 'User 6 again');

    const saved = api.getSavedIdentifiers();
    assert.equal(saved.length, 5);
    assert.equal(saved[0].identifier, 'user6@gmail.com');
    assert.equal(new Set(saved.map(s => s.identifier)).size, 5);
  });

  test('forgetting an address removes only that one', () => {
    const api = globalThis.window.api;
    api.saveIdentifier('a@gmail.com', 'A');
    api.saveIdentifier('b@gmail.com', 'B');

    api.removeIdentifier('A@Gmail.com');
    assert.deepEqual(api.getSavedIdentifiers().map(s => s.identifier), ['b@gmail.com']);
  });
});

describe('ownership', () => {
  // The old check asked localStorage whether an id was in a list this device
  // had written, so clearing app data lost control of your own listings and
  // any device could claim any item. It now compares the row's owner.

  test('is true only when the row belongs to the signed-in user', () => {
    const api = globalThis.window.api;
    api._cacheProfile({ id: 'uuid-me', fullName: 'Me', email: 'me@x.com', phone: '' });

    assert.ok(api.isItemOwnedByCurrentUser({ id: 'i1', userId: 'uuid-me' }));
    assert.ok(!api.isItemOwnedByCurrentUser({ id: 'i2', userId: 'uuid-someone-else' }));
  });

  test('is false when nobody is signed in', () => {
    const api = globalThis.window.api;
    api._cacheProfile(null);
    assert.ok(!api.isItemOwnedByCurrentUser({ id: 'i1', userId: 'uuid-me' }));
  });

  test('is false for a row with no owner, rather than defaulting to true', () => {
    const api = globalThis.window.api;
    api._cacheProfile({ id: 'uuid-me', fullName: 'Me' });
    assert.ok(!api.isItemOwnedByCurrentUser({ id: 'i1', userId: null }));
    assert.ok(!api.isItemOwnedByCurrentUser({ id: 'i1' }));
  });
});

describe('the cached profile', () => {
  test('holds display details only, never a credential', () => {
    const api = globalThis.window.api;
    api._cacheProfile({
      id: 'uuid-1', fullName: 'Rina', email: 'rina@gmail.com',
      phone: '9876543210', password: 'should-not-be-here', token: 'nope'
    });

    const stored = JSON.parse(env.storage.getItem('pr_active_profile_v2'));
    assert.deepEqual(Object.keys(stored).sort(), ['email', 'fullName', 'id', 'phone']);
  });

  test('signing out clears it', () => {
    const api = globalThis.window.api;
    api._cacheProfile({ id: 'uuid-1', fullName: 'Rina' });
    api._cacheProfile(null);
    assert.equal(env.storage.getItem('pr_active_profile_v2'), null);
    assert.equal(api.getCurrentUser(), null);
  });
});

describe('the offline cache', () => {
  const items = [
    { id: '1', title: 'Desk chair', category: 'Furniture', price: 1800, condition: 'Good',   location: 'Khatla',  createdAt: '2026-08-01T10:00:00Z', userId: 'u1' },
    { id: '2', title: 'Mountain bike', category: 'Vehicles & Accessories', price: 32000, condition: 'Good', location: 'Zarkawt', createdAt: '2026-08-03T10:00:00Z', userId: 'u2' },
    { id: '3', title: 'Chemistry notes', category: 'Books & Study Materials', price: 450, condition: 'Like New', location: 'MZU Campus', createdAt: '2026-08-02T10:00:00Z', userId: 'u1' }
  ];

  test('keeps an expensive listing reachable when no ceiling is set', () => {
    const api = globalThis.window.api;
    api._cacheItems(items);
    const found = api._filterCached({});
    assert.ok(found.some(i => i.price === 32000), 'the bike should still be listed');
  });

  test('applies a ceiling when one is given', () => {
    const api = globalThis.window.api;
    api._cacheItems(items);
    assert.deepEqual(api._filterCached({ maxPrice: 2000 }).map(i => i.id).sort(), ['1', '3']);
  });

  test('sorts newest first by default and by price on request', () => {
    const api = globalThis.window.api;
    api._cacheItems(items);
    assert.deepEqual(api._filterCached({}).map(i => i.id), ['2', '3', '1']);
    assert.deepEqual(api._filterCached({ sort: 'price_asc' }).map(i => i.id), ['3', '1', '2']);
  });

  test('drops sold listings once their window has passed', () => {
    const api = globalThis.window.api;
    api._cacheItems(items.concat([{
      id: '4', title: 'Old sold thing', category: 'Other', price: 100, condition: 'Fair',
      location: 'Khatla', createdAt: '2026-08-01T10:00:00Z',
      isSold: true, soldAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString()
    }]));
    assert.ok(!api._filterCached({}).some(i => i.id === '4'));
  });

  test('keeps a sold listing that is still inside its window', () => {
    const api = globalThis.window.api;
    api._cacheItems([{
      id: '5', title: 'Just sold', category: 'Other', price: 100, condition: 'Fair',
      location: 'Khatla', createdAt: '2026-08-01T10:00:00Z',
      isSold: true, soldAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString()
    }]);
    assert.equal(api._filterCached({}).length, 1);
  });

  test('searches title, description and location', () => {
    const api = globalThis.window.api;
    api._cacheItems(items);
    assert.deepEqual(api._filterCached({ search: 'bike' }).map(i => i.id), ['2']);
    assert.deepEqual(api._filterCached({ search: 'khatla' }).map(i => i.id), ['1']);
  });

  test('scopes to one seller for the My Listings view', () => {
    const api = globalThis.window.api;
    api._cacheItems(items);
    assert.deepEqual(api._filterCached({ sellerId: 'u1' }).map(i => i.id).sort(), ['1', '3']);
  });
});

describe('channel ids', () => {
  test('a direct channel is the same string from either side', () => {
    const api = globalThis.window.api;
    assert.equal(
      api.directChannelId('aaa', 'zzz'),
      api.directChannelId('zzz', 'aaa'),
      'both participants must derive the same channel or they cannot meet'
    );
  });

  test('a listing thread is keyed by item and buyer', () => {
    const api = globalThis.window.api;
    assert.equal(api.itemChannelId('item-9', 'buyer-3'), 'item-9:buyer-3');
  });
});

describe('storage under pressure', () => {
  test('a full quota does not throw out of a write', () => {
    installBrowserEnv({ quotaBytes: 200 });
    const api = globalThis.window.api;
    assert.doesNotThrow(() => {
      api._cacheItems(Array.from({ length: 50 }, (_, i) => ({
        id: String(i), title: 'x'.repeat(200), price: 1, category: 'Other',
        condition: 'Good', location: 'Aizawl', createdAt: '2026-08-01T10:00:00Z'
      })));
    });
  });
});
