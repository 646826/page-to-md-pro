import {
  buildFilename,
  codedError,
  isSupportedTabUrl,
  isTransientCaptureError,
  toErrorInfo,
  withTimeout
} from './shared.js';
import { ensureDefaultOptions, getOptions } from './storage.js';

const MENU_IDS = Object.freeze({
  page: 'page-to-md-download-page',
  selection: 'page-to-md-download-selection',
  auto: 'page-to-md-download-auto',
  options: 'page-to-md-open-options'
});

const DEFAULT_RUNTIME_OPTIONS = Object.freeze({
  captureTimeoutMs: 20_000,
  blobMessageTimeoutMs: 15_000,
  downloadTimeoutMs: 120_000,
  dataUrlThreshold: 700_000,
  badgeDurationMs: 1_800
});

export function createBackgroundController(chromeApi, runtimeOverrides = {}) {
  if (!chromeApi) throw new TypeError('A Chrome API object is required.');

  const runtimeOptions = { ...DEFAULT_RUNTIME_OPTIONS, ...runtimeOverrides };
  const activeCaptures = new Map();
  const badgeClearTimers = new Map();
  let creatingOffscreen = null;

  function install() {
    chromeApi.runtime.onInstalled.addListener(() => {
      void Promise.all([ensureDefaultOptions(chromeApi.storage), createContextMenus()]).catch(logFailure);
    });

    chromeApi.runtime.onStartup.addListener(() => {
      void createContextMenus().catch(logFailure);
    });

    chromeApi.action.onClicked.addListener((tab) => {
      void captureAndDownload(tab, 'action').catch(() => {});
    });

    chromeApi.commands.onCommand.addListener((command) => {
      void handleCommand(command).catch(logFailure);
    });

    chromeApi.contextMenus.onClicked.addListener((info, tab) => {
      void handleContextMenu(info, tab).catch(logFailure);
    });

    chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== 'page-to-md-log') return false;
      console.debug('[Page to Markdown Pro]', message.payload || '');
      sendResponse?.({ ok: true });
      return false;
    });
  }

  function captureAndDownload(tab, requestedMode, frameId = 0) {
    if (!tab?.id) return Promise.reject(codedError('NO_ACTIVE_TAB', 'No active browser tab was found.'));

    const existing = activeCaptures.get(tab.id);
    if (existing) return existing;

    const targetFrameId = Number.isInteger(frameId) && frameId >= 0 ? frameId : 0;
    const operation = runCapture(tab, requestedMode, targetFrameId);
    activeCaptures.set(tab.id, operation);
    const cleanup = () => {
      if (activeCaptures.get(tab.id) === operation) activeCaptures.delete(tab.id);
    };
    operation.then(cleanup, cleanup);
    return operation;
  }

  async function runCapture(tab, requestedMode, frameId) {
    if (!isSupportedTabUrl(tab.url)) {
      await flashBadge(tab.id, 'ERR', '#B42318');
      throw codedError('UNSUPPORTED_URL', `This page cannot be exported: ${tab.url || 'unknown URL'}`);
    }

    await flashBadge(tab.id, '…', '#175CD3');

    try {
      const options = await getOptions(chromeApi.storage);
      const mode = requestedMode === 'action' ? options.actionMode : requestedMode;
      const response = await extractWithRetry(tab.id, { mode, options }, frameId);

      if (!response?.ok || !response.result || typeof response.result.markdown !== 'string') {
        const remoteError = response?.error;
        const code = typeof remoteError?.code === 'string' ? remoteError.code : 'EXTRACTION_FAILED';
        const message = typeof remoteError === 'string'
          ? remoteError
          : remoteError?.message || 'The page did not return valid Markdown.';
        throw codedError(code, message);
      }

      const filename = buildFilename(response.result, options);
      const download = await downloadMarkdown(response.result.markdown, filename, options.saveAs);
      await flashBadge(tab.id, 'MD', '#117A37');
      return { filename, ...download, meta: response.result.meta || {} };
    } catch (error) {
      console.error('Page to Markdown Pro failed:', toErrorInfo(error, 'CAPTURE_FAILED'));
      await flashBadge(tab.id, 'ERR', '#B42318');
      throw error;
    }
  }

  async function extractWithRetry(tabId, payload, frameId) {
    let lastError;
    const requestId = randomId();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // Bound injection separately so a late Chrome response cannot resume
        // this operation and send a stale extraction request after timeout.
        await withTimeout(
          injectContent(tabId, frameId),
          runtimeOptions.captureTimeoutMs,
          'CAPTURE_TIMEOUT',
          'The page took too long to initialize the Markdown exporter.'
        );
        return await withTimeout(
          chromeApi.tabs.sendMessage(tabId, {
            type: 'page-to-md-extract',
            requestId,
            payload
          }, { frameId }),
          runtimeOptions.captureTimeoutMs,
          'CAPTURE_TIMEOUT',
          'The page took too long to produce Markdown.'
        );
      } catch (error) {
        lastError = error;
        if (attempt === 1 || !isTransientCaptureError(error)) throw error;
        await delay(40);
      }
    }
    throw lastError || codedError('EXTRACTION_FAILED', 'Could not extract this page.');
  }

  async function injectContent(tabId, frameId) {
    await chromeApi.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['lib/Readability.js', 'src/content.js']
    });
  }

  async function downloadMarkdown(markdown, filename, saveAs) {
    const mime = 'text/markdown;charset=utf-8';
    const body = typeof markdown === 'string' ? markdown : String(markdown || '');

    const bodyBytes = new TextEncoder().encode(body).byteLength;
    if (bodyBytes < runtimeOptions.dataUrlThreshold) {
      const downloadId = await chromeApi.downloads.download({
        url: `data:${mime},${encodeURIComponent(body)}`,
        filename,
        saveAs: Boolean(saveAs),
        conflictAction: 'uniquify'
      });
      if (!Number.isInteger(downloadId)) {
        throw codedError('DOWNLOAD_START_FAILED', 'Chrome did not return a download identifier.');
      }
      return { downloadId, transport: 'data-url' };
    }

    const blobUrl = await createBlobUrl(body, mime);
    const observer = createDownloadObserver(runtimeOptions.downloadTimeoutMs);
    let downloadId;
    try {
      downloadId = await chromeApi.downloads.download({
        url: blobUrl,
        filename,
        saveAs: Boolean(saveAs),
        conflictAction: 'uniquify'
      });
      if (!Number.isInteger(downloadId)) {
        throw codedError('DOWNLOAD_START_FAILED', 'Chrome did not return a download identifier.');
      }
      await observer.waitFor(downloadId);
      return { downloadId, transport: 'blob-url' };
    } finally {
      observer.close();
      await revokeBlobUrl(blobUrl).catch((error) => {
        console.warn('Could not revoke Markdown Blob URL:', toErrorInfo(error, 'BLOB_REVOKE_FAILED'));
      });
    }
  }

  function createDownloadObserver(timeoutMs) {
    const buffered = new Map();
    const effectiveTimeoutMs = Math.max(
      1,
      Number(timeoutMs) || DEFAULT_RUNTIME_OPTIONS.downloadTimeoutMs
    );
    let targetId = null;
    let settle = null;
    let timer = null;
    let closed = false;

    const promise = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });

    const listener = (delta) => {
      if (!Number.isInteger(delta?.id) || !delta.state?.current) return;
      if (targetId === null) {
        buffered.set(delta.id, delta);
        return;
      }
      if (delta.id === targetId) processDelta(delta);
    };

    chromeApi.downloads.onChanged.addListener(listener);

    function processDelta(delta) {
      if (delta.state.current === 'complete') {
        settle.resolve({ state: 'complete' });
      } else if (delta.state.current === 'interrupted') {
        const reason = delta.error?.current ? ` (${delta.error.current})` : '';
        settle.reject(codedError('DOWNLOAD_INTERRUPTED', `The Markdown download was interrupted${reason}.`));
      }
    }

    return {
      async waitFor(downloadId) {
        targetId = downloadId;
        if (timer === null) {
          timer = setTimeout(() => {
            if (!closed) {
              settle.reject(codedError(
                'DOWNLOAD_TIMEOUT',
                'The Markdown download did not complete before the timeout.'
              ));
            }
          }, effectiveTimeoutMs);
        }
        const earlier = buffered.get(downloadId);
        if (earlier) {
          buffered.delete(downloadId);
          processDelta(earlier);
        }
        return promise;
      },
      close() {
        if (closed) return;
        closed = true;
        if (timer !== null) clearTimeout(timer);
        chromeApi.downloads.onChanged.removeListener(listener);
      }
    };
  }

  async function createBlobUrl(text, mime) {
    await ensureOffscreenDocument();
    const response = await withTimeout(
      chromeApi.runtime.sendMessage({
        type: 'page-to-md-create-blob',
        id: randomId(),
        mime,
        text
      }),
      runtimeOptions.blobMessageTimeoutMs,
      'BLOB_CREATE_TIMEOUT',
      'Timed out while preparing the Markdown download.'
    );

    if (!response?.ok || typeof response.url !== 'string' || !response.url.startsWith('blob:')) {
      throw codedError(
        response?.error?.code || 'BLOB_CREATE_FAILED',
        response?.error?.message || 'Could not create a Blob URL for the Markdown file.'
      );
    }
    return response.url;
  }

  async function revokeBlobUrl(url) {
    await ensureOffscreenDocument();
    const response = await withTimeout(
      chromeApi.runtime.sendMessage({ type: 'page-to-md-revoke-blob', url }),
      runtimeOptions.blobMessageTimeoutMs,
      'BLOB_REVOKE_TIMEOUT',
      'Timed out while cleaning up the Markdown download.'
    );
    if (response?.ok === false) {
      throw codedError(response.error?.code || 'BLOB_REVOKE_FAILED', response.error?.message || 'Could not revoke Blob URL.');
    }
  }

  async function ensureOffscreenDocument() {
    const path = 'src/offscreen.html';
    if (await hasOffscreenDocument(path)) return;
    if (creatingOffscreen) return creatingOffscreen;

    creatingOffscreen = chromeApi.offscreen.createDocument({
      url: path,
      reasons: ['BLOBS'],
      justification: 'Create Blob URLs for large local Markdown downloads.'
    });
    try {
      await creatingOffscreen;
    } finally {
      creatingOffscreen = null;
    }
  }

  async function hasOffscreenDocument(path) {
    const offscreenUrl = chromeApi.runtime.getURL(path);
    if (typeof chromeApi.runtime.getContexts === 'function') {
      const contexts = await chromeApi.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });
      return contexts.length > 0;
    }

    if (globalThis.clients?.matchAll) {
      const matchedClients = await globalThis.clients.matchAll();
      return matchedClients.some((client) => client.url === offscreenUrl);
    }
    return false;
  }

  async function createContextMenus() {
    await chromeApi.contextMenus.removeAll().catch(() => {});
    chromeApi.contextMenus.create({
      id: MENU_IDS.auto,
      title: 'Download page as Markdown',
      contexts: ['action', 'page']
    });
    chromeApi.contextMenus.create({
      id: MENU_IDS.page,
      title: 'Download main content as Markdown',
      contexts: ['page']
    });
    chromeApi.contextMenus.create({
      id: MENU_IDS.selection,
      title: 'Download selection as Markdown',
      contexts: ['selection', 'page']
    });
    chromeApi.contextMenus.create({
      id: MENU_IDS.options,
      title: 'Options',
      contexts: ['action']
    });
  }

  async function handleCommand(command, suppliedTab) {
    let tab = suppliedTab;
    if (!tab?.id) {
      [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    }
    if (!tab?.id) return;

    if (command === 'download-page-markdown') {
      await captureAndDownload(tab, 'auto');
    } else if (command === 'download-selection-markdown') {
      await captureAndDownload(tab, 'selection');
    }
  }

  async function handleContextMenu(info, tab) {
    if (!tab?.id) return;
    if (info.menuItemId === MENU_IDS.options) {
      await chromeApi.runtime.openOptionsPage();
      return;
    }

    const mode = info.menuItemId === MENU_IDS.page
      ? 'main'
      : info.menuItemId === MENU_IDS.selection
        ? 'selection'
        : info.menuItemId === MENU_IDS.auto
          ? 'auto'
          : null;
    // Selection belongs to the clicked frame, not necessarily the main page.
    // Other menu actions retain their existing top-frame scope.
    if (mode) await captureAndDownload(tab, mode, mode === 'selection' ? info.frameId : 0);
  }

  async function flashBadge(tabId, text, color) {
    const previousTimer = badgeClearTimers.get(tabId);
    if (previousTimer) {
      clearTimeout(previousTimer);
      badgeClearTimers.delete(tabId);
    }

    try {
      await chromeApi.action.setBadgeBackgroundColor({ tabId, color });
      await chromeApi.action.setBadgeText({ tabId, text });
      if (runtimeOptions.badgeDurationMs > 0 && text !== '…') {
        const timer = setTimeout(() => {
          if (badgeClearTimers.get(tabId) !== timer) return;
          badgeClearTimers.delete(tabId);
          chromeApi.action.setBadgeText({ tabId, text: '' }).catch(() => {});
        }, runtimeOptions.badgeDurationMs);
        badgeClearTimers.set(tabId, timer);
      }
    } catch {
      // Badge feedback is non-critical.
    }
  }

  function logFailure(error) {
    console.error('Page to Markdown Pro background error:', toErrorInfo(error));
  }

  return {
    install,
    captureAndDownload,
    downloadMarkdown,
    createContextMenus,
    activeCaptures
  };
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (globalThis.chrome?.runtime?.onInstalled) {
  createBackgroundController(globalThis.chrome).install();
}
