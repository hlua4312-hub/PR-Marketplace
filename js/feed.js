/**
 * PR MARKETPLACE - LISTING FEED
 * Cards, filters, search, sorting and pagination.
 */

import {
  escapeHtml, highlight, formatPrice, hoursUntilPurge,
  showToast, PLACEHOLDER_IMAGE
} from './ui.js';
import { filters, view, queryFilters, setFilter, setTab, resetFilters, activeFilterCount, PRICE_SLIDER_MAX } from './store.js';

let els = {};
let loadedItems = [];
let openDetail = null;      // injected by app.js to avoid a circular import
let loadToken = 0;

export function initFeed({ onOpenItem }) {
  openDetail = onOpenItem;

  els = {
    grid: document.getElementById('itemsGrid'),
    count: document.getElementById('itemCount'),
    title: document.getElementById('feedTitle'),
    empty: document.getElementById('emptyState'),
    search: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearchBtn'),
    categories: document.getElementById('categoriesNav'),
    location: document.getElementById('locationSelect'),
    sort: document.getElementById('sortSelect'),
    priceRange: document.getElementById('priceRange'),
    priceDisplay: document.getElementById('priceValueDisplay'),
    filterBtn: document.getElementById('filterModalBtn'),
    filtersBar: document.getElementById('activeFiltersBar'),
    filterTags: document.getElementById('filterTags'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),
    loadMoreWrap: document.getElementById('loadMoreWrap'),
    loadMoreBtn: document.getElementById('btnLoadMore'),
    offline: document.getElementById('offlineBanner'),
    offlineText: document.getElementById('offlineBannerText')
  };

  wireSearch();
  wireCategories();
  wireFilters();
  wirePagination();
}

/* ============================================================== loading === */

export async function loadFeed({ append = false } = {}) {
  if (!els.grid) return;

  const token = ++loadToken;

  if (!append && !els.grid.children.length) {
    els.grid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div>';
  }
  if (append && els.loadMoreBtn) {
    els.loadMoreBtn.disabled = true;
    els.loadMoreBtn.textContent = 'Loading…';
  }

  try {
    const pageSize = window.PRConfig.PAGE_SIZE;
    let items = [];
    let fromCache = false;

    if (view.tab === 'favorites') {
      // Favourites are device-local ids, so resolve them one by one and skip
      // any that have since been sold and purged.
      const ids = window.api.getFavoriteIds();
      const resolved = await Promise.all(ids.map(id => window.api.fetchItemById(id).catch(() => null)));
      items = resolved.filter(Boolean);
      view.hasMorePages = false;
    } else {
      const result = await window.api.fetchItems(queryFilters());
      items = result.items;
      fromCache = result.fromCache;
      view.hasMorePages = items.length === pageSize;
    }

    if (token !== loadToken) return;   // a newer request already landed

    loadedItems = append ? loadedItems.concat(items) : items;
    view.lastResultCount = loadedItems.length;

    renderOfflineState(fromCache);
    renderHeading();
    renderActiveFilters();
    renderItems(loadedItems);
    renderPagination();
  } catch (err) {
    if (token !== loadToken) return;
    console.error('Could not load the feed:', err);
    showToast('Could not load listings. Pull down to try again.');
  } finally {
    if (els.loadMoreBtn) {
      els.loadMoreBtn.disabled = false;
      els.loadMoreBtn.textContent = 'Load more listings';
    }
  }
}

function renderOfflineState(fromCache) {
  if (!els.offline) return;
  els.offline.classList.toggle('hidden', !fromCache);
  if (fromCache && els.offlineText) {
    els.offlineText.textContent = navigator.onLine
      ? "Can't reach the database — showing listings saved on this device."
      : "You're offline — showing listings saved on this device.";
  }
}

function renderHeading() {
  if (!els.title) return;
  if (view.tab === 'favorites') {
    els.title.textContent = 'Saved Items';
  } else if (view.tab === 'mine') {
    els.title.textContent = 'My Listings';
  } else if (filters.category !== 'all') {
    els.title.textContent = filters.category;
  } else {
    els.title.textContent = 'Recent Listings';
  }
}

/* =============================================================== cards === */

function renderItems(items) {
  if (els.count) {
    els.count.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  }

  if (!items.length) {
    els.grid.innerHTML = '';
    renderEmptyState();
    return;
  }

  els.empty?.classList.add('hidden');

  const favIds = window.api.getFavoriteIds();
  const currentUser = window.api.getCurrentUser();

  els.grid.innerHTML = items.map(item => cardMarkup(item, favIds, currentUser)).join('');
}

