# Page to Markdown Pro

Page to Markdown Pro is a local-first Chromium extension that exports the active page or highlighted selection as a clean Markdown file.

Version **0.2.2** improves ordered-list fidelity: it preserves zero and negative starts, reversed numbering, item-level counter resets, and marker-aware nested indentation, with browser-level regression coverage and no new host permissions, telemetry, remote code, or runtime dependencies.

## Highlights

- Export the **best content root**, **main content**, **full page**, or **current selection**.
- One-click toolbar action, context-menu actions, and keyboard shortcuts.
- Readability plus a semantic fallback for articles, documentation, wikis, and code-heavy pages.
- YAML front matter from regular metadata and Article-like JSON-LD.
- Code fences with language detection, faithful ordered lists, nested lists, callouts, details, math, figures, and smart tables.
- GitHub-style task lists and content from **open Shadow DOM** and slots.
- Lazy/placeholder-image normalization, image-only selection export, and meaningful video/audio source links.
- Tracking-parameter removal and active-protocol filtering.
- Per-tab and per-request capture deduplication, bounded retries, ordered status badges, and timeout errors.
- Large downloads through an offscreen Blob URL that remains alive until Chrome reports completion or interruption.
- Local processing only. Page data is not sent to developer-controlled servers.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the repository root.
5. Pin the extension.

To export local `file://` pages, enable **Allow access to file URLs** in the extension details.

## Use

- Click the toolbar icon to use the configured automatic mode.
- Right-click a page to export the best content root or main content.
- Right-click a selection to export only that selection.
- Press `Alt+Shift+D` to export the page.
- Press `Alt+Shift+S` to export the selection.

The options page controls front matter, source links, images, tracking parameters, table behavior, filenames, and the toolbar mode.

## How extraction works

1. The Manifest V3 service worker accepts an explicit user action and ensures one active capture per tab.
2. Local `Readability.js` and `src/content.js` are injected into the active tab through `activeTab` and `scripting`.
3. The content script waits for a short, bounded DOM quiet period and collects standard and JSON-LD metadata.
4. It creates a composed DOM snapshot, materializes open shadow roots and slots without hidden light-DOM duplicates, and compares Readability with semantic candidates.
5. The selected clone is normalized and converted with custom Markdown rules.
6. The service worker downloads the result. Large files use an offscreen Blob URL and terminal download-state tracking.

Closed shadow roots, cross-origin frames, canvas-only content, and content a site never renders into the active DOM cannot be extracted generically. After installing an extension update, reload an already-open page to ensure it receives the updated injected extractor.

## Architecture

```text
manifest.json             Manifest V3 metadata and minimal permissions
src/background.js         Event handling, capture orchestration, downloads
src/shared.js             Pure option, URL, timeout, and filename utilities
src/storage.js            Sync storage with local fallback
src/content.js            DOM snapshot, extraction, sanitization, Markdown rendering
src/offscreen.*           Large-download Blob URL lifecycle
src/options.*             Extension preferences
lib/Readability.js        Bundled Mozilla Readability
scripts/                  Validation, packaging, and Chrome Web Store upload
tests/                    Node unit tests and Playwright browser fixtures
.github/workflows/        CI and upload-only release automation
```

## Develop

Required: Node.js 24 or newer.

```bash
npm ci
npx playwright install chromium
npm test
```

Useful commands:

```bash
npm run check             # syntax-check project JavaScript
npm run test:unit         # node:test suites
npm run test:fixtures     # Playwright Chromium fixtures
npm run build:zip         # deterministic Chrome Web Store ZIP
npm run validate:package  # manifest, permissions, files, and ZIP allowlist
```

The suite currently includes 36 Node tests and eleven Chromium fixtures covering articles, tables, math, HTML line breaks, ordered-list counters and indentation, nested inline-flow code blocks, Shadow DOM, slots, task lists, JSON-LD, delayed mutations, large DOMs and selections, base-URL resolution, lazy/placeholder images, selection-only media, literal HTML, unsafe protocols, deterministic packaging, and published-release evidence.

## Release model

A merged version change on `main` triggers the release workflow. For a version without an existing `v<version>` tag, it:

1. runs the complete verification suite;
2. builds and validates `page-to-md-pro.zip`;
3. uploads the ZIP to the Chrome Web Store with `UPLOAD_ONLY`;
4. creates the GitHub tag and Release only after the store upload succeeds.

`UPLOAD_ONLY` does **not** submit the extension for publication. Manual workflow dispatch still supports upload-only, immediate submission, and staged submission for deliberate operator use.

See [the release checklist](docs/release-checklist.md) and [pipeline documentation](docs/chrome-web-store-pipeline.md).

## Privacy and permissions

The extension requests only:

- `activeTab` — access the current page after a user action;
- `scripting` — inject local extraction code;
- `downloads` — save Markdown locally;
- `contextMenus` — expose page and selection actions;
- `offscreen` — create Blob URLs for large downloads;
- `storage` — save preferences in sync storage with a local fallback.

It has no host permissions, static content scripts, analytics, accounts, cloud processing, or remote executable code.

## Support

- [Support guide](docs/support.md)
- [Privacy policy](docs/privacy-policy.md)
- [Chrome Web Store copy](docs/chrome-web-store-listing.md)
- [Changelog](CHANGELOG.md)

## License

MIT. Bundled [Mozilla Readability](https://github.com/mozilla/readability) is licensed under Apache 2.0.
