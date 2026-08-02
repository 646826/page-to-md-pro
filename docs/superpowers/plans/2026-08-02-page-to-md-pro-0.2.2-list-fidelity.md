# Page to Markdown Pro 0.2.2 List Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve HTML ordered-list counters and produce marker-aware nested-list indentation, then release the verified change as version 0.2.2.

**Architecture:** Keep the existing renderer in `src/content.js`. Add a focused browser fixture, replace fixed depth-based indentation with an inherited indentation prefix, and calculate ordered markers from `start`, `reversed`, and direct-child `value` attributes.

**Tech Stack:** Manifest V3 JavaScript, Node.js 24, npm 11.17.0, Playwright 1.61.1, GitHub Actions, Chrome Web Store API.

## Global Constraints

- Keep `manifest_version` at 3 and `minimum_chrome_version` at 109.
- Add no runtime dependency, host permission, or static content script.
- Keep the existing six permissions unchanged.
- Keep automated Chrome Web Store delivery in `UPLOAD_ONLY` mode.
- Preserve the deterministic 18-file release ZIP allowlist.
- Release as `0.2.2` with tag `v0.2.2`.

---

### Task 1: Add a failing ordered-list browser fixture

**Files:**
- Create: `tests/fixture-lists.html`
- Modify: `tests/run-fixture-tests.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the existing browser-fixture descriptor format.
- Produces: a focused command, `node tests/run-fixture-tests.mjs fixture-lists.html`.

- [ ] **Step 1: Create the fixture HTML**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ordered List Fidelity</title>
</head>
<body>
  <main>
    <article>
      <h1>Ordered List Fidelity</h1>

      <ol start="0">
        <li>Zero</li>
        <li>One</li>
      </ol>

      <ol start="-2">
        <li>Negative two</li>
        <li>Negative one</li>
      </ol>

      <ol reversed>
        <li>Default three</li>
        <li value="7">Reset seven</li>
        <li>Then six</li>
      </ol>

      <ol start="10">
        <li>
          Ten first line
          <p>Ten continuation</p>
          <ul><li>Nested bullet</li></ul>
        </li>
        <li>Eleven</li>
      </ol>
    </article>
  </main>
</body>
</html>
```

- [ ] **Step 2: Register exact expectations**

Add this descriptor to `tests/run-fixture-tests.mjs`:

```js
{
  file: 'fixture-lists.html', mode: 'main',
  options: { includeFrontMatter: false, includeSourceLink: false },
  checks: [
    '0. Zero\n1. One',
    '-2. Negative two\n-1. Negative one',
    '3. Default three\n7. Reset seven\n6. Then six',
    '10. Ten first line\n    Ten continuation\n    - Nested bullet\n11. Eleven'
  ],
  rejects: [
    '1. Zero',
    '1. Default three\n2. Reset seven',
    '10. Ten first line\n  Ten continuation',
    '\n  - Nested bullet'
  ]
}
```

- [ ] **Step 3: Add a focused CI step**

Insert before the aggregate `npm test` step:

```yaml
      - name: Test ordered-list fidelity fixture
        run: timeout 120s node tests/run-fixture-tests.mjs fixture-lists.html
```

- [ ] **Step 4: Commit the test-only change**

```bash
git add tests/fixture-lists.html tests/run-fixture-tests.mjs .github/workflows/ci.yml
git commit -m "test: reproduce ordered list fidelity regressions"
```

- [ ] **Step 5: Verify RED**

Run the pull-request CI for the test-only commit. Expected failures include `1. Zero`, ascending reversed markers, ignored `value="7"`, and two-space indentation after `10.`.

---

### Task 2: Implement marker-aware list rendering

**Files:**
- Modify: `src/content.js` in `renderList` and `renderListItem`

**Interfaces:**
- Consumes: existing renderer context plus optional `listIndent` string.
- Produces: unchanged public extraction response with corrected list Markdown.

- [ ] **Step 1: Replace ordered-counter calculation**

Use direct `<li>` children and calculate markers with this behavior:

```js
function renderList(list, context) {
  const ordered = list.tagName === 'OL';
  const items = Array.from(list.children).filter((child) => child.tagName === 'LI');
  const reversed = ordered && list.hasAttribute('reversed');
  const defaultStart = reversed ? items.length : 1;
  let counter = ordered && list.hasAttribute('start')
    ? parseIntegerAttribute(list.getAttribute('start'), defaultStart)
    : defaultStart;
  const step = reversed ? -1 : 1;

  return items.map((item) => {
    let marker = '-';
    if (ordered) {
      if (item.hasAttribute('value')) {
        counter = parseIntegerAttribute(item.getAttribute('value'), counter);
      }
      marker = `${counter}.`;
      counter += step;
    }
    return renderListItem(item, context, marker);
  }).filter(Boolean).join('\n');
}
```

