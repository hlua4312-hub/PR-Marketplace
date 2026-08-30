import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserEnv } from './helpers/env.mjs';

let updates;

before(async () => {
  installBrowserEnv();
  // updates.js imports ui.js, which reads window.PRConfig at call time only.
  updates = await import('../js/updates.js');
});

describe('isNewerVersion', () => {
  test('recognises a straightforward bump', () => {
    assert.equal(updates.isNewerVersion('3.1.0', '3.0.0'), true);
    assert.equal(updates.isNewerVersion('4.0.0', '3.9.9'), true);
  });

  test('says no when the versions match', () => {
    assert.equal(updates.isNewerVersion('3.0.0', '3.0.0'), false);
  });

  test('says no when the published version is older', () => {
    assert.equal(updates.isNewerVersion('2.9.9', '3.0.0'), false);
  });

  test('compares numerically, not as text', () => {
    // The trap: '3.10.0' < '3.9.0' as strings, so a naive comparison stops
    // offering updates the moment a project reaches its tenth minor release.
    assert.equal(updates.isNewerVersion('3.10.0', '3.9.0'), true);
    assert.equal(updates.isNewerVersion('3.9.0', '3.10.0'), false);
    assert.equal(updates.isNewerVersion('1.0.20', '1.0.3'), true);
  });

  test('ignores a build suffix like -debug', () => {
    assert.equal(updates.isNewerVersion('3.1.0', '3.0.0-debug'), true);
    assert.equal(updates.isNewerVersion('3.0.0', '3.0.0-debug'), false);
  });

  test('copes with different segment counts', () => {
    assert.equal(updates.isNewerVersion('3.1', '3.0.9'), true);
    assert.equal(updates.isNewerVersion('3', '3.0.0'), false);
    assert.equal(updates.isNewerVersion('3.0.1', '3'), true);
  });

  test('treats missing or malformed input as not newer', () => {
    assert.equal(updates.isNewerVersion(undefined, '3.0.0'), false);
    assert.equal(updates.isNewerVersion('', '3.0.0'), false);
    assert.equal(updates.isNewerVersion('not-a-version', '3.0.0'), false);
  });
});

describe('checkAndroidUpdate', () => {
  test('returns null without both arguments, rather than fetching nothing', async () => {
    assert.equal(await updates.checkAndroidUpdate({}), null);
    assert.equal(await updates.checkAndroidUpdate({ currentVersion: '3.0.0' }), null);
  });

  test('stays silent when the version file cannot be reached', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const result = await updates.checkAndroidUpdate({
      currentVersion: '3.0.0',
      manifestUrl: 'https://example.test/version.json'
    });
    // A failed update check is not worth interrupting anyone about.
    assert.equal(result, null);
  });

  test('stays silent on a non-200 response', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    assert.equal(await updates.checkAndroidUpdate({
      currentVersion: '3.0.0',
      manifestUrl: 'https://example.test/version.json'
    }), null);
  });

  test('reports nothing when the published build is the one installed', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: '3.0.0' }) });
    assert.equal(await updates.checkAndroidUpdate({
      currentVersion: '3.0.0',
      manifestUrl: 'https://example.test/version.json'
    }), null);
  });

  test('reports the details when a newer build is published', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ version: '3.2.0', notes: 'Faster search', apkUrl: 'https://example.test/app.apk' })
    });
    const result = await updates.checkAndroidUpdate({
      currentVersion: '3.1.0',
      manifestUrl: 'https://example.test/version.json'
    });
    assert.deepEqual(result, {
      version: '3.2.0',
      notes: 'Faster search',
      url: 'https://example.test/app.apk'
    });
  });
});
