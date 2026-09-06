import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundController } from '../src/background.js';
const tab = { id: 17, url: 'https://example.test/article' };
function event() { let handler; return { addListener(value) { handler = value; }, emit(...args) { return handler(...args); } }; }
function harness() {
  const injections = [], messages = [], downloads = [];
  const chrome = {
    runtime: { onInstalled: event(), onStartup: event(), onMessage: event() },
    commands: { onCommand: event() }, contextMenus: { onClicked: event() },
    action: { onClicked: event(), setBadgeBackgroundColor: async () => {}, setBadgeText: async () => {} },
    storage: { sync: { get: async () => ({}), set: async () => {} }, local: { get: async () => ({}), set: async () => {} } },
    scripting: { executeScript: async (request) => { injections.push(request); } },
    tabs: { sendMessage: async (tabId, message, options) => {
      messages.push({ tabId, message, options });
      return { ok: true, result: { markdown: `Selected frame ${options?.frameId ?? 'broadcast'}`, meta: { title: 'Selection' } } };
    } },
    downloads: { download: async (request) => { downloads.push(request); return 9; } },
  };
  const controller = createBackgroundController(chrome, { badgeDurationMs: 0 }); controller.install();
  function click(menu = 'selection', frameId = 7) {
    chrome.contextMenus.onClicked.emit({ menuItemId: 'page-to-md-download-' + menu, frameId }, tab);
    return controller.activeCaptures.get(tab.id);
  }
  return { chrome, controller, injections, messages, downloads, click };
}
test('selection menu targets the clicked iframe for injection and messaging', async () => {
  const env = harness(); await env.click();
  assert.deepEqual(env.injections[0].target, { tabId: tab.id, frameIds: [7] });
  assert.deepEqual(env.messages[0].options, { frameId: 7 });
  assert.equal(env.messages[0].message.payload.mode, 'selection');
  assert.match(decodeURIComponent(env.downloads[0].url), /Selected frame 7$/);
});
test('top-frame selection is explicitly addressed, not broadcast to installed frame scripts', async () => {
  const env = harness(); await env.click('selection', 0);
  assert.deepEqual(env.messages[0].options, { frameId: 0 });
});
test('toolbar capture keeps targeting the top frame', async () => {
  const env = harness(); await env.controller.captureAndDownload(tab, 'action');
  assert.deepEqual(env.injections[0].target, { tabId: tab.id, frameIds: [0] });
  assert.deepEqual(env.messages[0].options, { frameId: 0 });
});
test('main-content and automatic context-menu exports retain top-frame behavior', async () => {
  for (const menu of ['page', 'auto']) {
    const env = harness(); await env.click(menu, 7);
    assert.deepEqual(env.messages[0].options, { frameId: 0 });
  }
});
test('missing or invalid frame IDs default safely to the top frame', async () => {
  for (const frameId of [undefined, null, -1, 1.5, '7']) {
    const env = harness(); await env.controller.captureAndDownload(tab, 'selection', frameId);
    assert.deepEqual(env.messages[0].options, { frameId: 0 });
  }
});
test('a transient messaging retry preserves frame and logical request identity', async () => {
  const env = harness(); const send = env.chrome.tabs.sendMessage; let attempts = 0;
  env.chrome.tabs.sendMessage = async (...args) => {
    const result = await send(...args);
    if (++attempts === 1) throw new Error('Receiving end does not exist');
    return result;
  };
  await env.click('selection', 12);
  assert.equal(env.messages.length, 2);
  assert.ok(env.messages.every(({ options }) => options.frameId === 12));
  assert.equal(env.messages[0].message.requestId, env.messages[1].message.requestId);
  assert.equal(env.downloads.length, 1);
});
test('permission denial never falls back to exporting the wrong frame', async () => {
  const env = harness(); const denied = new Error('Permission denied');
  env.chrome.scripting.executeScript = async (request) => { env.injections.push(request); throw denied; };
  await assert.rejects(env.click('selection', 21), (error) => error === denied);
  assert.deepEqual(env.injections[0].target, { tabId: tab.id, frameIds: [21] });
  assert.equal(env.messages.length, 0); assert.equal(env.downloads.length, 0);
  assert.equal(env.controller.activeCaptures.size, 0);
});
test('per-tab deduplication is retained for simultaneous selection requests', async () => {
  const env = harness();
  const first = env.controller.captureAndDownload(tab, 'selection', 7);
  assert.equal(env.controller.captureAndDownload(tab, 'selection', 7), first);
  await first; assert.equal(env.downloads.length, 1);
});
