const blobUrls = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'page-to-md-create-blob') {
    try {
      const blob = new Blob([message.text || ''], { type: message.mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      blobUrls.add(url);
      chrome.runtime.sendMessage({
        type: 'page-to-md-blob-created',
        id: message.id,
        url
      }).catch(() => {});
      sendResponse({ ok: true });
    } catch (error) {
      chrome.runtime.sendMessage({
        type: 'page-to-md-blob-error',
        id: message.id,
        error: error.message
      }).catch(() => {});
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  }

  if (message.type === 'page-to-md-revoke-blob') {
    try {
      if (message.url && blobUrls.has(message.url)) {
        URL.revokeObjectURL(message.url);
        blobUrls.delete(message.url);
      }
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  }

  return false;
});
