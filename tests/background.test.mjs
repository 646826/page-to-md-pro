import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundController } from '../src/background.js';

function createEvent() {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    hasListener(listener) { return listeners.has(listener); },
    emit(...args) {
      for (const listener of [...listeners]) listener(...args);
    },
    get size() { return listeners.size; }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createChromeHarness({ badgeBackgroundDeferred = null } = {}) {
  const extraction = deferred();
  const calls = {
    executeScript: 0,
    tabMessages: 0,
    tabMessagePayloads: [],
    downloads: 0,
    runtimeMessages: [],
    badgeText: []
  };
  const downloadsChanged = createEvent();

  const chrome = {
    runtime: {
      id: 'test-extension',
      getURL: (path) => `chrome-extension://test-extension/${path}`,
      getContexts: async () => [{ contextType: 'OFFSCREEN_DOCUMENT' }],
      sendMessage: async (message) => {
        calls.runtimeMessages.push(message);
        if (message.type === 'page-to-md-create-blob') {
          return { ok: true, url: 'blob:fixture' };
        }
        if (message.type === 'page-to-md-revoke-blob') {
          return { ok: true };
        }
        return { ok: true };
      },
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onMessage: createEvent(),
      openOptionsPage: async () => {}
    },
    action: {
      onClicked: createEvent(),
      async setBadgeBackgroundColor() {
        if (badgeBackgroundDeferred) await badgeBackgroundDeferred.promise;
      },
      async setBadgeText(details) { calls.badgeText.push(details.text); }
    },
    commands: { onCommand: createEvent() },
    contextMenus: {
      onClicked: createEvent(),
      async removeAll() {},
      create() {}
    },
    tabs: {
      async query() { return []; },
      async sendMessage(_tabId, message) {
        calls.tabMessages += 1;
        calls.tabMessagePayloads.push(message);
        return extraction.promise;
      }
    },
    scripting: {
      async executeScript() { calls.executeScript += 1; }
    },
    downloads: {
      onChanged: downloadsChanged,
      async download() {
        calls.downloads += 1;
        return 7;
      }
    },
    offscreen: {
      async createDocument() {},
      async closeDocument() {}
    },
    storage: {
      sync: {
        async get(defaults) { return defaults; },
        async set() {}
      },
      local: {
        async get(defaults) { return defaults; },
        async set() {},
        async remove() {}
      }
    }
  };

  return { chrome, calls, extraction, downloadsChanged };
}

test('deduplicates simultaneous capture requests for one tab', async () => {
  const harness = createChromeHarness();
  const controller = createBackgroundController(harness.chrome, {
    captureTimeoutMs: 1_000,
    badgeDurationMs: 0
  });
  const tab = { id: 12, url: 'https://example.test/article' };

  const first = controller.captureAndDownload(tab, 'auto');
  const second = controller.captureAndDownload(tab, 'auto');

  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.executeScript, 1);
  assert.equal(harness.calls.tabMessages, 1);

  harness.extraction.resolve({
    ok: true,
    result: { markdown: '# Test\n', meta: { title: 'Test' } }
  });
  const [a, b] = await Promise.all([first, second]);

  assert.deepEqual(a, b);
  assert.equal(harness.calls.downloads, 1);
});

test('keeps a large-download Blob URL until Chrome reports completion', async () => {
  const harness = createChromeHarness();
  const controller = createBackgroundController(harness.chrome, {
    dataUrlThreshold: 10,
    downloadTimeoutMs: 1_000
  });

  const pending = controller.downloadMarkdown('x'.repeat(100), 'large.md', false);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.calls.runtimeMessages.some((message) => message.type === 'page-to-md-revoke-blob'), false);
  assert.equal(harness.downloadsChanged.size, 1);

  harness.downloadsChanged.emit({ id: 7, state: { current: 'complete' } });
  const result = await pending;

  assert.equal(result.downloadId, 7);
  assert.equal(harness.calls.runtimeMessages.filter((message) => message.type === 'page-to-md-revoke-blob').length, 1);
  assert.equal(harness.downloadsChanged.size, 0);
});

