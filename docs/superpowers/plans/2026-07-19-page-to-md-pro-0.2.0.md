# Page to Markdown Pro 0.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship version 0.2.0 with safer downloads, bounded and deduplicated capture, stronger generic extraction, modern-web fixture coverage, and automated GitHub Release plus Chrome Web Store upload-only delivery.

**Architecture:** Keep the Manifest V3 extension dependency-free at runtime. Use native ES modules for the background worker and options page, put pure shared behavior in importable modules, retain a classic injected content script, and verify browser behavior with Playwright fixtures plus Node's built-in test runner.

**Tech Stack:** Manifest V3, Chrome extension service worker/offscreen APIs, modern JavaScript ES modules, Node.js 24 LTS in CI, `node:test`, Playwright Chromium, Bash packaging, GitHub Actions, Chrome Web Store API.

## Global Constraints

- Release version is exactly `0.2.0`; Git tag is exactly `v0.2.0`.
- Chrome Web Store delivery uses exactly `UPLOAD_ONLY`; it must not submit for publication.
- Do not add runtime dependencies, telemetry, network processing, host permissions, or remotely hosted code.
- Preserve existing options and Markdown output unless a change fixes a tested correctness, stability, or security issue.
- Chrome is the release target; generic Chromium compatibility is tested without separate browser packages.
- Every production behavior change follows a failing-test-first cycle.

---

### Task 1: Shared option, filename, URL, timeout, and storage primitives

**Files:**
- Create: `src/shared.js`
- Create: `src/storage.js`
- Create: `tests/shared.test.mjs`
- Create: `tests/storage.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `DEFAULT_OPTIONS`, `normalizeOptions(value)`, `isSupportedTabUrl(url)`, `buildFilename(result, options, now)`, `isTransientCaptureError(error)`, `withTimeout(promise, timeoutMs, code)`, `ensureDefaultOptions(storage)`, `getOptions(storage)`, and `setOptions(storage, values)`.
- Storage functions accept a Chrome-like `{sync, local}` object so tests use real in-memory fakes rather than mocks of implementation details.

- [ ] **Step 1: Write failing shared utility tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFilename,
  isSupportedTabUrl,
  isTransientCaptureError,
  normalizeOptions,
  withTimeout
} from '../src/shared.js';

test('normalizes hostile stored values', () => {
  assert.deepEqual(normalizeOptions({
    actionMode: 'invalid',
    maxFilenameLength: 9999,
    tableMode: 'invalid'
  }), expectNormalizedDefaultsWithLength200);
});

test('sanitizes reserved Windows filenames and Unicode length', () => {
  assert.equal(buildFilename({ meta: { title: 'CON' } }, defaults, fixedDate), '_CON.md');
});

test('rejects privileged and active tab protocols', () => {
  for (const url of ['chrome://settings', 'javascript:alert(1)', 'data:text/html,x']) {
    assert.equal(isSupportedTabUrl(url), false);
  }
});

test('times out with a stable error code', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5, 'CAPTURE_TIMEOUT'), {
    code: 'CAPTURE_TIMEOUT'
  });
});
```

- [ ] **Step 2: Run shared tests and verify RED**

Run: `node --test tests/shared.test.mjs`

Expected: FAIL because `src/shared.js` does not exist.

- [ ] **Step 3: Implement the shared module**

```js
export const DEFAULT_OPTIONS = Object.freeze({
  actionMode: 'auto',
  includeFrontMatter: true,
  prependTitleHeadingIfMissing: true,
  includeSourceLink: true,
  includeImages: true,
  stripTrackingParams: true,
  saveAs: false,
  maxFilenameLength: 120,
  prependDateToFilename: false,
  tableMode: 'smart'
});

export function normalizeOptions(input = {}) {
  return {
    actionMode: ['auto', 'main', 'full'].includes(input.actionMode) ? input.actionMode : 'auto',
    includeFrontMatter: input.includeFrontMatter !== false,
    prependTitleHeadingIfMissing: input.prependTitleHeadingIfMissing !== false,
    includeSourceLink: input.includeSourceLink !== false,
    includeImages: input.includeImages !== false,
    stripTrackingParams: input.stripTrackingParams !== false,
    saveAs: input.saveAs === true,
    maxFilenameLength: clampInteger(input.maxFilenameLength, 40, 200, 120),
    prependDateToFilename: input.prependDateToFilename === true,
    tableMode: ['smart', 'markdown', 'html'].includes(input.tableMode) ? input.tableMode : 'smart'
  };
}
```

