const DEFAULT_OPTIONS = {
  actionMode: 'auto',
  includeFrontMatter: true,
  prependTitleHeadingIfMissing: true,
  includeSourceLink: true,
  includeImages: true,
  stripTrackingParams: true,
  saveAs: false,
  maxFilenameLength: 120,
  prependDateToFilename: false,
  tableMode: 'smart'
};

const MENU_IDS = {
  page: 'page-to-md-download-page',
  selection: 'page-to-md-download-selection',
  auto: 'page-to-md-download-auto',
  options: 'page-to-md-open-options'
};

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultOptions();
  await createContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await createContextMenus();
});

chrome.action.onClicked.addListener(async (tab) => {
  await captureAndDownload(tab, 'action');
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab || !tab.id) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  }
  if (!tab || !tab.id) {
    return;
  }

  if (command === 'download-page-markdown') {
    await captureAndDownload(tab, 'auto');
  } else if (command === 'download-selection-markdown') {
    await captureAndDownload(tab, 'selection');
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  switch (info.menuItemId) {
    case MENU_IDS.page:
      await captureAndDownload(tab, 'main');
      break;
    case MENU_IDS.selection:
      await captureAndDownload(tab, 'selection');
      break;
    case MENU_IDS.auto:
      await captureAndDownload(tab, 'auto');
      break;
    case MENU_IDS.options:
      chrome.runtime.openOptionsPage();
      break;
    default:
      break;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'page-to-md-blob-created' || message.type === 'page-to-md-blob-error') {
    dispatchPendingBlobEvent(message);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'page-to-md-log') {
    console.debug('[Page to Markdown Pro]', message.payload || '');
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function createContextMenus() {
  await chrome.contextMenus.removeAll().catch(() => {});

  chrome.contextMenus.create({
    id: MENU_IDS.auto,
    title: 'Download page as Markdown',
    contexts: ['action', 'page']
  });

  chrome.contextMenus.create({
    id: MENU_IDS.page,
    title: 'Download main content as Markdown',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: MENU_IDS.selection,
    title: 'Download selection as Markdown',
    contexts: ['selection', 'page']
  });

  chrome.contextMenus.create({
    id: MENU_IDS.options,
    title: 'Options',
    contexts: ['action']
  });
}

async function ensureDefaultOptions() {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_OPTIONS));
  const missing = {};

  for (const [key, value] of Object.entries(DEFAULT_OPTIONS)) {
    if (existing[key] === undefined) {
      missing[key] = value;
    }
  }

  if (Object.keys(missing).length > 0) {
    await chrome.storage.sync.set(missing);
  }
}

async function getOptions() {
  await ensureDefaultOptions();
  return chrome.storage.sync.get(DEFAULT_OPTIONS);
}

async function captureAndDownload(tab, requestedMode) {
  if (!tab || !tab.id) {
    return;
  }

  if (!isSupportedTabUrl(tab.url)) {
    await flashBadge(tab.id, 'ERR', '#B42318');
    console.warn('Page to Markdown Pro: unsupported tab URL', tab.url);
    return;
  }

  const options = await getOptions();
  const mode = requestedMode === 'action' ? options.actionMode : requestedMode;

  try {
    await injectContent(tab.id);
    const response = await sendExtractRequest(tab.id, {
      mode,
      options
    });

    if (!response || !response.ok || !response.result) {
      throw new Error(response?.error || 'Extraction failed');
    }

    const result = response.result;
    const filename = buildFilename(result, options);
    await downloadMarkdown(result.markdown, filename, options.saveAs);
    await flashBadge(tab.id, 'MD', '#117A37');
  } catch (error) {
    console.error('Page to Markdown Pro failed:', error);
    await flashBadge(tab.id, 'ERR', '#B42318');
  }
}

function isSupportedTabUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^(https?|file):/i.test(url);
}

async function injectContent(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    files: ['lib/Readability.js', 'src/content.js']
  });
}

async function sendExtractRequest(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: 'page-to-md-extract',
      payload
    });
  } catch (error) {
    throw new Error(`Could not communicate with the page: ${error.message}`);
  }
}

function buildFilename(result, options) {
  const source = result?.meta?.title || result?.meta?.siteName || 'page';
  const title = sanitizeFilename(source, options.maxFilenameLength || DEFAULT_OPTIONS.maxFilenameLength);
  const prefix = options.prependDateToFilename ? getDatePrefix() + '-' : '';
  return `${prefix}${title || 'page'}.md`;
}

function sanitizeFilename(input, maxLength) {
  const value = String(input || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');

  if (!value) return 'page';
  return value.slice(0, Math.max(10, maxLength || 120)).trim();
}

function getDatePrefix() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function downloadMarkdown(markdown, filename, saveAs) {
  const mime = 'text/markdown;charset=utf-8';
  const body = typeof markdown === 'string' ? markdown : String(markdown || '');

  if (body.length < 750_000) {
    const dataUrl = `data:${mime},${encodeURIComponent(body)}`;
    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: Boolean(saveAs),
      conflictAction: 'uniquify'
    });
    return;
  }

  try {
    const blobUrl = await createBlobUrl(body, mime);
    try {
      await chrome.downloads.download({
        url: blobUrl,
        filename,
        saveAs: Boolean(saveAs),
        conflictAction: 'uniquify'
      });
    } finally {
      await revokeBlobUrl(blobUrl).catch(() => {});
    }
  } catch (error) {
    console.warn('Falling back to data URL download:', error);
    const dataUrl = `data:${mime},${encodeURIComponent(body)}`;
    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: Boolean(saveAs),
      conflictAction: 'uniquify'
    });
  }
}

async function flashBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    }, 1800);
  } catch (_) {
    // Ignore badge failures.
  }
}

const pendingBlobRequests = new Map();

function dispatchPendingBlobEvent(message) {
  const pending = pendingBlobRequests.get(message.id);
  if (!pending) return;

  pendingBlobRequests.delete(message.id);
  if (message.type === 'page-to-md-blob-created') {
    pending.resolve(message.url);
  } else {
    pending.reject(new Error(message.error || 'Could not create blob URL'));
  }
}

let creatingOffscreen = null;

async function hasOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);

  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });
    return contexts.length > 0;
  }

  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url.includes(chrome.runtime.id));
}

async function ensureOffscreenDocument() {
  const url = 'src/offscreen.html';
  const alreadyExists = await hasOffscreenDocument(url);
  if (alreadyExists) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url,
    reasons: ['BLOBS'],
    justification: 'Create Blob URLs for large Markdown downloads.'
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function createBlobUrl(text, mime) {
  await ensureOffscreenDocument();
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingBlobRequests.delete(id);
      reject(new Error('Timed out while creating blob URL'));
    }, 15_000);

    pendingBlobRequests.set(id, {
      resolve: (url) => {
        clearTimeout(timeout);
        resolve(url);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    });

    chrome.runtime.sendMessage({
      type: 'page-to-md-create-blob',
      id,
      mime,
      text
    }).catch((error) => {
      clearTimeout(timeout);
      pendingBlobRequests.delete(id);
      reject(error);
    });
  });
}

async function revokeBlobUrl(url) {
  await ensureOffscreenDocument();
  await chrome.runtime.sendMessage({
    type: 'page-to-md-revoke-blob',
    url
  });
}