function cardMarkup(item, favIds, currentUser) {
  const isFav = favIds.includes(String(item.id));
  const isSold = Boolean(item.isSold);
  const isMine = Boolean(currentUser && item.userId === currentUser.id);
  const hrsLeft = isSold && item.soldAt ? hoursUntilPurge(item.soldAt) : null;
  const image = item.imageUrl || PLACEHOLDER_IMAGE;

  return `
    <article class="product-card ${isSold ? 'is-sold-card' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="card-image-wrapper">
        ${isSold
          ? '<span class="condition-badge sold-badge">SOLD</span>'
          : `<span class="condition-badge">${escapeHtml(item.condition)}</span>`}
        ${isMine ? '<span class="owner-badge">Your listing</span>' : ''}

        <button class="fav-btn ${isFav ? 'active' : ''}" data-fav="${escapeHtml(item.id)}"
                aria-label="${isFav ? 'Remove from saved' : 'Save this item'}" aria-pressed="${isFav}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>

        <img class="card-image" src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}"
             loading="lazy" decoding="async" data-placeholder="1">
      </div>

      <div class="card-details">
        <span class="card-category">${escapeHtml(item.category)}</span>
        <h3 class="card-title">${highlight(item.title, filters.search)}</h3>

        <div class="card-price-row">
          <span class="card-price ${isSold ? 'line-through' : ''}">${formatPrice(item.price)}</span>
          <span class="card-location">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escapeHtml((item.location || '').split('/')[0] || item.location)}
          </span>
        </div>

        ${hrsLeft !== null ? `<span class="auto-delete-tag">Removed in ${hrsLeft}h</span>` : ''}

        <button class="quick-contact-btn ${isSold ? 'btn-disabled' : ''}" data-open="${escapeHtml(item.id)}">
          <span>${isSold ? 'View details' : isMine ? 'Manage listing' : 'View & contact'}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </article>
  `;
}

function renderEmptyState() {
  if (!els.empty) return;

  const states = {
    favorites: {
      icon: '♡',
      title: 'Nothing saved yet',
      body: 'Tap the heart on any listing and it will wait for you here.',
      action: { label: 'Browse listings', tab: 'explore' }
    },
    mine: {
      icon: '☐',
      title: "You haven't posted anything",
      body: 'Tap Sell to list your first item. It takes about a minute.',
      action: { label: 'Browse listings', tab: 'explore' }
    },
    explore: {
      icon: '⌕',
      title: 'No listings match',
      body: filters.search
        ? `Nothing matches “${filters.search}”. Try a shorter search, or clear your filters.`
        : 'Try a different category, or clear your filters.',
      action: { label: 'Clear filters', clear: true }
    }
  };

  const config = states[view.tab] || states.explore;

  els.empty.innerHTML = `
    <div class="empty-icon" aria-hidden="true">${config.icon}</div>
    <h3>${escapeHtml(config.title)}</h3>
    <p>${escapeHtml(config.body)}</p>
    <div class="empty-actions">
      <button class="btn btn-primary" id="emptyActionBtn">${escapeHtml(config.action.label)}</button>
    </div>
  `;
  els.empty.classList.remove('hidden');

  document.getElementById('emptyActionBtn')?.addEventListener('click', () => {
    if (config.action.clear) {
      resetFilters();
      syncFilterControls();
    } else {
      setTab(config.action.tab);
      syncNavButtons(config.action.tab);
    }
    loadFeed();
  });
}

function renderPagination() {
  if (!els.loadMoreWrap) return;
  const show = view.tab === 'explore' && view.hasMorePages;
  els.loadMoreWrap.classList.toggle('hidden', !show);
}

/* ============================================================ interaction === */

export function wireGridDelegation() {
  els.grid?.addEventListener('click', event => {
    const favBtn = event.target.closest('[data-fav]');
    if (favBtn) {
      event.stopPropagation();
      toggleFavorite(favBtn);
      return;
    }

    const card = event.target.closest('.product-card');
    if (card && openDetail) openDetail(card.dataset.id);
  });

  // Swap a broken photo for the local placeholder without a network round trip.
  els.grid?.addEventListener('error', event => {
    const img = event.target;
    if (img.tagName === 'IMG' && img.dataset.placeholder) {
      delete img.dataset.placeholder;
      img.src = PLACEHOLDER_IMAGE;
    }
  }, true);
}

function toggleFavorite(btn) {
  const id = btn.dataset.fav;
  const favs = window.api.toggleFavorite(id);
  const isFav = favs.includes(String(id));

  btn.classList.toggle('active', isFav);
  btn.setAttribute('aria-pressed', String(isFav));
  btn.setAttribute('aria-label', isFav ? 'Remove from saved' : 'Save this item');
  btn.querySelector('svg')?.setAttribute('fill', isFav ? 'currentColor' : 'none');

  updateFavoriteBadge();
  showToast(isFav ? 'Saved' : 'Removed from saved');

  if (view.tab === 'favorites') loadFeed();
}

