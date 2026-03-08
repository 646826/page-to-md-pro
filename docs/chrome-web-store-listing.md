# Chrome Web Store Listing Copy

These strings are ready to paste into the Chrome Web Store dashboard.

## Name

Page to Markdown Pro

## Summary

Export the current page or selected content as a clean Markdown file in one click.

## Description

Page to Markdown Pro exports the current web page or highlighted selection as a Markdown file that is ready to save, search, and reuse.

It is designed for more than simple article pages. The extractor is tuned for documentation sites, code-heavy pages, lazy-loaded images, callouts, details blocks, math markup, and tables that often break in generic clipping tools.

Key features:

- One-click Markdown download from the toolbar button
- Export the full page, main content, or highlighted selection
- YAML front matter with source metadata
- Code block and language fence preservation
- Smart table handling with HTML fallback for complex tables
- Callout and details block preservation
- Math preservation for common KaTeX and MathJax patterns
- Local processing with minimal permissions

Permissions are intentionally limited. The extension reads the active tab only after an explicit user action and processes the content locally in the browser before downloading the Markdown file to your device.

## Single purpose

Export the active web page or highlighted selection to a local Markdown file. The extension reads the current tab only after an explicit user action and processes content locally in the browser.

## Privacy disclosure

Page content and selections are processed locally in the browser to generate the Markdown output requested by the user. The extension does not send page contents, selections, or generated Markdown to developer-controlled servers. Only user preferences are stored in Chrome storage sync.

## Permission justifications

- `activeTab`: Read the current page only after the user clicks the action, shortcut, or context menu.
- `scripting`: Inject the local extraction scripts into the active tab.
- `downloads`: Save the generated Markdown file to the user's device.
- `contextMenus`: Provide page and selection export actions.
- `offscreen`: Create Blob URLs for large downloads.
- `storage`: Save user preferences.

## Recommended category

Productivity

## Support URL

https://646826.github.io/page-to-md-pro/support.html

## Homepage URL

https://646826.github.io/page-to-md-pro/

## Privacy policy URL

https://646826.github.io/page-to-md-pro/privacy.html
