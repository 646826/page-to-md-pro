# Release Checklist

## Version and repository state

- Confirm `manifest.json`, `package.json`, and `package-lock.json` contain the intended version.
- Confirm the release tag `v<version>` does not already exist.
- Confirm the pull request targets `main` and contains no unrelated permission or privacy changes.

## Automated verification

Run from a clean checkout with Node.js 24 or newer:

```bash
npm ci
npx playwright install chromium
npm test
npm run build:zip
npm run validate:package
```

Expected evidence:

- syntax checks pass;
- all Node unit tests pass;
- all Playwright fixtures pass;
- `page-to-md-pro.zip` is created;
- package validation reports the exact version and 15 allowed runtime files.

## Manual smoke checks

Load the unpacked extension and verify:

- a normal article;
- a documentation page with code and nested lists;
- simple and complex tables;
- math and details blocks;
- text selection and image-only lazy-media selection export;
- a page with nested open web components, slots, hidden light DOM, or task lists;
- a large page that uses the Blob download path;
- repeated clicks or a transient messaging retry produce one extraction/download;
- a literal `<script>` string remains inert Markdown text and UI/script nodes inside tables are removed;
- unsupported browser pages show an error badge rather than failing silently.

## Automated option B delivery

For the normal `main` workflow:

1. CI must pass on the pull request.
2. Merge the release commit to `main`.
3. The release workflow verifies the version tag is absent.
4. It reruns tests, builds, and validates the ZIP.
5. It uploads to the Chrome Web Store with `CWS_PUBLISH_TYPE=UPLOAD_ONLY`.
6. Only after upload success, it creates `v<version>` and a GitHub Release with the ZIP.

`UPLOAD_ONLY` must print `Skipping publish step.` No publish submission is expected.

## Required GitHub environment secrets

Preferred Workload Identity Federation:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

Service-account-key fallback:

- `GOOGLE_CREDENTIALS`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

## Post-upload checks

- Confirm the release workflow reports Chrome Web Store upload state `SUCCEEDED`.
- Confirm no publish API call occurred for `UPLOAD_ONLY`.
- Confirm the GitHub Release target is the verified `main` commit.
- Download the Release asset and compare its SHA-256 digest with the verified workflow artifact when investigating discrepancies.
- Review the package state manually in the Chrome Web Store Developer Dashboard before any later submission.
