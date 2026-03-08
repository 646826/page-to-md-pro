# Page to Markdown Pro

One-click Chrome extension that exports the current page or highlighted selection as a clean Markdown file.

## Features

- Export **current page**, **main content**, or **selected text**.
- Default one-click download from the extension icon.
- Context menu actions for page and selection.
- Keyboard shortcuts:
  - `Alt+Shift+D` — download current page.
  - `Alt+Shift+S` — download selection.
- YAML front matter with page metadata.
- Optional title heading insertion.
- Tracking-parameter stripping from links.
- Lazy-image normalization.
- Callout/admonition conversion to Markdown alerts.
- Smart tables:
  - regular data tables → Markdown table
  - layout tables → flattened readable content
  - complex tables → HTML fallback
- Math preservation (KaTeX / MathJax).
- Large Markdown download fallback through an offscreen Blob document.

## How it works

1. User clicks the action / shortcut / context menu.
2. The service worker injects `Readability.js` + `content.js` into the active tab.
3. The content script chooses a root:
   - current selection
   - Readability output
   - best semantic content container
   - full body fallback
4. The DOM clone is cleaned and normalized.
5. Markdown is generated with custom rules for headings, lists, links, images, callouts, code blocks, tables, and details.
6. The service worker downloads the `.md` file.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `page-to-md-pro` folder.
5. Pin the extension for single-click use.

To work on local `file://` pages, open the extension details and enable **Allow access to file URLs**.

## Project structure

```
manifest.json          Manifest V3 extension manifest
src/background.js      Toolbar click, shortcuts, context menus, downloads
src/content.js         DOM extraction, cleanup, Markdown generation
src/options.*          Options page
src/offscreen.*        Blob URL generation for large downloads
lib/Readability.js     Bundled Mozilla Readability (Apache 2.0)
tests/                 Extraction fixtures and test runner
docs/                  QA, privacy policy, support docs, release checklist
.github/workflows/     GitHub Actions CI
```

## Support and privacy

- Privacy policy: [docs/privacy-policy.md](docs/privacy-policy.md)
- Support: [docs/support.md](docs/support.md)
- Release checklist: [docs/release-checklist.md](docs/release-checklist.md)
- Chrome Web Store listing copy: [docs/chrome-web-store-listing.md](docs/chrome-web-store-listing.md)
- Chrome Web Store pipeline: [docs/chrome-web-store-pipeline.md](docs/chrome-web-store-pipeline.md)

## Develop and test

```bash
npm ci
npm test
```

The fixture suite uses Playwright with Chromium. If Chromium is already installed for Playwright, you can run only the fixtures with `npm run test:fixtures`.

## Build for Chrome Web Store

```bash
npm ci
npm test
npm run build:zip
```

This creates `page-to-md-pro.zip` containing only the files needed for the extension.
Prepared store assets are available in `assets/store/`.

## Known limitations

- Highly interactive web apps may hide content behind virtualized rendering.
- Custom math widgets may fall back to visible text if the page does not expose source TeX.
- Shadow DOM components are not fully expanded.
- Custom callout/toggle components may render as normal block content.

## License

MIT — see [LICENSE](LICENSE).

Bundled [Mozilla Readability](https://github.com/mozilla/readability) is licensed under Apache 2.0.
