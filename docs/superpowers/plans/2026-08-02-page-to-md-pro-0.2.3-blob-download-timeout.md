# Page to Markdown Pro 0.2.3 Blob Download Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent slow or stalled Blob downloads from being reported as successful, without charging save-dialog time against the transfer timeout.

**Architecture:** Keep the existing background-controller API and offscreen Blob transport. Move timeout creation from observer construction into `waitFor(downloadId)`, reject on expiry, and prove both timing boundaries with real controller tests.

**Tech Stack:** Manifest V3 JavaScript, Node.js 24, `node:test`, Chrome downloads/offscreen APIs, GitHub Actions.

## Global Constraints

- Release version: `0.2.3` / tag `v0.2.3`.
- Keep `manifest_version` 3 and minimum Chrome version 109.
- Add no permissions, host permissions, content scripts, telemetry, remote code, or runtime dependencies.
- Keep automated Chrome Web Store delivery in `UPLOAD_ONLY` mode.

---

### Task 1: Add failing timeout regression tests

**Files:**
- Modify: `tests/background.test.mjs`

**Interfaces:**
- Consumes: `createBackgroundController()` and the existing Chrome test harness.
- Produces: two tests proving timeout start and timeout rejection behavior.

- [ ] **Step 1: Add the delayed-download-ID test**

Add a test that replaces `chrome.downloads.download()` with a deferred promise, waits longer than `downloadTimeoutMs`, then resolves download ID `7`. Assert the export is still pending until an explicit `complete` event is emitted.

- [ ] **Step 2: Add the terminal-state timeout test**

Start a Blob download with a short timeout and emit no terminal event. Assert rejection with `error.code === 'DOWNLOAD_TIMEOUT'`, one Blob revoke message, and zero remaining download listeners.

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test tests/background.test.mjs
```

Expected: both new tests fail against 0.2.2 because the timer starts too early and resolves as success on expiry.

- [ ] **Step 4: Commit tests before production code**

```bash
git add tests/background.test.mjs
git commit -m "test: reproduce Blob download timeout bugs"
```

---

### Task 2: Correct observer timeout semantics

**Files:**
- Modify: `src/background.js`

**Interfaces:**
- Consumes: the existing private `createDownloadObserver(timeoutMs)` helper.
- Produces: unchanged public controller API with stable `DOWNLOAD_TIMEOUT` rejection.

- [ ] **Step 1: Defer timer creation**

Replace the construction-time timer with `let timer = null` and start it inside `waitFor(downloadId)` after assigning `targetId`.

- [ ] **Step 2: Reject on timeout**

Use:

```js
settle.reject(codedError(
  'DOWNLOAD_TIMEOUT',
  'The Markdown download did not complete before the timeout.'
));
```

- [ ] **Step 3: Preserve cleanup**

Keep `close()` idempotent, clear the timer only when present, and retain listener removal. Do not change completion, interruption, or Blob revocation behavior.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/background.test.mjs
npm test
npm run build:zip
npm run validate:package
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit implementation**

```bash
git add src/background.js
git commit -m "fix: reject timed-out Blob downloads"
```

---

### Task 3: Prepare release 0.2.3

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/package.test.mjs`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/0.2.3.md`

**Interfaces:**
- Produces: synchronized version metadata and release documentation for `v0.2.3`.

- [ ] **Step 1: Synchronize version metadata**

Set all enforced version fields and package-test assertions to `0.2.3`.

- [ ] **Step 2: Update test counts**

Update README from 36 to 38 Node tests while keeping 11 Chromium fixtures.

- [ ] **Step 3: Document the patch**

Add changelog and release notes describing delayed timer start, truthful timeout failure, stable error code, cleanup behavior, and unchanged security/permission model.

- [ ] **Step 4: Commit release preparation**

```bash
git add manifest.json package.json package-lock.json tests/package.test.mjs README.md CHANGELOG.md docs/releases/0.2.3.md
git commit -m "chore: prepare release 0.2.3"
```

---

### Task 4: Verify, merge, release, and audit

- [ ] **Step 1: Require green pull-request CI**

Confirm focused tests, all 38 Node tests, all 11 Chromium fixtures, aggregate `npm test`, deterministic ZIP build, source validation, ZIP allowlist validation, and artifact upload succeed.

- [ ] **Step 2: Review diff**

Confirm production scope is limited to observer timer semantics and that no permission or dependency changed.

- [ ] **Step 3: Merge to `main`**

Merge only after green CI using the repository's normal squash workflow.

- [ ] **Step 4: Verify release delivery**

Confirm tag `v0.2.3`, GitHub Release assets `page-to-md-pro.zip` and `release-evidence.json`, Chrome Web Store upload state `SUCCEEDED`, publish submission `SKIPPED`, and publish type `UPLOAD_ONLY`.
