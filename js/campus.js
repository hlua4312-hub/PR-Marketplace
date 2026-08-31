/**
 * PR MARKETPLACE - CAMPUS CONFIGURATION, RENDERED
 *
 * Categories, areas, pickup spots, departments and years all used to be typed
 * into index.html - the category list three times over, once for the feed
 * chips, once for the sell form and once for the filter sheet. Adding one
 * meant remembering all three, and they drifted.
 *
 * They come from `PRConfig.CAMPUS` now and are painted in here, so a college
 * adopting this app edits one object in js/config.js and nothing else.
 *
 * None of this is a security boundary. `looksLikeCampusEmail` below decides
 * what the sign-up form says, not who is allowed to post - that is settled by
 * the items insert policy in supabase_schema.sql, against a domain list held
 * in the database where the browser cannot reach it.
 */

import { escapeHtml } from './ui.js';

const campus = () => window.PRConfig.CAMPUS || {};

/* ============================================================== the feed === */

/** Category chips across the top of the feed, "All Items" first. */
export function renderCategoryChips(container) {
  if (!container) return;
  const chips = [`
    <button class="cat-chip active" data-category="all">
      <span class="chip-icon">✨</span>
      <span>All Items</span>
    </button>`];

  (campus().categories || []).forEach(cat => {
    chips.push(`
    <button class="cat-chip" data-category="${escapeHtml(cat.id)}">
      <span class="chip-icon">${escapeHtml(cat.icon || '📦')}</span>
      <span>${escapeHtml(cat.short || cat.id)}</span>
    </button>`);
  });

  container.innerHTML = chips.join('');
}

/** The header's area dropdown, with the GPS option kept at the top. */
export function renderAreaOptions(select) {
  if (!select) return;
  const options = [
    '<option value="all">Everywhere nearby</option>',
    '<option value="detect_gps">Use my location</option>'
  ];
  (campus().areas || []).forEach(area => {
    // The stored value is the plain name; the label may pair it with the
    // neighbourhood people actually say. Filtering matches on the name.
    options.push(`<option value="${escapeHtml(area.name)}">${escapeHtml(area.label || area.name)}</option>`);
  });
  select.innerHTML = options.join('');
}

/* =========================================================== the sell form === */

export function renderCategoryOptions(select, hint) {
  if (!select) return;
  const cats = campus().categories || [];
  select.innerHTML = [
    '<option value="" disabled selected>Choose a category</option>',
    ...cats.map(
      cat => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.icon || '')} ${escapeHtml(cat.id)}</option>`
    )
  ].join('');

  // "Electronics" on its own left people guessing where a graphics card went.
  // The examples for whichever category is chosen show under the picker.
  if (!hint) return;
  const paint = () => {
    const cat = cats.find(c => c.id === select.value);
    hint.textContent = cat?.examples || '';
    hint.classList.toggle('hidden', !cat?.examples);
  };
  select.addEventListener('change', paint);
  paint();
}

/**
 * The area picker on the sell form. Same list as the header filter, minus
 * the two entries that only make sense while browsing - which is the point
 * of driving both from one array: a seller cannot pick an area the filter
 * has never heard of, so "Boys Hostel" always matches "Boys Hostel".
 */
export function renderSellAreaOptions(select) {
  if (!select) return;
  select.innerHTML = [
    '<option value="" disabled selected>Choose an area</option>',
    ...(campus().areas || []).map(
      a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.label || a.name)}</option>`)
  ].join('');
}

/**
 * Where the handover happens. "Somewhere else" stays on the list because a
 * picker with no way out gets answered with whichever option is nearest the
 * truth, and a wrong meeting point is worse than a blank one.
 */
export function renderPickupOptions(select) {
  if (!select) return;
  select.innerHTML = [
    '<option value="">No preference — we\'ll agree in chat</option>',
    ...(campus().pickupSpots || []).map(
      spot => `<option value="${escapeHtml(spot)}">${escapeHtml(spot)}</option>`
    ),
    '<option value="Somewhere else">Somewhere else</option>'
  ].join('');
}

/* ============================================================= the profile === */

export function renderDepartmentOptions(select) {
  if (!select) return;
  select.innerHTML = [
    '<option value="">Not saying</option>',
    ...(campus().departments || []).map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)
  ].join('');
}

export function renderYearOptions(select) {
  if (!select) return;
  select.innerHTML = [
    '<option value="">Not saying</option>',
    ...(campus().years || []).map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`)
  ].join('');
}

/* ========================================================== verification === */

/** The configured student email domain, or '' when none has been set. */
export function campusDomain() {
  return (campus().emailDomain || '').trim().toLowerCase().replace(/^@/, '');
}

/**
 * A courtesy check, so someone typing a personal address finds out before
 * they have filled in the rest of the form rather than after their first
 * listing is refused. With no domain configured this always passes, which
 * matches an empty `email_domains` in the database.
 */
export function looksLikeCampusEmail(email) {
  const domain = campusDomain();
  if (!domain) return true;
  return (email || '').trim().toLowerCase().endsWith('@' + domain);
}

/** One line for the sign-up form, or '' when any address will do. */
export function campusEmailHint() {
  const domain = campusDomain();
  if (!domain) return '';
  return `Use your college address (@${domain}) — it is what verifies you as a student.`;
}

/** Paint the campus name into anything tagged for it. */
export function applyCampusLabels(root = document) {
  const name = campus().name || '';
  if (!name) return;
  root.querySelectorAll('[data-campus-name]').forEach(el => { el.textContent = name; });
}

/** Everything above, run once at startup. */
export function initCampus() {
  renderCategoryChips(document.getElementById('categoriesNav'));
  renderAreaOptions(document.getElementById('locationSelect'));
  renderCategoryOptions(document.getElementById('itemCategory'),
                        document.getElementById('itemCategoryHint'));
  renderSellAreaOptions(document.getElementById('itemLocation'));
  renderPickupOptions(document.getElementById('itemPickupSpot'));
  renderDepartmentOptions(document.getElementById('profileDepartment'));
  renderYearOptions(document.getElementById('profileYear'));
  applyCampusLabels();

  const hint = campusEmailHint();
  document.querySelectorAll('[data-campus-email-hint]').forEach(el => {
    el.textContent = hint;
    el.classList.toggle('hidden', !hint);
  });
}
