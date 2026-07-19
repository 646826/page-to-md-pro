export function createOffscreenController(chromeApi, environment = globalThis) {
  if (!chromeApi?.runtime) throw new TypeError('A Chrome runtime API is required.');
  const BlobCtor = environment.Blob;
  const URLApi = environment.URL;
  if (typeof BlobCtor !== 'function' || !URLApi?.createObjectURL || !URLApi?.revokeObjectURL) {
    throw new TypeError('Blob and object URL APIs are required.');
  }

  const blobUrls = new Set();

  function handleMessage(message, sender, sendResponse) {
    if (!message?.type) return false;
    if (sender?.id !== chromeApi.runtime.id) {
      sendResponse(errorResponse('UNTRUSTED_SENDER', 'Only this extension may use the offscreen download document.'));
      return false;
    }

    try {
      if (message.type === 'page-to-md-create-blob') {
        if (typeof message.id !== 'string' || !message.id.trim() || typeof message.text !== 'string') {
          sendResponse(errorResponse('INVALID_BLOB_REQUEST', 'Blob requests require a request ID and text payload.'));
          return false;
        }
        const mime = typeof message.mime === 'string' && message.mime.length <= 200
          ? message.mime
          : 'text/plain;charset=utf-8';
        const blob = new BlobCtor([message.text], { type: mime });
        const url = URLApi.createObjectURL(blob);
        blobUrls.add(url);
        sendResponse({ ok: true, id: message.id, url });
        return false;
      }

      if (message.type === 'page-to-md-revoke-blob') {
        if (typeof message.url !== 'string' || !blobUrls.has(message.url)) {
          sendResponse(errorResponse('UNKNOWN_BLOB_URL', 'The Blob URL is not managed by this extension context.'));
          return false;
        }
        URLApi.revokeObjectURL(message.url);
        blobUrls.delete(message.url);
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === 'page-to-md-revoke-all-blobs') {
        const revoked = revokeAll();
        sendResponse({ ok: true, revoked });
        return false;
      }
    } catch (error) {
      sendResponse(errorResponse('OFFSCREEN_OPERATION_FAILED', error?.message || 'The offscreen operation failed.'));
      return false;
    }

    return false;
  }

  function revokeAll() {
    let revoked = 0;
    for (const url of blobUrls) {
      try {
        URLApi.revokeObjectURL(url);
        revoked += 1;
      } finally {
        blobUrls.delete(url);
      }
    }
    return revoked;
  }

  function install() {
    chromeApi.runtime.onMessage.addListener(handleMessage);
    globalThis.addEventListener?.('pagehide', revokeAll, { once: true });
  }

  return { handleMessage, install, revokeAll, blobUrls };
}

function errorResponse(code, message) {
  return { ok: false, error: { code, message } };
}

if (globalThis.chrome?.runtime?.onMessage) {
  createOffscreenController(globalThis.chrome).install();
}
