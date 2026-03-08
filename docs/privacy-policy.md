# Privacy Policy

Last updated: March 8, 2026

Page to Markdown Pro processes page content locally in your browser when you explicitly use the extension.

## What the extension does

- Reads the active page or highlighted selection only after you click the toolbar button, use a keyboard shortcut, or choose a context-menu action.
- Converts that content into Markdown locally on-device.
- Saves your preferences using Chrome storage sync.
- Saves the generated Markdown file locally through Chrome's downloads API.

## What the extension does not do

- It does not send page content, selections, generated Markdown, or browsing data to our servers.
- It does not use remote code, analytics beacons, or third-party tracking scripts.
- It does not require an account or user sign-in.

## Data handling summary

- Page content and selections are processed transiently in the browser to generate the Markdown output you requested.
- Settings such as export preferences may be stored in `chrome.storage.sync`, which is managed by Chrome under your browser account settings.
- Generated files are downloaded to your device and are not uploaded by the extension.

## Permissions explained

- `activeTab`: temporarily access the current page after an explicit user action.
- `scripting`: inject the local extraction scripts into the active page.
- `downloads`: save the generated Markdown file.
- `contextMenus`: offer export actions from the page and selection context menus.
- `offscreen`: create Blob URLs for large downloads.
- `storage`: save user preferences.

## Contact

For privacy questions or requests, use the support information in [support.md](support.md).

## Chrome Web Store user data policy

The use of information collected from web pages through this extension is limited to providing the user-facing export feature described in the Chrome Web Store listing and the extension UI. The extension does not use this information for advertising, profiling, or sale to third parties.