test('revokes a Blob URL and rejects when the download is interrupted', async () => {
  const harness = createChromeHarness();
  const controller = createBackgroundController(harness.chrome, {
    dataUrlThreshold: 10,
    downloadTimeoutMs: 1_000
  });

  const pending = controller.downloadMarkdown('x'.repeat(100), 'large.md', false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.downloadsChanged.emit({
    id: 7,
    state: { current: 'interrupted' },
    error: { current: 'NETWORK_FAILED' }
  });

  await assert.rejects(pending, (error) => error.code === 'DOWNLOAD_INTERRUPTED');
  assert.equal(harness.calls.runtimeMessages.filter((message) => message.type === 'page-to-md-revoke-blob').length, 1);
  assert.equal(harness.downloadsChanged.size, 0);
});

test('starts the Blob download timeout only after Chrome returns a download ID', async () => {
  const harness = createChromeHarness();
  const downloadStart = deferred();
  harness.chrome.downloads.download = async () => {
    harness.calls.downloads += 1;
    return downloadStart.promise;
  };
  const controller = createBackgroundController(harness.chrome, {
    dataUrlThreshold: 10,
    downloadTimeoutMs: 15
  });

  let settled = false;
  const pending = controller.downloadMarkdown('x'.repeat(100), 'save-dialog.md', true);
  pending.then(
    () => { settled = true; },
    () => { settled = true; }
  );

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(settled, false, 'waiting for Chrome to return a download ID must not consume the terminal-state timeout');

  downloadStart.resolve(7);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'a started download must remain pending until a terminal state or post-start timeout');

  harness.downloadsChanged.emit({ id: 7, state: { current: 'complete' } });
  const result = await pending;
  assert.equal(result.downloadId, 7);
});

test('rejects and cleans up when a Blob download never reaches a terminal state', async () => {
  const harness = createChromeHarness();
  const controller = createBackgroundController(harness.chrome, {
    dataUrlThreshold: 10,
    downloadTimeoutMs: 20
  });

  const pending = controller.downloadMarkdown('x'.repeat(100), 'stalled.md', false);

  await assert.rejects(
    pending,
    (error) => error.code === 'DOWNLOAD_TIMEOUT'
      && error.message === 'The Markdown download did not complete before the timeout.'
  );
  assert.equal(harness.calls.runtimeMessages.filter((message) => message.type === 'page-to-md-revoke-blob').length, 1);
  assert.equal(harness.downloadsChanged.size, 0);
});

test('retries one transient extraction messaging failure', async () => {
  const harness = createChromeHarness();
  let attempts = 0;
  const requestIds = [];
  harness.chrome.tabs.sendMessage = async (_tabId, message) => {
    attempts += 1;
    requestIds.push(message.requestId);
    if (attempts === 1) {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }
    return {
      ok: true,
      result: { markdown: '# Recovered\n', meta: { title: 'Recovered' } }
    };
  };
  const controller = createBackgroundController(harness.chrome, { badgeDurationMs: 0 });

  const result = await controller.captureAndDownload(
    { id: 33, url: 'https://example.test/recovered' },
    'auto'
  );

  assert.equal(result.filename, 'Recovered.md');
  assert.equal(attempts, 2);
  assert.equal(requestIds[0], requestIds[1], 'a retry must reuse the same logical request ID');
  assert.equal(harness.calls.executeScript, 2);
  assert.equal(harness.calls.downloads, 1);
});

test('uses the Blob transport when UTF-8 bytes exceed the data URL threshold', async () => {
  const harness = createChromeHarness();
  const controller = createBackgroundController(harness.chrome, {
    dataUrlThreshold: 10,
    downloadTimeoutMs: 1_000
  });

  const pending = controller.downloadMarkdown('é'.repeat(6), 'unicode.md', false);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.downloadsChanged.size, 1);
  assert.equal(harness.calls.runtimeMessages.some((message) => message.type === 'page-to-md-create-blob'), true);
  harness.downloadsChanged.emit({ id: 7, state: { current: 'complete' } });
  const result = await pending;
  assert.equal(result.transport, 'blob-url');
});

test('does not let a delayed busy badge overwrite the success badge', async () => {
  const badgeBackground = deferred();
  const harness = createChromeHarness({ badgeBackgroundDeferred: badgeBackground });
  harness.chrome.tabs.sendMessage = async () => ({
    ok: true,
    result: { markdown: '# Complete\n', meta: { title: 'Complete' } }
  });
  const controller = createBackgroundController(harness.chrome, { badgeDurationMs: 0 });

  const pending = controller.captureAndDownload(
    { id: 44, url: 'https://example.test/complete' },
    'auto'
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.calls.downloads, 0, 'capture must wait until the busy badge update settles');
  badgeBackground.resolve();
  await pending;

  assert.deepEqual(harness.calls.badgeText, ['…', 'MD']);
});

test('a previous badge-clear timer cannot erase a newer busy state', async () => {
  const harness = createChromeHarness();
  const secondExtraction = deferred();
  let attempt = 0;
  harness.chrome.tabs.sendMessage = async () => {
    attempt += 1;
    if (attempt === 1) {
      return { ok: true, result: { markdown: '# First\n', meta: { title: 'First' } } };
    }
    return secondExtraction.promise;
  };
  const controller = createBackgroundController(harness.chrome, { badgeDurationMs: 20 });
  const tab = { id: 55, url: 'https://example.test/repeat' };

  await controller.captureAndDownload(tab, 'auto');
  const second = controller.captureAndDownload(tab, 'auto');
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.equal(harness.calls.badgeText.at(-1), '…');
  secondExtraction.resolve({
    ok: true,
    result: { markdown: '# Second\n', meta: { title: 'Second' } }
  });
  await second;
});