Include complete implementations for URL checks, Unicode-safe filename truncation, reserved-name handling, transient error classification, and timeout cleanup.

- [ ] **Step 4: Run shared tests and verify GREEN**

Run: `node --test tests/shared.test.mjs`

Expected: all shared tests pass with zero warnings.

- [ ] **Step 5: Write failing storage fallback tests**

```js
test('falls back from sync to local storage', async () => {
  const storage = createStorage({ syncGetError: new Error('MAX_WRITE_OPERATIONS') });
  const result = await getOptions(storage);
  assert.equal(result.actionMode, 'auto');
  assert.equal(storage.local.getCalls, 1);
});
```

- [ ] **Step 6: Run storage tests and verify RED**

Run: `node --test tests/storage.test.mjs`

Expected: FAIL because `src/storage.js` does not exist.

- [ ] **Step 7: Implement storage fallback and validate writes**

```js
export async function getOptions(storage = chrome.storage) {
  const defaults = DEFAULT_OPTIONS;
  try {
    return normalizeOptions(await storage.sync.get(defaults));
  } catch {
    return normalizeOptions(await storage.local.get(defaults));
  }
}
```

`ensureDefaultOptions` writes only missing normalized values. `setOptions` attempts sync first and writes local on rejection.

- [ ] **Step 8: Run all unit tests and commit**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.

Commit: `feat: add tested shared extension primitives`

---

### Task 2: Reliable background capture and download lifecycle

**Files:**
- Modify: `src/background.js`
- Create: `tests/background.test.mjs`

**Interfaces:**
- Consumes: all Task 1 exports.
- Produces: one active capture promise per tab; `downloadMarkdown(markdown, filename, saveAs)` that waits for terminal download state before Blob revocation; stable capture error codes.

- [ ] **Step 1: Write failing orchestration tests with a Chrome API harness**

```js
test('deduplicates simultaneous capture requests for one tab', async () => {
  const first = harness.capture(tab, 'auto');
  const second = harness.capture(tab, 'auto');
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(harness.executeScriptCalls, 1);
  assert.equal(harness.downloadCalls, 1);
});

test('keeps a Blob URL until download completion', async () => {
  const pending = harness.downloadLargeMarkdown();
  await harness.flushMicrotasks();
  assert.equal(harness.revokedUrls.length, 0);
  harness.emitDownloadComplete(7);
  await pending;
  assert.deepEqual(harness.revokedUrls, ['blob:fixture']);
});
```

- [ ] **Step 2: Run background tests and verify RED**

Run: `node --test tests/background.test.mjs`

Expected: FAIL because current background code is not importable and revokes immediately.

- [ ] **Step 3: Convert the service worker to an ES module and implement capture deduplication**

```js
const activeCaptures = new Map();

function captureAndDownload(tab, requestedMode) {
  const existing = activeCaptures.get(tab.id);
  if (existing) return existing;
  const operation = runCapture(tab, requestedMode).finally(() => activeCaptures.delete(tab.id));
  activeCaptures.set(tab.id, operation);
  return operation;
}
```

Use a bounded timeout for page response and retry exactly once only when `isTransientCaptureError()` returns true.

- [ ] **Step 4: Implement terminal download waiting**

```js
async function waitForDownloadTerminal(downloadId, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const listener = (delta) => {
      if (delta.id !== downloadId || !delta.state?.current) return;
      cleanup();
      delta.state.current === 'complete' ? resolve() : reject(codedError('DOWNLOAD_INTERRUPTED'));
    };
    const timer = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(listener);
    };
    chrome.downloads.onChanged.addListener(listener);
  });
}
```

Revoke Blob URLs in `finally` only after this promise settles.

- [ ] **Step 5: Run background and all unit tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.

- [ ] **Step 6: Commit**

Commit: `feat: harden capture and download lifecycle`

---

### Task 3: Modern generic extraction and safe rendering

**Files:**
- Modify: `src/content.js`
- Create: `tests/fixture-modern-web.html`
- Create: `tests/fixture-security.html`
- Modify: `tests/run-fixture-tests.mjs`

**Interfaces:**
- Preserves response shape `{ markdown, meta }`.
- Adds metadata sources, open-shadow materialization, task list markers, media links, URL filtering, and traversal budgets.

- [ ] **Step 1: Add modern-web fixture and required assertions**

