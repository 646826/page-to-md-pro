import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundController } from '../src/background.js';

const tab = { id: 12, url: 'https://example.test/article' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function harness(executeScript = async () => {}) {
  const messages = [];
  const downloads = [];
  const badges = [];
  const chrome = {
    storage: {
      sync: { get: async () => ({}), set: async () => {} },
      local: { get: async () => ({}), set: async () => {} }
    },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async (value) => { badges.push(value); }
    },
    scripting: { executeScript },
    tabs: { sendMessage: async (tabId, message) => {
      messages.push({ tabId, message });
      return { ok: true, result: { markdown: '# Recovered\n', meta: { title: 'Recovered' } } };
    } },
    downloads: { download: async (options) => { downloads.push(options); return 7; } }
  };
  const controller = createBackgroundController(chrome, { captureTimeoutMs: 20, badgeDurationMs: 0 });
  return { chrome, controller, messages, downloads, badges };
}
// A test-only deadline makes the pre-fix hang fail as an assertion rather than
// leaving the test process waiting for an intentionally unresolved Chrome API.
async function outcome(promise) {
  let timer;
  try {
    return await Promise.race([
      promise.then((value) => ({ value }), (error) => ({ error })),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ pending: true }), 200); })
    ]);
  } finally { clearTimeout(timer); }
}

test('a stalled injection rejects and releases the per-tab capture lock', async (t) => {
  const injection = deferred();
  const env = harness(() => injection.promise);
  const first = env.controller.captureAndDownload(tab, 'auto');
  t.after(async () => { injection.resolve(); await first.catch(() => {}); });
  assert.equal(env.controller.captureAndDownload(tab, 'auto'), first, 'pending captures are still deduplicated');
  const result = await outcome(first);
  assert.equal(result.error?.code, 'CAPTURE_TIMEOUT');
  assert.equal(env.controller.activeCaptures.size, 0);
  assert.equal(env.messages.length, 0);
  assert.equal(env.downloads.length, 0);
  assert.equal(env.badges.at(-1).text, 'ERR');
});

test('a late injection cannot start a stale export after timeout and recovery', async (t) => {
  const oldInjection = deferred();
  let attempts = 0;
  const env = harness(() => ++attempts === 1 ? oldInjection.promise : Promise.resolve());
  const first = env.controller.captureAndDownload(tab, 'auto');
  t.after(async () => { oldInjection.resolve(); await first.catch(() => {}); });
  assert.equal((await outcome(first)).error?.code, 'CAPTURE_TIMEOUT');
  const recovered = await env.controller.captureAndDownload(tab, 'auto');
  assert.equal(recovered.filename, 'Recovered.md');
  oldInjection.resolve();
  await tick();
  assert.equal(env.messages.length, 1, 'only the fresh operation may request extraction');
  assert.equal(env.downloads.length, 1);
  assert.equal(env.controller.activeCaptures.size, 0);
});

test('late rejection is handled without changing the timeout outcome', async (t) => {
  const injection = deferred();
  const env = harness(() => injection.promise);
  const pending = env.controller.captureAndDownload(tab, 'auto');
  t.after(async () => { injection.resolve(); await pending.catch(() => {}); });
  const result = await outcome(pending);
  injection.reject(new Error('Frame disappeared after timeout'));
  await tick();
  assert.equal(result.error?.code, 'CAPTURE_TIMEOUT');
  assert.equal(env.messages.length, 0);
  assert.equal(env.downloads.length, 0);
});

test('successful injection keeps extraction and download behavior', async () => {
  const env = harness();
  const result = await env.controller.captureAndDownload(tab, 'selection');
  assert.equal(result.filename, 'Recovered.md');
  assert.equal(result.transport, 'data-url');
  assert.equal(env.messages[0].message.payload.mode, 'selection');
  assert.equal(env.downloads.length, 1);
  assert.equal(env.controller.activeCaptures.size, 0);
  assert.equal(env.badges.at(-1).text, 'MD');
});

test('a transient injection failure still retries once', async () => {
  let attempts = 0;
  const env = harness(async () => {
    if (++attempts === 1) throw new Error('No frame with id 0');
  });
  await env.controller.captureAndDownload(tab, 'auto');
  assert.equal(attempts, 2);
  assert.equal(env.downloads.length, 1);
});

test('a permanent injection failure is not retried or replaced', async () => {
  const failure = new Error('Extension permission denied');
  let attempts = 0;
  const env = harness(async () => { attempts += 1; throw failure; });
  await assert.rejects(env.controller.captureAndDownload(tab, 'auto'), (error) => error === failure);
  assert.equal(attempts, 1);
  assert.equal(env.messages.length, 0);
  assert.equal(env.controller.activeCaptures.size, 0);
});

test('a stalled tab does not prevent another tab from exporting', async (t) => {
  const injection = deferred();
  const env = harness(({ target }) => target.tabId === tab.id ? injection.promise : Promise.resolve());
  const pending = env.controller.captureAndDownload(tab, 'auto');
  t.after(async () => { injection.resolve(); await pending.catch(() => {}); });
  const failure = outcome(pending);
  const result = await env.controller.captureAndDownload({ ...tab, id: 99 }, 'auto');
  assert.equal(result.filename, 'Recovered.md');
  assert.equal((await failure).error?.code, 'CAPTURE_TIMEOUT');
  assert.deepEqual(env.messages.map((message) => message.tabId), [99]);
});
