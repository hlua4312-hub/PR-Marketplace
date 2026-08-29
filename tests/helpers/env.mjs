/**
 * Minimal browser stand-ins so the app's modules can be exercised under
 * `node --test`. Only what the code under test actually touches is faked -
 * enough for the pure logic, not a whole DOM.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(here, '..', '..');

/** In-memory localStorage that behaves like the real one, quota included. */
export class MemoryStorage {
  constructor({ quotaBytes = Infinity } = {}) {
    this.map = new Map();
    this.quotaBytes = quotaBytes;
  }
  get length() { return this.map.size; }
  key(i) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null; }
  setItem(k, v) {
    const next = String(v);
    const projected = this._bytes() + next.length - (this.getItem(k)?.length ?? 0);
    if (projected > this.quotaBytes) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(String(k), next);
  }
  removeItem(k) { this.map.delete(String(k)); }
  clear() { this.map.clear(); }
  _bytes() {
    let total = 0;
    for (const [k, v] of this.map) total += k.length + v.length;
    return total;
  }
}

/**
 * Install the globals the browser code assumes, then load the two classic
 * scripts (config.js and api.js) that assign onto `window`.
 */
export function installBrowserEnv({ quotaBytes = Infinity, seed = {} } = {}) {
  const storage = new MemoryStorage({ quotaBytes });
  for (const [key, value] of Object.entries(seed)) storage.setItem(key, value);

  globalThis.localStorage = storage;
  globalThis.window = globalThis;
  globalThis.console.warn = () => {};        // the code logs on quota failures

  loadClassicScript('js/config.js');
  loadClassicScript('js/api.js');

  return { storage, window: globalThis.window };
}

/**
 * config.js and api.js are classic scripts, not modules. Wrapping each in an
 * IIFE keeps its top-level class and const out of the shared script scope, so
 * a test can install a fresh environment as many times as it likes; the
 * `window.*` assignments still land on the global.
 */
function loadClassicScript(relativePath) {
  const code = readFileSync(join(projectRoot, relativePath), 'utf8');
  vm.runInThisContext(`(function () {\n${code}\n})();`, { filename: relativePath });
}

export function resetEnv() {
  delete globalThis.api;
  if (globalThis.window) {
    delete globalThis.window.api;
    delete globalThis.window.PRConfig;
  }
}
