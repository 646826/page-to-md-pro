# Chrome Web Store Pipeline

This document describes a practical release pipeline for `page-to-md-pro`.

## Recommended release model

Use two separate flows:

1. Normal CI on every push and pull request.
2. A manual Chrome Web Store release workflow triggered only when you want to upload or submit a new version.

That is the safer model for extensions because every submitted package goes through store review, visibility changes are managed in the dashboard, and release timing often needs human judgment.

## Important limitation

The upload endpoint documented by the Chrome Web Store API uploads a package to an existing item. In practice, this means you should create the first store item manually in the Developer Dashboard, fill out the Store listing and Privacy tabs, and only then automate future uploads and submissions.

There is an older V1 API that includes an insert method, but V1 is deprecated. For a new release pipeline, it is safer to create the first item manually and use the current workflow only for updates.

## First-time setup

### 1. Create the item manually

Use the Developer Dashboard to:

- create the new item
- upload the first ZIP
- fill in Store listing
- fill in Privacy
- configure Distribution
- note the extension item ID after the item exists

### 2. Set up API access

The Chrome Web Store API now supports service accounts, which are intended for CI/CD and other server-to-server automation.

Minimum setup:

1. Create or choose a Google Cloud project.
2. Enable the Chrome Web Store API.
3. Create a service account.
4. Add that service account email in the Chrome Web Store Developer Dashboard under the Account section.
5. Record your publisher ID from the Developer Dashboard.

## Authentication options

### Preferred: Workload Identity Federation

Best practice for GitHub Actions is to avoid long-lived JSON keys when possible. The workflow in this repository supports Workload Identity Federation through `google-github-actions/auth`.

Configure these GitHub environment secrets under the `chrome-web-store` environment:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

### Simpler fallback: Service Account Key JSON

If you want the fastest initial setup, you can use a service account key secret instead.

Configure these GitHub environment secrets under the `chrome-web-store` environment:

- `GOOGLE_CREDENTIALS`
- `CWS_PUBLISHER_ID`
- `CWS_EXTENSION_ID`

Treat the JSON key like a password. Rotate it if you suspect exposure.

## Workflow behavior

The repository includes a manual workflow:

- [.github/workflows/chrome-web-store-release.yml](../.github/workflows/chrome-web-store-release.yml)

It does the following:

1. checks out the selected ref
2. installs dependencies
3. runs the fixture suite
4. builds `page-to-md-pro.zip`
5. authenticates to Google Cloud
6. uploads the ZIP to the existing Chrome Web Store item
7. optionally submits it using one of these publish modes:
   - `UPLOAD_ONLY`
   - `DEFAULT_PUBLISH`
   - `STAGED_PUBLISH`

## Recommended publish modes

- `UPLOAD_ONLY`: Best for cautious releases. Upload the package, then review the dashboard state manually.
- `STAGED_PUBLISH`: Best default once the listing is stable. The package goes through review and then waits for a manual publish after approval.
- `DEFAULT_PUBLISH`: Best only when you are comfortable with automatic publication after approval.

## Best practices

- Keep the Chrome Web Store workflow manual with `workflow_dispatch`; do not publish on every push.
- Protect the `chrome-web-store` environment in GitHub with required reviewers.
- Keep the first item creation manual in the dashboard.
- Prefer Workload Identity Federation over long-lived service account keys.
- Use `STAGED_PUBLISH` for production releases unless you have a strong reason to auto-publish.
- Consider opting in to verified uploads once the release process is stable, so future uploads must be signed with your own trusted key.
- Keep listing, privacy, and distribution changes deliberate. The API publishes using the existing visibility settings.
- For parallel beta testing, use a separate beta item rather than reusing the production item.
- If you discover a bug during review, cancel the submission and upload a corrected package.
- Keep rollback in mind for incidents after release.
- If more than one person needs publisher access, move to a group publisher.

## Manual dashboard tasks that remain important

Even with API automation, these still belong in the dashboard:

- listing copy changes
- privacy answers
- distribution and regions
- trusted tester settings
- screenshots and promo tiles
- staged publish approval
- rollback and cancel review actions

## Files used by the pipeline

- [scripts/cws-release.sh](../scripts/cws-release.sh)
- [.github/workflows/chrome-web-store-release.yml](../.github/workflows/chrome-web-store-release.yml)
- [docs/chrome-web-store-listing.md](./chrome-web-store-listing.md)