```js
{
  file: 'fixture-modern-web.html',
  checks: [
    '- [x] Completed task',
    '- [ ] Pending task',
    '## Shadow section',
    'Slotted content',
    'json-ld-author',
    '[Watch video](https://example.test/media/demo.mp4)'
  ]
}
```

The fixture creates an open shadow root, assigned slot, task-list inputs, JSON-LD Article metadata, a lazy image, and a delayed DOM mutation before setting `body[data-test-finished="true"]`.

- [ ] **Step 2: Add security fixture and forbidden assertions**

```js
{
  file: 'fixture-security.html',
  checks: ['Safe link', 'Unsafe link'],
  rejects: ['javascript:', 'vbscript:', 'onclick=', '<script']
}
```

- [ ] **Step 3: Run fixtures and verify RED**

Run: `npm run test:fixtures`

Expected: existing fixtures pass; new modern/security assertions fail.

- [ ] **Step 4: Implement bounded DOM settling and JSON-LD fallbacks**

```js
async function settleDom({ quietMs = 120, maxMs = 800 } = {}) {
  if (document.readyState === 'loading') await once(document, 'DOMContentLoaded');
  await waitForMutationQuietPeriod(document.documentElement, quietMs, maxMs);
}
```

Parse only JSON-LD objects whose `@type` includes `Article`, `NewsArticle`, `BlogPosting`, `TechArticle`, or `ScholarlyArticle`. Ignore malformed JSON.

- [ ] **Step 5: Implement open-shadow and slot materialization**

Walk the live document with a maximum node budget. For each element with an open `shadowRoot`, clone meaningful shadow children into a marked light-DOM container. For each `slot`, clone assigned nodes with `{ flatten: true }`. Never attempt closed roots.

- [ ] **Step 6: Implement task lists, media, and URL security**

Before generic input removal, replace checkbox inputs under list items with text markers `data-p2m-task="checked|unchecked"`; render them immediately after the list marker. Convert meaningful video/audio sources to links. Allow only approved protocols and strip unsafe URL attributes from HTML fallback.

- [ ] **Step 7: Run fixtures and full unit suite**

Run: `node --test tests/*.test.mjs && npm run test:fixtures`

Expected: all unit and fixture tests pass; forbidden fragments are absent.

- [ ] **Step 8: Commit**

Commit: `feat: improve extraction for modern web content`

---

### Task 4: Offscreen, options, manifest, and version consistency

**Files:**
- Modify: `src/offscreen.js`
- Modify: `src/offscreen.html`
- Modify: `src/options.js`
- Modify: `src/options.html`
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/package.test.mjs`

**Interfaces:**
- Background service worker is declared with `"type": "module"`.
- Options page loads `options.js` as a module and uses shared normalized storage.
- Manifest/package versions are exactly `0.2.0`.

- [ ] **Step 1: Write failing package consistency tests**

```js
test('manifest and package describe the 0.2.0 module build', async () => {
  assert.equal(manifest.version, '0.2.0');
  assert.equal(pkg.version, '0.2.0');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.minimum_chrome_version, '109');
});
```

Also inspect referenced paths and HTML script sources and reject `http://` or `https://` script tags.

- [ ] **Step 2: Run package tests and verify RED**

Run: `node --test tests/package.test.mjs`

Expected: FAIL on version, module type, and missing minimum version.

- [ ] **Step 3: Update manifest/package/lock and module script tags**

Set both versions to `0.2.0`; set package `type` to `module`; add `engines.node >=24`; use Playwright `1.61.1`; declare background module type and Chrome 109 minimum; load options/offscreen scripts with `type="module"`.

- [ ] **Step 4: Harden offscreen request validation**

Reject missing IDs, non-string text, unknown URLs, and messages not originating from this extension. Add `page-to-md-revoke-all-blobs` handling.

- [ ] **Step 5: Use shared storage on the options page**

Import `DEFAULT_OPTIONS`, `normalizeOptions`, `getOptions`, and `setOptions`. Disable the save button during writes and show a durable error message on failure.

- [ ] **Step 6: Run package and unit tests**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

Commit: `chore: prepare extension metadata for 0.2.0`

---

### Task 5: CI, package validation, and release automation

**Files:**
- Create: `scripts/check-syntax.mjs`
- Create: `scripts/validate-package.mjs`
- Modify: `scripts/build-zip.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/chrome-web-store-release.yml`

