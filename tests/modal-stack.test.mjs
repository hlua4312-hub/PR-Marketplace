import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * body.modal-open sets overflow:hidden. A stack entry that is never popped
 * therefore does not merely leak - it leaves the whole page unable to scroll,
 * with nothing on screen to explain why. This pins the recovery.
 */

/** The smallest stand-in that still exercises the real branching. */
function makeElement() {
  const classes = new Set();
  return {
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))
    }
  };
}

let body, stack;

/** Mirrors the openModal / closeModal / syncBodyLock trio in js/ui.js. */
function syncBodyLock() {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].classList.contains('hidden')) stack.splice(i, 1);
  }
  body.classList.toggle('modal-open', stack.length > 0);
}
function openModal(el) {
  el.classList.remove('hidden');
  body.classList.add('modal-open');
  const i = stack.indexOf(el);
  if (i !== -1) stack.splice(i, 1);
  stack.push(el);
}
function closeModal(el) {
  el.classList.add('hidden');
  const i = stack.indexOf(el);
  if (i !== -1) stack.splice(i, 1);
  syncBodyLock();
}

beforeEach(() => { body = makeElement(); stack = []; });

describe('the modal stack and the page scroll lock', () => {
  test('locks while a sheet is open and unlocks once it closes', () => {
    const sheet = makeElement();
    openModal(sheet);
    assert.equal(body.classList.contains('modal-open'), true);
    closeModal(sheet);
    assert.equal(body.classList.contains('modal-open'), false);
  });

  test('stays locked while a second sheet is still open', () => {
    const a = makeElement(), b = makeElement();
    openModal(a); openModal(b);
    closeModal(b);
    assert.equal(body.classList.contains('modal-open'), true, 'a is still open');
    closeModal(a);
    assert.equal(body.classList.contains('modal-open'), false);
  });

  test('recovers when a sheet is hidden behind the stack, not through it', () => {
    // The bug: the filter sheet was dismissed with classList.add('hidden'),
    // so it stayed on the stack. The next sheet to close found the stack
    // still non-empty, left the lock on, and the feed stopped scrolling.
    const filter = makeElement(), detail = makeElement();
    openModal(filter);
    filter.classList.add('hidden');          // dismissed behind the stack's back
    openModal(detail);
    closeModal(detail);
    assert.equal(body.classList.contains('modal-open'), false,
      'a stale entry must not keep the page locked');
  });

  test('repairs an orphaned page lock before the feed renders', () => {
    // Covers a browser restore after an earlier version left only the body
    // class behind. No visible sheet should mean the page may scroll again.
    body.classList.add('modal-open');
    syncBodyLock();
    assert.equal(body.classList.contains('modal-open'), false);
  });

  test('reopening a sheet does not stack it twice', () => {
    const sheet = makeElement();
    openModal(sheet); openModal(sheet);
    closeModal(sheet);
    assert.equal(body.classList.contains('modal-open'), false);
  });
});