export function updateFavoriteBadge() {
  const badge = document.getElementById('favBadge');
  if (!badge) return;
  const count = window.api.getFavoriteIds().length;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
}

/* ================================================================ search === */

function wireSearch() {
  let timer;
  els.search?.addEventListener('input', event => {
    const value = event.target.value.trim();
    els.clearSearch?.classList.toggle('hidden', value.length === 0);

    clearTimeout(timer);
    timer = setTimeout(() => {
      setFilter({ search: value });
      loadFeed();
    }, 250);
  });

  els.clearSearch?.addEventListener('click', () => {
    if (els.search) els.search.value = '';
    els.clearSearch.classList.add('hidden');
    setFilter({ search: '' });
    loadFeed();
  });
}

function wireCategories() {
  els.categories?.addEventListener('click', event => {
    const chip = event.target.closest('.cat-chip');
    if (!chip) return;

    els.categories.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    setFilter({ category: chip.dataset.category });
    if (view.tab !== 'explore') {
      setTab('explore');
      syncNavButtons('explore');
    }
    loadFeed();
  });
}

/* =============================================================== filters === */

function wireFilters() {
  els.priceRange?.addEventListener('input', event => {
    const value = Number(event.target.value);
    if (els.priceDisplay) {
      els.priceDisplay.textContent = value >= PRICE_SLIDER_MAX ? 'Any price' : `Up to ${formatPrice(value)}`;
    }
  });

  document.getElementById('applyFilterModalBtn')?.addEventListener('click', () => {
    const conditions = Array.from(document.querySelectorAll('input[name="condition"]:checked')).map(i => i.value);
    const raw = Number(els.priceRange?.value ?? PRICE_SLIDER_MAX);

    setFilter({
      conditions,
      maxPrice: raw >= PRICE_SLIDER_MAX ? null : raw,
      sort: els.sort?.value || 'newest'
    });

    document.getElementById('filterModal')?.classList.add('hidden');
    document.body.classList.remove('modal-open');
    loadFeed();
  });

  document.getElementById('resetFilterModalBtn')?.addEventListener('click', () => {
    resetFilters();
    syncFilterControls();
    loadFeed();
  });

  els.resetFiltersBtn?.addEventListener('click', () => {
    resetFilters();
    syncFilterControls();
    if (els.search) els.search.value = '';
    els.clearSearch?.classList.add('hidden');
    els.categories?.querySelectorAll('.cat-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.category === 'all');
    });
    loadFeed();
  });

  els.location?.addEventListener('change', event => {
    if (event.target.value === 'detect_gps') return;   // handled by the GPS button
    setFilter({ location: event.target.value });
    loadFeed();
  });
}

export function syncFilterControls() {
  if (els.priceRange) {
    els.priceRange.value = filters.maxPrice === null ? PRICE_SLIDER_MAX : filters.maxPrice;
  }
  if (els.priceDisplay) {
    els.priceDisplay.textContent = filters.maxPrice === null ? 'Any price' : `Up to ${formatPrice(filters.maxPrice)}`;
  }
  if (els.sort) els.sort.value = filters.sort;
  if (els.location) els.location.value = filters.location;

  document.querySelectorAll('input[name="condition"]').forEach(input => {
    input.checked = filters.conditions.includes(input.value);
  });
}

function renderActiveFilters() {
  if (!els.filtersBar || !els.filterTags) return;

  const tags = [];
  if (filters.category !== 'all') tags.push(filters.category);
  filters.conditions.forEach(c => tags.push(c));
  if (filters.maxPrice !== null) tags.push(`Under ${formatPrice(filters.maxPrice)}`);
  if (filters.location !== 'all') tags.push(filters.location);
  if (filters.sort !== 'newest') {
    const labels = { price_asc: 'Cheapest first', price_desc: 'Priciest first', oldest: 'Oldest first' };
    tags.push(labels[filters.sort] || filters.sort);
  }
  if (filters.search) tags.push(`“${filters.search}”`);

  els.filterTags.innerHTML = tags.map(t => `<span class="check-chip">${escapeHtml(t)}</span>`).join('');
  els.filtersBar.classList.toggle('hidden', tags.length === 0);
  els.filterBtn?.classList.toggle('active', activeFilterCount() > 0);
}

function wirePagination() {
  els.loadMoreBtn?.addEventListener('click', () => {
    filters.page += 1;
    loadFeed({ append: true });
  });
}

/* ============================================================ navigation === */

export function syncNavButtons(tab) {
  const map = { explore: 'navExplore', favorites: 'navFavorites', mine: 'navExplore' };
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(map[tab] || 'navExplore')?.classList.add('active');
}

export function getLoadedItems() {
  return loadedItems;
}