**Interfaces:**
- `npm run check`, `npm run test:unit`, `npm run test:fixtures`, `npm run validate:package`, and `npm run build:zip` are deterministic.
- Main-branch release path creates `v0.2.0` only when absent and forces CWS `UPLOAD_ONLY`.

- [ ] **Step 1: Write validation tests before scripts**

Extend `tests/package.test.mjs` to fail when manifest files are missing, ZIP entries escape the runtime allowlist, or remote scripts are present.

- [ ] **Step 2: Run package tests and verify RED**

Run: `node --test tests/package.test.mjs`

Expected: FAIL because validation scripts and expected package contract do not exist.

- [ ] **Step 3: Implement deterministic validation and packaging**

`check-syntax.mjs` runs `node --check` for every project JavaScript/MJS file. `validate-package.mjs` validates versions/references and, after build, executes `unzip -Z1 page-to-md-pro.zip` and compares entries to the allowlist. Build uses sorted explicit paths and strips file timestamps where supported.

- [ ] **Step 4: Modernize CI**

Use `actions/checkout@v4`, `actions/setup-node@v4` with Node 24 and npm cache, `npm ci`, `npx playwright install --with-deps chromium`, `npm run check`, `npm run test:unit`, `npm run test:fixtures`, `npm run build:zip`, and `npm run validate:package`. Upload the ZIP with `actions/upload-artifact@v4`.

- [ ] **Step 5: Add idempotent main-branch release path**

Read the manifest version, check `refs/tags/v${version}`, and skip delivery when it exists. For a new version, authenticate exactly as the current workflow does, run `scripts/cws-release.sh page-to-md-pro.zip` with `CWS_PUBLISH_TYPE=UPLOAD_ONLY`, then run:

```bash
gh release create "v${version}" page-to-md-pro.zip \
  --target "${GITHUB_SHA}" \
  --title "Page to Markdown Pro ${version}" \
  --generate-notes
```

Manual dispatch retains the existing three publish choices and does not create a GitHub Release unless explicitly operating on an unreleased main version.

- [ ] **Step 6: Run full local verification**

Run: `npm run check && npm run test:unit && npm run test:fixtures && npm run build:zip && npm run validate:package`

Expected: exit code 0 for every command.

- [ ] **Step 7: Commit**

Commit: `ci: automate verified 0.2.0 upload-only release`

---

### Task 6: Documentation, review, PR, merge, and delivery verification

**Files:**
- Create: `CHANGELOG.md`
- Create: `docs/releases/0.2.0.md`
- Modify: `README.md`
- Modify: `docs/release-checklist.md`
- Modify: `docs/chrome-web-store-pipeline.md`
- Modify: `docs/chrome-web-store-listing.md`
- Modify: `docs/support.md`

**Interfaces:**
- Documentation names exact commands, limitations, privacy behavior, and upload-only semantics.

- [ ] **Step 1: Document user-visible and operational changes**

Add a Keep-a-Changelog-style `0.2.0` section dated 2026-07-19. Document shadow DOM/task lists, safer downloads, Node 24/Playwright tests, and that the release workflow uploads but does not publish.

- [ ] **Step 2: Run documentation/package checks**

Run: `npm run validate:package && git diff --check`

Expected: exit code 0.

- [ ] **Step 3: Perform fresh full verification**

Run: `npm ci && npm test && npm run build:zip && npm run validate:package`

Expected: all tests pass, ZIP builds, package validation passes.

- [ ] **Step 4: Review the complete diff against the design**

Verify each acceptance criterion in `docs/superpowers/specs/2026-07-19-page-to-md-pro-0.2.0-design.md`; fix every critical or important issue before proceeding.

- [ ] **Step 5: Commit documentation**

Commit: `docs: document page-to-md-pro 0.2.0`

- [ ] **Step 6: Open a pull request and verify CI**

PR title: `Release Page to Markdown Pro 0.2.0`

PR body contains the behavior summary, exact verification commands, privacy/permission statement, and release behavior (`UPLOAD_ONLY`, no publish submission).

- [ ] **Step 7: Merge with a release commit title**

Squash title: `release: page-to-md-pro 0.2.0`

Merge only after CI reports success.

- [ ] **Step 8: Verify delivery**

Confirm the main-branch release workflow succeeds, the `v0.2.0` GitHub Release contains `page-to-md-pro.zip`, and the Chrome Web Store step reports upload success with `UPLOAD_ONLY`. If external secrets or store credentials block the upload, report the exact failed step and do not claim delivery.