- [ ] **Step 2: Replace fixed depth indentation**

In `renderListItem`, use:

```js
const indent = typeof context.listIndent === 'string' ? context.listIndent : '';
const continuationIndent = `${indent}${' '.repeat(marker.length + 1)}`;
```

Render the first line as `${indent}${marker}` and every continuation line with `continuationIndent`. Render nested lists with:

```js
renderList(child, { ...context, listIndent: continuationIndent })
```

Remove `listDepth` from list indentation calculations; keep other context fields unchanged.

- [ ] **Step 3: Add strict integer parsing helper**

Add near the renderer helpers:

```js
function parseIntegerAttribute(value, fallback) {
  const normalized = String(value ?? '').trim();
  if (!/^[+-]?\d+$/.test(normalized)) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}
```

- [ ] **Step 4: Commit the production correction**

```bash
git add src/content.js
git commit -m "fix: preserve ordered list numbering and indentation"
```

- [ ] **Step 5: Verify GREEN**

```bash
node tests/run-fixture-tests.mjs fixture-lists.html
```

Expected: exit code 0 and `✓ fixture-lists.html`.

---

### Task 3: Prepare release 0.2.2

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/package.test.mjs`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/0.2.2.md`

**Interfaces:**
- Consumes: the existing release pipeline and metadata checks.
- Produces: consistent version `0.2.2` and release documentation.

- [ ] **Step 1: Update enforced version metadata**

Change `0.2.1` to `0.2.2` in the manifest, package metadata, lockfile root metadata, and package-test assertions.

- [ ] **Step 2: Update README facts**

Set the current version to `0.2.2` and update the suite count from ten to eleven Chromium fixtures. Mention ordered-list counter and indentation coverage without rewriting unrelated documentation.

- [ ] **Step 3: Add changelog entry**

```markdown
## [0.2.2] - 2026-08-02

### Added

- Browser regression coverage for zero, negative, reversed, reset, multi-digit, multiline, and nested ordered lists.

### Fixed

- Preserved `<ol start="0">`, negative starts, `<ol reversed>`, and direct `<li value>` counter resets.
- Used marker-width-aware continuation and nested-list indentation so multi-digit ordered lists remain valid Markdown.
```

- [ ] **Step 4: Add release notes**

Create `docs/releases/0.2.2.md` with the changed list behavior, unchanged permissions/dependencies, verification gates, and `UPLOAD_ONLY` release behavior.

- [ ] **Step 5: Commit release preparation**

```bash
git add manifest.json package.json package-lock.json tests/package.test.mjs README.md CHANGELOG.md docs/releases/0.2.2.md
git commit -m "chore: prepare release 0.2.2"
```

---

### Task 4: Verify, merge, release, and audit

**Files:**
- Verify the complete branch; no new production scope.

**Interfaces:**
- Consumes: CI, Chrome Web Store release workflow, and published-release verifier.
- Produces: merged `main`, tag `v0.2.2`, release assets, and verified upload-only evidence.

- [ ] **Step 1: Run full branch verification**

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run build:zip
npm run validate:package
```

Expected: 36 Node tests, 11 Chromium fixtures, deterministic ZIP success, and exact 18-file allowlist validation.

- [ ] **Step 2: Review scope**

Confirm no permission, dependency, host-access, minimum-Chrome, or release-mode changes. Confirm production changes are limited to list rendering and a strict integer helper.

- [ ] **Step 3: Merge into `main`**

Merge only after all PR checks pass, then confirm `main` contains version `0.2.2`.

- [ ] **Step 4: Verify release delivery**

Confirm the main-branch release workflow passes full verification, uploads `page-to-md-pro.zip` to Chrome Web Store with `UPLOAD_ONLY`, writes `release-evidence.json`, and creates GitHub Release `v0.2.2`.

- [ ] **Step 5: Audit published assets**

Run `scripts/verify-published-release.mjs` against `v0.2.2`. Require `chromeWebStoreUpload: SUCCEEDED`, `publishSubmission: SKIPPED`, `publishType: UPLOAD_ONLY`, exact 18-file ZIP contents, and embedded manifest version `0.2.2`.