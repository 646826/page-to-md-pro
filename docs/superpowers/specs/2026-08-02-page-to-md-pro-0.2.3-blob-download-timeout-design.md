# Page to Markdown Pro 0.2.3 Blob Download Timeout Design

## Context

Large Markdown exports use an offscreen Blob URL and wait for `chrome.downloads.onChanged` to report a terminal state. The current observer starts its timer before `chrome.downloads.download()` returns and resolves successfully when the timer expires.

This creates two incorrect behaviors:

1. Time spent in Chrome's `saveAs` dialog consumes the transfer timeout even though no download ID exists yet.
2. If no terminal event arrives before the timeout, the operation is reported as successful and the Blob URL is revoked.

The second behavior is especially dangerous because callers receive a success result even though completion was never confirmed.

## Goal

Make large-download completion reporting truthful and deterministic:

- start the terminal-state timeout only after Chrome returns a download ID;
- reject timed-out downloads with stable code `DOWNLOAD_TIMEOUT`;
- preserve the existing cleanup guarantee for listeners and Blob URLs;
- retain completion and interruption behavior unchanged.

## Design

`createDownloadObserver()` will continue registering its event listener before `chrome.downloads.download()` starts so very fast terminal events can be buffered. It will no longer start a timer during construction.

`waitFor(downloadId)` will:

1. set the target download ID;
2. start the timeout exactly once;
3. process any buffered terminal event for that ID;
4. return the shared terminal-state promise.

The timeout will reject with:

```js
codedError(
  'DOWNLOAD_TIMEOUT',
  'The Markdown download did not complete before the timeout.'
)
```

The existing `finally` block in `downloadMarkdown()` will still close the observer and revoke the Blob URL for success, interruption, start failure, and timeout.

## Regression Coverage

Two Node tests will exercise observable behavior through the real background controller:

1. A delayed `downloads.download()` result must not consume the terminal-state timeout. After the ID is returned, the operation must remain pending until a completion event arrives.
2. A started Blob download with no terminal event must reject with `DOWNLOAD_TIMEOUT`, revoke the Blob URL once, and remove the `onChanged` listener.

## Compatibility and Security

- No permissions, host permissions, content scripts, runtime dependencies, telemetry, or remote code are added.
- Minimum Chrome version remains 109.
- The release flow remains Chrome Web Store `UPLOAD_ONLY`.
