# Changelog

All notable changes to Page to Markdown Pro are documented here.

## [0.2.1] - 2026-08-02

### Added

- Browser regression coverage for HTML line breaks and code blocks nested in inline/custom-element flow.
- Dedicated CI execution for the published-release verifier and the new rendering-regression fixture.

### Changed

- Made the published-release test fixture derive its version and tag from `manifest.json`, so future version bumps do not invalidate the verifier test.

### Fixed

- Restored valid `<br>` Markdown output instead of emitting the malformed `<br-` fragment.
- Removed a stray `l` character before code blocks encountered in inline flow.

## [0.2.0] - 2026-07-19

### Added

- Open Shadow DOM and slot materialization for modern web components.
- GitHub-style task-list markers.
- Article-like JSON-LD metadata fallbacks.
- Meaningful video and audio source links.
- Node unit suites for shared, storage, background, offscreen, and package behavior.
- Browser fixtures for delayed mutations, modern components, selection-only media, large DOMs, and unsafe URL protocols.
- Deterministic runtime-file allowlist validation for the store ZIP.
- Automated GitHub Release creation after a successful Chrome Web Store upload.

### Changed

- Converted the Manifest V3 background service worker to a native ES module.
- Updated development and CI coverage to Node.js 24, npm 11.17.0, Playwright 1.61.1, and current Node 24-based GitHub Actions.
- Normalized and clamped all stored preferences before use.
- Added sync-storage fallback to local extension storage.
- Improved generic root scoring, placeholder/lazy-image handling, media normalization, composed Shadow DOM snapshots, and metadata collection.
- Release automation on `main` now uses `UPLOAD_ONLY` and is idempotent by version tag.

### Fixed

- Prevented duplicate extraction and download operations from repeated actions on the same tab, including retry responses with the same request ID.
- Added bounded extraction timeouts and one retry for transient extension messaging failures.
- Kept large-download Blob URLs alive until Chrome reports completion or interruption.
- Removed active protocols and event-handler attributes from Markdown links and HTML table fallback.
- Added Windows reserved-name handling and Unicode-safe filename truncation.
- Counted large Markdown payloads by UTF-8 bytes before choosing the download transport.
- Preferred readable sync settings over stale local fallback values.
- Prevented nested task-list state from leaking to parent list items, removed duplicate slot content, and excluded light-DOM nodes hidden by open Shadow DOM.
- Kept ordinary large DOMs within the main extraction budget instead of charging them against the smaller Shadow DOM budget.
- Preserved image-only selections, ignored placeholder image sources, removed noscript/UI noise from tables, and escaped literal HTML text in Markdown.
- Prevented delayed badge updates and stale badge-clear timers from overwriting a newer capture state.
- Made release ZIP bytes reproducible with a fixed file order, permissions, and timestamps.
- Enforced the Chrome manifest description limit during tests and package validation.

### Security

- Kept the existing minimal permission set and added no host permissions.
- Reduced page-context error responses to stable codes and messages without arbitrary stack traces.
- Continued to process all page content locally without telemetry or remote executable code.

## [0.1.0] - 2026-03-12

- Initial public release.
