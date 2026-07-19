# Page to Markdown Pro 0.2.0 Modernization Design

## Status

Approved for implementation by the repository owner on 2026-07-19. The release target is option B: publish a GitHub Release and upload the package to the Chrome Web Store without submitting it for publication.

## Goal

Make the extension materially more reliable on generic modern web pages while preserving its local-only privacy model, small permission set, Manifest V3 architecture, and one-click workflow.

## Current baseline

The extension already uses Manifest V3, an event-driven service worker, `chrome.scripting`, an offscreen document for large Blob downloads, Mozilla Readability, custom semantic extraction, and Playwright fixtures. The main weaknesses are concentrated in four areas:

1. The background worker has no per-tab concurrency control, bounded extraction timeout, or transient retry strategy.
2. Blob URLs are revoked immediately after `chrome.downloads.download()` resolves, before the browser confirms that the download has completed.
3. Extraction waits for only two animation frames and does not flatten open shadow roots, preserve task-list checkboxes, or use structured metadata as a fallback.
4. Tests are mostly substring checks and do not cover service-worker utilities, package consistency, security-sensitive URL handling, or modern component fixtures.

## Considered approaches

### A. Incremental modular hardening — selected

Keep the existing no-runtime-dependency extension and split only the pieces that need independent tests. Convert the background service worker to a native ES module, add a pure utility module, keep the content script as a classic injected script, and improve extraction in place.

Advantages: smallest release risk, no new runtime dependencies, no remote code, straightforward Chrome Web Store review, and compatibility with the existing packaging model.

Trade-off: the content renderer remains plain JavaScript rather than a fully typed package.

### B. Full TypeScript and bundler migration

Move every extension context to TypeScript and bundle with esbuild or a comparable tool.

Advantages: stronger editor diagnostics and explicit module boundaries.

Trade-off: introduces generated artifacts, source/build synchronization, additional dependencies, more CSP and source-map considerations, and a substantially larger regression surface. This is not justified for the 0.2.0 stability release.

### C. Replace the renderer with a third-party HTML-to-Markdown stack

Use a generic conversion library and a plugin ecosystem for tables, task lists, and code blocks.

Advantages: less custom rendering code.

Trade-off: generic libraries do not solve root selection, lazy content, metadata, shadow DOM, or page-specific noise. Replacing working rules would create compatibility regressions and increase supply-chain exposure.

## Architecture

### Background service worker

`manifest.json` declares `src/background.js` as a module service worker. `src/background.js` owns Chrome event listeners and orchestration. `src/background-utils.js` contains pure functions for option normalization, supported-URL checks, filename generation, error classification, and bounded retry decisions.

Each tab may have at most one active extraction. Repeated triggers for the same tab reuse the active promise rather than injecting duplicate scripts or starting multiple downloads. Extraction communication is bounded by a timeout and may be retried once only for transient messaging/context errors. Unsupported pages fail immediately.

Badge states are explicit:

- `…` while capture is running;
- `MD` after a completed download request;
- `ERR` after a terminal failure.

### Download lifecycle

Small files continue to use data URLs. Large files use an offscreen Blob URL. The Blob URL remains valid until one of these events occurs:

- `chrome.downloads.onChanged` reports `complete`;
- `chrome.downloads.onChanged` reports `interrupted`;
- a bounded cleanup timeout expires.

The offscreen document validates request IDs and message payloads, returns structured responses, tracks object URLs, and can revoke all remaining URLs when requested. The service worker cleans listener and timer state in every success and failure path.

### Extraction pipeline

The content script remains self-installing and idempotent. A request performs these bounded stages:

1. Wait for DOM readiness and a short quiet period, capped by a fixed maximum.
2. Collect metadata from standard meta tags and JSON-LD Article-like objects.
3. Clone the requested selection or construct Readability and semantic candidates.
4. Materialize open shadow roots and assigned slot content into the clone when they contain meaningful text.
5. Normalize lazy images, links, media, math, details, task-list inputs, and relative URLs.
6. Remove noise with conservative rules and a node-processing budget.
7. Render Markdown and normalize whitespace without modifying fenced code contents.

The renderer preserves the current output contract and adds generic support for:

