# Release Checklist

This project can be published as an open-source GitHub repository and as a Chrome Web Store extension without a build step beyond creating the release ZIP.

## Pre-release checks

- Run `npm test` and confirm all fixtures pass.
- Run `npm run build:zip` and confirm `page-to-md-pro.zip` is created.
- Load the unpacked extension in Chrome and test:
  - a normal article page
  - a docs page with code blocks
  - a page with a table
  - selection export
  - a large page download
- Confirm the version in `manifest.json` is the version you intend to ship.

## GitHub release

1. Create a public repository.
2. Add the remote:

   ```bash
   git remote add origin git@github.com:<your-user>/page-to-md-pro.git
   ```

3. Commit the project:

   ```bash
   git add .
   git commit -m "Initial public release"
   ```

4. Push `main`:

   ```bash
   git push -u origin main
   ```

5. Update `manifest.json` `homepage_url` if the final repository URL differs from the current placeholder.
6. Enable GitHub Issues so the support document has a clear destination for bug reports.

## Chrome Web Store materials

Prepare these before submitting:

- extension ZIP: `page-to-md-pro.zip`
- 128x128 extension icon: `assets/icon128.png`
- store screenshot: `assets/store/store-screenshot-1280x800.png`
- small promo tile: `assets/store/small-promo-tile-440x280.png`
- optional marquee promo tile: `assets/store/marquee-promo-tile-1400x560.png`
- privacy policy URL
- support URL
- short and long description copy

## Suggested listing copy

### Short description

Export the current page or selected content as a clean Markdown file in one click.

### Single purpose

Export the active web page or highlighted selection to a local Markdown file. The extension reads the current tab only after an explicit user action and processes content locally in the browser.

### Permission justifications

- `activeTab`: read the current page only after the user clicks the action, shortcut, or context menu.
- `scripting`: inject the local extraction scripts into the active tab.
- `downloads`: save the generated Markdown file to the user's device.
- `contextMenus`: provide page and selection export actions.
- `offscreen`: create Blob URLs for large downloads.
- `storage`: save user preferences.

## Privacy answers

Recommended answers for the Chrome Web Store privacy questionnaire:

- User data is processed locally in the browser.
- The extension does not send page contents, selections, or generated Markdown to the developer.
- The extension stores only user preferences in Chrome storage sync.
- The extension does not use remote code.

## Post-submit checks

- Verify the public store listing links to the correct GitHub repository.
- Verify the privacy policy and support URLs are reachable without authentication.
- Install the published item from the store and repeat the smoke checks.
