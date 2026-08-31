/**
 * PR MARKETPLACE - SHARED UI STATE
 *
 * A small observable object so modules can react to each other without
 * importing one another in a circle. Filters live here; identity does not -
 * that always comes from window.api, which reads the verified session.
 */

const listeners = new Set();

export const filters = {
  category: 'all',
  /** all | sell | free | barter - the mode tabs under the category chips. */
  listingType: 'all',
  location: 'all',
  search: '',
  conditions: [],
  /** null means no maximum, which is what the top of the slider maps to. */
  maxPrice: null,
  sort: 'newest',
  page: 0
};

export const view = {
  tab: 'explore',           // explore | favorites | mine
  gpsCoords: null,
  hasMorePages: false,
  lastResultCount: 0
};

/** Highest slider value stands for "no limit" rather than a real ceiling. */
export const PRICE_SLIDER_MAX = 100000;

export function setFilter(patch, { resetPage = true } = {}) {
  Object.assign(filters, patch);
  if (resetPage) filters.page = 0;
  emit('filters');
}

export function resetFilters() {
  filters.category = 'all';
  filters.listingType = 'all';
  filters.location = 'all';
  filters.search = '';
  filters.conditions = [];
  filters.maxPrice = null;
  filters.sort = 'newest';
  filters.page = 0;
  emit('filters');
}

export function setTab(tab) {
  view.tab = tab;
  filters.page = 0;
  emit('tab');
}

export function activeFilterCount() {
  let n = 0;
  if (filters.conditions.length) n += filters.conditions.length;
  if (filters.maxPrice !== null) n += 1;
  if (filters.sort !== 'newest') n += 1;
  if (filters.location !== 'all') n += 1;
  return n;
}

/** Filters shaped for the API, with the view's own rules folded in. */
export function queryFilters() {
  const query = {
    category: filters.category,
    listingType: filters.listingType,
    location: filters.location,
    search: filters.search,
    conditions: filters.conditions,
    sort: filters.sort,
    page: filters.page
  };
  if (filters.maxPrice !== null) query.maxPrice = filters.maxPrice;

  if (view.tab === 'mine') {
    const user = window.api.getCurrentUser();
    query.sellerId = user ? user.id : '__none__';
  }
  return query;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit(reason) {
  listeners.forEach(fn => {
    try {
      fn(reason);
    } catch (err) {
      console.error('State listener failed:', err);
    }
  });
}
