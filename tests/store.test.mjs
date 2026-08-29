import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserEnv } from './helpers/env.mjs';

let store;

before(async () => {
  installBrowserEnv();
  store = await import('../js/store.js');
});

beforeEach(() => {
  store.resetFilters();
  store.view.tab = 'explore';
});

describe('the price ceiling', () => {
  // The original app defaulted maxPrice to 5000 and always sent it, so no
  // listing above 5,000 could be found in any category. These tests pin the
  // fix: null means no ceiling, and no ceiling means the filter is not sent.

  test('starts with no maximum price', () => {
    assert.equal(store.filters.maxPrice, null);
  });

  test('omits maxPrice from the query when there is no ceiling', () => {
    const query = store.queryFilters();
    assert.ok(!('maxPrice' in query), 'a null ceiling must not reach the database');
  });

  test('includes maxPrice once the user actually sets one', () => {
    store.setFilter({ maxPrice: 2500 });
    assert.equal(store.queryFilters().maxPrice, 2500);
  });

  test('an expensive listing is not excluded by the default filters', () => {
    const bike = { price: 32000 };
    const ceiling = store.queryFilters().maxPrice;
    assert.ok(ceiling === undefined || bike.price <= ceiling);
  });
});

describe('setFilter', () => {
  test('resets pagination so a new filter starts from the first page', () => {
    store.filters.page = 4;
    store.setFilter({ category: 'Furniture' });
    assert.equal(store.filters.page, 0);
  });

  test('can keep the page when explicitly told to', () => {
    store.filters.page = 2;
    store.setFilter({ search: 'desk' }, { resetPage: false });
    assert.equal(store.filters.page, 2);
  });
});

describe('resetFilters', () => {
  test('returns every filter to its default', () => {
    store.setFilter({
      category: 'Furniture', search: 'chair', conditions: ['Good'],
      maxPrice: 900, sort: 'price_asc', location: 'Khatla'
    });
    store.resetFilters();

    assert.deepEqual(
      {
        category: store.filters.category,
        search: store.filters.search,
        conditions: store.filters.conditions,
        maxPrice: store.filters.maxPrice,
        sort: store.filters.sort,
        location: store.filters.location
      },
      { category: 'all', search: '', conditions: [], maxPrice: null, sort: 'newest', location: 'all' }
    );
  });
});

describe('activeFilterCount', () => {
  test('is zero on a clean slate', () => {
    assert.equal(store.activeFilterCount(), 0);
  });

  test('does not count the default sort or an absent price ceiling', () => {
    store.setFilter({ sort: 'newest', maxPrice: null });
    assert.equal(store.activeFilterCount(), 0);
  });

  test('counts each condition, plus a ceiling, sort and location', () => {
    store.setFilter({
      conditions: ['Good', 'Fair'], maxPrice: 500,
      sort: 'price_asc', location: 'Khatla'
    });
    assert.equal(store.activeFilterCount(), 5);
  });
});

describe('the My Listings tab', () => {
  test('scopes the query to the signed-in seller', () => {
    globalThis.window.api = { getCurrentUser: () => ({ id: 'user-uuid-1' }) };
    store.setTab('mine');
    assert.equal(store.queryFilters().sellerId, 'user-uuid-1');
  });

  test('matches nothing rather than everything when nobody is signed in', () => {
    globalThis.window.api = { getCurrentUser: () => null };
    store.setTab('mine');
    // A missing sellerId would have returned the whole marketplace.
    assert.equal(store.queryFilters().sellerId, '__none__');
  });
});

describe('subscribe', () => {
  test('notifies listeners and can be unsubscribed', () => {
    const seen = [];
    const off = store.subscribe(reason => seen.push(reason));

    store.setFilter({ category: 'Furniture' });
    assert.deepEqual(seen, ['filters']);

    off();
    store.setFilter({ category: 'Other' });
    assert.equal(seen.length, 1, 'listener fired after unsubscribing');
  });

  test('one failing listener does not stop the others', () => {
    let reached = false;
    const offBad = store.subscribe(() => { throw new Error('boom'); });
    const offGood = store.subscribe(() => { reached = true; });

    const originalError = console.error;
    console.error = () => {};
    store.emit('test');
    console.error = originalError;

    assert.ok(reached, 'the second listener should still have run');
    offBad();
    offGood();
  });
});
