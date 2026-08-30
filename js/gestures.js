/**
 * PR MARKETPLACE - FEED GESTURES
 *
 * Pull down from the top of the feed to refresh, and keep scrolling at the
 * bottom to pull in the next page.
 *
 * Both only apply to the feed itself. Pulling inside an open sheet, or on a
 * tab that is not the listing feed, does nothing — refreshing the marketplace
 * out from under someone reading a listing would be worse than not offering
 * the gesture at all.
 */

/** How far to pull before it counts, in CSS pixels. */
const TRIGGER_DISTANCE = 72;

/** Pull past the trigger and it keeps moving, but less and less. */
const MAX_PULL = 120;
const RESISTANCE = 0.45;

let pullEnabled = () => true;
let onRefresh = async () => {};
let indicator = null;
let refreshing = false;

/* ==================================================== pull to refresh === */

export function initPullToRefresh({ canPull, onRefresh: handler }) {
  pullEnabled = canPull || pullEnabled;
  onRefresh = handler || onRefresh;

  indicator = document.getElementById('pullIndicator');
  if (!indicator) return;

  let startY = 0;
  let startX = 0;
  let pulling = false;
  let claimed = false;      // decided this gesture is a vertical pull
  let distance = 0;

  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  document.addEventListener('touchstart', event => {
    // One finger only: a pinch is not a pull.
    if (refreshing || event.touches.length !== 1 || !atTop() || !pullEnabled()) return;
    startY = event.touches[0].clientY;
    startX = event.touches[0].clientX;
    pulling = true;
    claimed = false;
    distance = 0;
    // Only now does a listener that can block scrolling go on. Left attached
    // permanently, it makes every touchmove on the page wait for JavaScript
    // before the browser is allowed to scroll - the browser cannot know we
    // will not call preventDefault until we have run. On a phone with a busy
    // main thread that reads as a feed which will not move at all. Away from
    // the top of the page there is no pull to detect, so there is nothing to
    // attach and scrolling stays on the compositor's fast path.
    document.addEventListener('touchmove', onMove, { passive: false });
  }, { passive: true });

  function onMove(event) {
    if (!pulling || refreshing) return;

    const dy = event.touches[0].clientY - startY;
    const dx = event.touches[0].clientX - startX;

    // Downward, and more vertical than horizontal — otherwise this is someone
    // scrolling the category chips sideways.
    if (!claimed) {
      if (dy <= 0 || Math.abs(dy) < Math.abs(dx)) {
        // Not a pull after all - a scroll or a sideways swipe. Get out of the
        // browser's way for the rest of this gesture.
        pulling = false;
        detachMove();
        return;
      }
      if (dy < 8) return;      // too small to call yet
      claimed = true;
    }

    if (!atTop()) {
      reset();
      return;
    }

    // Cancelable is false once the browser has committed to scrolling, and
    // calling preventDefault then only produces a console warning.
    if (event.cancelable) event.preventDefault();

    distance = Math.min(MAX_PULL, dy * RESISTANCE);
    render(distance);
  }

  const detachMove = () => document.removeEventListener('touchmove', onMove);

  const finish = async () => {
    detachMove();
    if (!pulling || refreshing) {
      reset();
      return;
    }
    pulling = false;

    if (distance < TRIGGER_DISTANCE) {
      reset();
      return;
    }

    refreshing = true;
    indicator.classList.add('is-refreshing');
    indicator.style.transform = `translateY(${TRIGGER_DISTANCE}px)`;

    try {
      await onRefresh();
    } catch (err) {
      console.warn('Refresh failed:', err);
    } finally {
      refreshing = false;
      indicator.classList.remove('is-refreshing');
      reset();
    }
  };

  document.addEventListener('touchend', finish, { passive: true });
  document.addEventListener('touchcancel', () => { detachMove(); pulling = false; reset(); }, { passive: true });

  function render(px) {
    const progress = Math.min(1, px / TRIGGER_DISTANCE);
    indicator.classList.add('is-pulling');
    indicator.classList.toggle('is-ready', progress >= 1);
    indicator.style.transform = `translateY(${px}px)`;
    indicator.style.opacity = String(Math.min(1, progress * 1.4));
    // Spinning with the pull makes the gesture feel connected to the finger.
    indicator.style.setProperty('--pull-rotate', `${progress * 270}deg`);
  }

  function reset() {
    distance = 0;
    claimed = false;
    if (!indicator) return;
    indicator.classList.remove('is-pulling', 'is-ready');
    indicator.style.transform = '';
    indicator.style.opacity = '';
  }
}

/* ====================================================== infinite scroll === */

/**
 * Load the next page when the end of the list comes into view, a screen
 * early so the new rows are usually there before the user arrives.
 *
 * The Load more button stays in the markup: it is the fallback where
 * IntersectionObserver is unavailable, and the thing a keyboard reaches.
 */
export function initInfiniteScroll({ sentinel, hasMore, onReachEnd }) {
  if (!sentinel || typeof IntersectionObserver !== 'function') return null;

  let loading = false;

  const observer = new IntersectionObserver(async entries => {
    if (!entries[0].isIntersecting || loading || !hasMore()) return;

    loading = true;
    try {
      await onReachEnd();
    } catch (err) {
      console.warn('Could not load the next page:', err);
    } finally {
      loading = false;
    }
  }, { rootMargin: '600px 0px' });

  observer.observe(sentinel);
  return () => observer.disconnect();
}
