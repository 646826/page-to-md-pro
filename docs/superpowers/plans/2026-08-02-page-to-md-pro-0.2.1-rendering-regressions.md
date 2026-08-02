# Page to Markdown Pro 0.2.1 Rendering Regressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct two Markdown rendering regressions, prove the fixes through a real Chromium fixture, and release version 0.2.1 through the existing verified upload-only pipeline.

**Architecture:** Keep the existing renderer architecture unchanged. Add one browser-level fixture to the existing Playwright harness, make the smallest two-line production correction, then update versioned metadata and release documentation.

**Tech Stack:** Manifest V3 JavaScript, Node.js 24, npm 11.17.0, Playwright 1.61.1, GitHub Actions, Chrome Web Store API.

## Global Constraints

- Keep `manifest_version` at 3 and `minimum_chrome_version` at 109.
- Add no runtime dependency, host permission, or content script declaration.
- Keep Chrome Web Store delivery on `main` in `UPLOAD_ONLY` mode.
- Preserve the deterministic 18-file release ZIP allowlist.
- Use a patch release: `0.2.1` / tag `v0.2.1`.

---

### Task 1: Add a failing browser regression fixture

**Files:**
- Create: `tests/fixture-rendering-regressions.html`
- Modify: `tests/run-fixture-tests.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the existing `tests/run-fixture-tests.mjs` fixture descriptor format (`file`, `mode`, `options`, `checks`, `rejects`).
- Produces: a fixture selectable with `node tests/run-fixture-tests.mjs fixture-rendering-regressions.html`.

- [ ] **Step 1: Create the fixture HTML**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Rendering Regressions</title>
  <link rel="canonical" href="https://example.test/rendering-regressions">
</head>
<body>
  <main>
    <article>
      <h1>Rendering Regressions</h1>
      <p>First line<br>Second line</p>
      <div>Before code <p2m-code class="highlight"><code class="language-js">const nested = true;</code></p2m-code> After code</div>
    </article>
  </main>
</body>
</html>
```

- [ ] **Step 2: Register exact output expectations**

Add this descriptor to `fixtures` in `tests/run-fixture-tests.mjs`:

```js
{
  file: 'fixture-rendering-regressions.html',
  mode: 'main',
  options: { includeFrontMatter: false, includeSourceLink: false },
  checks: [
    'First line<br>\nSecond line',
    '```javascript\nconst nested = true;\n```'
  ],
  rejects: [
    '<br-',
    'l\n```javascript\nconst nested = true;'
  ]
}
```

- [ ] **Step 3: Add a dedicated CI step**

Insert before the aggregate `npm test` step in `.github/workflows/ci.yml`:

```yaml
      - name: Test rendering-regression fixture
        run: timeout 120s node tests/run-fixture-tests.mjs fixture-rendering-regressions.html
```

- [ ] **Step 4: Commit the test before production changes**

```bash
git add tests/fixture-rendering-regressions.html tests/run-fixture-tests.mjs .github/workflows/ci.yml
git commit -m "test: reproduce markdown rendering regressions"
```

- [ ] **Step 5: Verify RED in pull-request CI**

Run the pull-request workflow for the test-only commit. Expected result: the rendering-regression fixture fails because the Markdown contains `<br-` and/or the forbidden `l` prefix, while setup and script loading succeed.

---

### Task 2: Apply the minimal renderer correction

**Files:**
- Modify: `src/content.js`

**Interfaces:**
- Consumes: the existing internal `renderInline(node, context)` function.
- Produces: unchanged renderer API with corrected Markdown strings.

- [ ] **Step 1: Correct inline code-block spacing**

Replace:

```js
if (isCodeBlockContainer(node)) return `\l\n${renderCodeBlock(node)}\n\n`;
```

with:

```js
if (isCodeBlockContainer(node)) return `\n\n${renderCodeBlock(node)}\n\n`;
```

- [ ] **Step 2: Correct HTML line-break output**

Replace:

```js
case 'BR': return '<br-\n';
```

with:

```js
case 'BR': return '<br>\n';
```

- [ ] **Step 3: Commit the production correction**

```bash
git add src/content.js
git commit -m "fix: restore markdown line break rendering"
```

- [ ] **Step 4: Verify GREEN for the focused fixture**

```bash
node tests/run-fixture-tests.mjs fixture-rendering-regressions.html
```

Expected: exit code 0 and `✓ fixture-rendering-regressions.html`.

---

### Task 3: Prepare version 0.2.1 metadata and release notes

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/package.test.mjs`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/0.2.1.md`
- Modify: `README.md` only where it identifies the current release or fixture count.

**Interfaces:**
- Consumes: existing package/release validation and the `main` release workflow.
- Produces: consistent version `0.2.1` and release documentation for tag `v0.2.1`.

- [ ] **Step 1: Update all enforced version fields**

Set `version` to `0.2.1` in `manifest.json`, `package.json`, and both root version fields in `package-lock.json`. Update the package test name and assertions from `0.2.0` to `0.2.1`.

- [ ] **Step 2: Add changelog entry**

Add above 0.2.0:

```markdown
## [0.2.1] - 2026-08-02

### Added

- Browser regression coverage for HTML line breaks and nested inline-flow code blocks.

### Fixed

- Restored valid `<br>` Markdown output instead of emitting the malformed `<br-` fragment.
- Removed a stray `l` character before code blocks encountered in inline/custom-element flow.
```

- [ ] **Step 3: Add release notes**

Create `docs/releases/0.2.1.md` describing the two user-visible fixes, regression coverage, unchanged permissions, and the verification commands.

- [ ] **Step 4: Update README release facts**

Change only exact current-version and fixture-count statements made stale by this release; do not rewrite unrelated documentation.

- [ ] **Step 5: Commit release preparation**

```bash
git add manifest.json package.json package-lock.json tests/package.test.mjs CHANGELOG.md docs/releases/0.2.1.md README.md
git commit -m "chore: prepare release 0.2.1"
```

---

### Task 4: Verify, merge, and release

**Files:**
- Verify all changed files; no additional production scope.

**Interfaces:**
- Consumes: pull-request CI and `.github/workflows/chrome-web-store-release.yml`.
- Produces: merged `main`, Chrome Web Store upload-only evidence, tag `v0.2.1`, and the GitHub Release assets.

- [ ] **Step 1: Run the full pull-request verification**

Required commands represented by CI:

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run build:zip
npm run validate:package
```

Expected: every command exits 0; all Node tests and all 10 browser fixtures pass; the ZIP validates against the exact runtime allowlist.

- [ ] **Step 2: Review the complete diff**

Confirm the production change is exactly the two renderer literals, plus tests, CI registration, version metadata, and release documentation. Confirm no permissions or dependencies changed.

- [ ] **Step 3: Merge to `main` only after green CI**

Use the repository's normal merge method and verify the resulting `main` commit.

- [ ] **Step 4: Verify the release workflow**

Confirm the `main` push workflow completes these gates in order: full verification, deterministic ZIP build, Chrome Web Store `UPLOAD_ONLY` success, delivery-evidence artifact, and GitHub Release creation.

- [ ] **Step 5: Verify published release assets**

Run the repository's published-release verifier against `v0.2.1`. Expected assets: `page-to-md-pro.zip` and `release-evidence.json`; expected store state: `SUCCEEDED`, publish submission `SKIPPED`, publish type `UPLOAD_ONLY`.