- GitHub-style task list markers;
- open shadow-root content and slots;
- JSON-LD title, author, description, publication time, and canonical URL fallbacks;
- `video` and `audio` source links when meaningful;
- safe URL protocol filtering in Markdown links and HTML table fallback;
- `srcset` values containing data URLs or commas through a conservative candidate parser;
- bounded traversal on very large or hostile DOMs.

No page content is sent over the network. No remote code is introduced.

### Options and compatibility

User-facing behavior remains backwards compatible. Existing stored options are normalized and clamped before use. Storage reads and writes first use `chrome.storage.sync` and fall back to `chrome.storage.local` when sync storage is unavailable or rejects an operation.

The extension is officially tested against Chromium. Chrome remains the release target; Edge, Brave, and Vivaldi are treated as compatible Chromium browsers without browser-specific packages or claims beyond automated Chromium coverage.

## Security and privacy

The extension keeps `activeTab`, `contextMenus`, `downloads`, `offscreen`, `scripting`, and `storage` only. It does not add host permissions.

Allowed output URL protocols are `http:`, `https:`, `mailto:`, `tel:`, and relative fragment links where applicable. `javascript:`, `vbscript:`, `file:`, and unexpected `data:` destinations are emitted as plain text rather than active links. Inline HTML fallback removes event handlers, style/class/data attributes, unsafe URL attributes, and embedded active content.

Error responses exposed across extension contexts contain a stable code and message but not arbitrary stack traces from the page.

## Testing

### Unit tests

Node's built-in `node:test` runner tests pure background utilities without adding a test-framework dependency. Coverage includes option validation, URL support, Windows reserved filenames, Unicode truncation, retry classification, and timeout behavior.

### Browser fixtures

The existing Playwright harness remains, with assertions upgraded to support required and forbidden fragments. New fixtures cover shadow DOM, slots, task lists, JSON-LD metadata, lazy images, unsafe protocols, media, and DOM mutation settling.

### Package validation

A Node validation script verifies:

- `package.json` and `manifest.json` versions match `0.2.0`;
- every manifest-referenced file exists;
- the service worker is declared as a module;
- the extension package contains no remote script references;
- the ZIP allowlist contains only extension runtime files and icons.

### CI

GitHub Actions runs on Node.js 24 LTS, installs the pinned lockfile, installs Playwright Chromium, runs syntax checks, unit tests, fixture tests, package validation, and builds the release ZIP. The ZIP is uploaded as a CI artifact for inspection.

## Release automation

The existing Chrome Web Store workflow keeps its manual modes. On a push to `main`, it reads the manifest version and checks for tag `v<version>`:

- when the tag already exists, automated release/upload steps are skipped;
- when the tag does not exist, tests and packaging run, the ZIP is uploaded to the Chrome Web Store with `UPLOAD_ONLY`, and a GitHub Release plus tag are created from the verified commit.

The GitHub Release is created only after the Chrome Web Store upload succeeds. It contains `page-to-md-pro.zip` and generated release notes. The workflow uses `contents: write` only for the release operation and keeps `id-token: write` for existing Workload Identity Federation authentication.

## Version and documentation

`package.json` and `manifest.json` become `0.2.0`. README, release checklist, store listing, support documentation, and a changelog describe the new reliability behavior and exact release process.

## Non-goals

- Firefox/Safari packaging or polyfills.
- Cloud processing, AI summarization, accounts, telemetry, or analytics.
- A popup, side panel, or new permissions.
- A full TypeScript/bundler migration.
- Perfect extraction of closed shadow roots, cross-origin frames, canvas-only documents, or content that a site never renders into the active DOM.

## Acceptance criteria

1. All old fixtures continue to pass.
2. New modern-web and security fixtures pass.
3. Unit and package-validation tests pass on Node.js 24.
4. Repeated actions on one tab produce one capture/download operation.
5. Large-download Blob URLs are not revoked before completion or interruption.
6. The built ZIP contains version 0.2.0 and only approved runtime files.
7. CI succeeds on the release commit.
8. A `v0.2.0` GitHub Release is created with the ZIP.
9. Chrome Web Store receives the ZIP in upload-only mode; no publish submission is requested.
