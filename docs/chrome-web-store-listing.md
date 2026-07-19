# Chrome Web Store Listing Copy

## Name

Page to Markdown Pro

## Summary

Export pages or selected content as reliable, clean Markdown in one click.

## Description

Page to Markdown Pro exports the active web page or highlighted selection as a local Markdown file that is ready to save, search, and reuse.

It is designed for modern articles, documentation sites, wikis, and code-heavy pages. The extractor combines Readability with semantic page analysis and preserves structures that often break in generic clipping tools.

Key features:

- One-click page or selection export
- Main-content, full-page, automatic, and selection modes
- YAML front matter from standard metadata and Article-like JSON-LD
- Code blocks, language fences, nested lists, task lists, callouts, and details
- Smart Markdown tables with sanitized HTML fallback for complex tables
- KaTeX and MathJax preservation
- Lazy-image normalization and meaningful media links
- Open Shadow DOM and slot support
- Safer link handling and tracking-parameter removal
- Local processing with minimal permissions and no telemetry

The extension reads the active tab only after an explicit user action. Content is processed in the browser and downloaded to the user's device. It is not sent to developer-controlled servers.

## Single purpose

Export the active web page or highlighted selection to a local Markdown file after an explicit user action.

## Privacy disclosure

Page content and selections are processed locally to produce the requested Markdown. The extension does not send page contents, selections, generated Markdown, or usage analytics to developer-controlled servers. Preferences are stored in Chrome sync storage with local extension storage as a fallback.

## Permission justifications

- `activeTab`: read the active page only after the user clicks an action, shortcut, or context-menu item.
- `scripting`: inject bundled local extraction scripts into that active tab.
- `downloads`: save the generated Markdown to the device.
- `contextMenus`: expose page and selection export actions.
- `offscreen`: create Blob URLs for large local downloads.
- `storage`: save user preferences.

## Recommended category

Productivity

## URLs

- Support: https://646826.github.io/page-to-md-pro/support.html
- Homepage: https://646826.github.io/page-to-md-pro/
- Privacy policy: https://646826.github.io/page-to-md-pro/privacy.html
