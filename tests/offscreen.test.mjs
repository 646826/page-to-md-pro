import test from 'node:test';
import assert from 'node:assert/strict';
import { createOffscreenController } from '../src/offscreen.js';

function createHarness() {
  const urls = new Set();
  let sequence = 0;
  const urlApi = {
    createObjectURL(blob) {
      assert.ok(blob instanceof Blob);
      const url = `blob:test-${++sequence}`;
      urls.add(url);
      return url;
    },
    revokeObjectURL(url) { urls.delete(url); }
  };
  const controller = createOffscreenController({ runtime: { id: 'extension-id' } }, { Blob, URL: urlApi });
  const send = (message, sender = { id: 'extension-id' }) => new Promise((resolve) => {
    const async = controller.handleMessage(message, sender, resolve);
    assert.equal(async, false);
  });
  return { controller, send, urls };
}

test('creates and revokes a validated Blob URL', async () => {
  const harness = createHarness();
  const created = await harness.send({ type: 'page-to-md-create-blob', id: 'request-1', mime: 'text/markdown', text: '# Test' });
  assert.deepEqual(created, { ok: true, id: 'request-1', url: 'blob:test-1' });
  assert.equal(harness.urls.size, 1);
  assert.deepEqual(await harness.send({ type: 'page-to-md-revoke-blob', url: created.url }), { ok: true });
  assert.equal(harness.urls.size, 0);
});

test('rejects untrusted senders and invalid payloads', async () => {
  const harness = createHarness();
  const untrusted = await harness.send({ type: 'page-to-md-create-blob', id: 'x', text: 'x' }, { id: 'other' });
  assert.equal(untrusted.ok, false);
  assert.equal(untrusted.error.code, 'UNTRUSTED_SENDER');
  const invalid = await harness.send({ type: 'page-to-md-create-blob', id: '', text: 42 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_BLOB_REQUEST');
});

test('revoke-all removes every remaining URL', async () => {
  const harness = createHarness();
  await harness.send({ type: 'page-to-md-create-blob', id: 'a', text: 'a' });
  await harness.send({ type: 'page-to-md-create-blob', id: 'b', text: 'b' });
  assert.equal(harness.urls.size, 2);
  assert.deepEqual(await harness.send({ type: 'page-to-md-revoke-all-blobs' }), { ok: true, revoked: 2 });
  assert.equal(harness.urls.size, 0);
});
