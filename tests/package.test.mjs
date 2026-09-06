import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));

async function assertFile(relativePath) {
  await assert.doesNotReject(access(path.join(root, relativePath)), `Missing ${relativePath}`);
}

test('manifest and package describe the 0.3.0 module build', async () => {
  const [manifest, pkg] = await Promise.all([readJson('manifest.json'), readJson('package.json')]);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.description.length <= 132, `manifest description is ${manifest.description.length} characters`);
  assert.equal(manifest.version, '0.3.0');
  assert.equal(pkg.version, '0.3.0');
  assert.equal(pkg.type, 'module');
  assert.equal(manifest.background.service_worker, 'src/background.js');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.minimum_chrome_version, '109');
  assert.equal(pkg.engines.node, '>=24.0.0');
  assert.equal(pkg.packageManager, 'npm@11.17.0');
  assert.equal(pkg.devDependencies.playwright, '1.61.1');
});

test('every manifest-referenced runtime file exists', async () => {
  const manifest = await readJson('manifest.json');
  const files = new Set([
    manifest.background.service_worker,
    manifest.options_page,
    ...Object.values(manifest.icons || {})
  ]);
  for (const relativePath of files) await assertFile(relativePath);
  await assertFile('src/content.js');
  await assertFile('src/offscreen.html');
  await assertFile('lib/Readability.js');
});

test('extension HTML contains only local module scripts', async () => {
  for (const relativePath of ['src/options.html', 'src/offscreen.html']) {
    const html = await readFile(path.join(root, relativePath), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((match) => match[1]);
    assert.ok(scripts.length > 0, `${relativePath} must load a script`);
    for (const attributes of scripts) {
      assert.match(attributes, /\btype=["']module["']/i, `${relativePath} script must be a module`);
      assert.doesNotMatch(attributes, /\bsrc=["']https?:/i, `${relativePath} must not load remote code`);
    }
  }
});

test('options styling has Chrome 109 fallbacks before color-mix declarations', async () => {
  const css = await readFile(path.join(root, 'src/options.css'), 'utf8');
  const declarations = [
    ['color: GrayText;', 'color: color-mix(in srgb, CanvasText 68%, transparent);'],
    ['border: 1px solid ButtonBorder;', 'border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);'],
    ['background: Canvas;', 'background: color-mix(in srgb, Canvas 96%, CanvasText 4%);'],
    ['border: 1px solid ButtonBorder;', 'border: 1px solid color-mix(in srgb, CanvasText 28%, transparent);']
  ];

  for (const [fallback, enhancement] of declarations) {
    const fallbackIndex = css.indexOf(fallback);
    const enhancementIndex = css.indexOf(enhancement);
    assert.ok(fallbackIndex >= 0, `missing fallback declaration: ${fallback}`);
    assert.ok(enhancementIndex > fallbackIndex, `fallback must precede enhancement: ${enhancement}`);
  }
});

test('manifest keeps the minimal permission set and no host permissions', async () => {
  const manifest = await readJson('manifest.json');
  assert.deepEqual([...manifest.permissions].sort(), [
    'activeTab', 'contextMenus', 'downloads', 'offscreen', 'scripting', 'storage'
  ].sort());
  assert.equal('host_permissions' in manifest, false);
  assert.equal('content_scripts' in manifest, false);
});

test('deterministic validation and packaging scripts are present', async () => {
  for (const relativePath of [
    'scripts/check-syntax.mjs',
    'scripts/validate-package.mjs',
    'scripts/build-zip.sh',
    'scripts/cws-release.sh',
    'scripts/google-access-token.mjs'
  ]) await assertFile(relativePath);

  const build = await readFile(path.join(root, 'scripts/build-zip.sh'), 'utf8');
  assert.match(build, /src\/shared\.js/);
  assert.match(build, /src\/storage\.js/);
  assert.match(build, /LICENSE/);
  assert.match(build, /THIRD_PARTY_NOTICES\.md/);
  assert.match(build, /licenses\/Apache-2\.0\.txt/);
  assert.doesNotMatch(build, /zip\s+-r\s+[^\n]*\s+\.\//, 'build must use an explicit allowlist');
});

test('redistributable license files exist for the extension and bundled Readability', async () => {
  for (const relativePath of [
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'licenses/Apache-2.0.txt'
  ]) await assertFile(relativePath);

  const notices = await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.match(notices, /Mozilla Readability/);
  assert.match(notices, /Apache License 2\.0/);
});

test('workflows use current Node 24 actions and create releases only after verified upload-only delivery', async () => {
  const ci = await readFile(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const release = await readFile(path.join(root, '.github/workflows/chrome-web-store-release.yml'), 'utf8');
  const publishedRelease = await readFile(path.join(root, '.github/workflows/verify-published-release.yml'), 'utf8');
  const ignore = await readFile(path.join(root, '.gitignore'), 'utf8');

  for (const workflow of [ci, release, publishedRelease]) {
    assert.match(workflow, /actions\/checkout@v6/);
    assert.match(workflow, /actions\/setup-node@v6/);
    assert.match(workflow, /node-version:\s*24/);
  }

  assert.match(ci, /push:\s*\n\s*branches:\s*\[main\]\s*\n\s*pull_request:/,
    'feature branches must use the pull_request check instead of a duplicate push check');
  assert.match(ci, /actions\/upload-artifact@v7/);
  assert.match(ci, /node --test tests\/published-release\.test\.mjs/);
  assert.match(ci, /fixture-rendering-regressions\.html/);
  assert.match(ci, /fixture-lists\.html/);
  assert.match(release, /actions\/upload-artifact@v7/);
  assert.match(publishedRelease, /name: Verify published release and Chrome Web Store evidence\n\s+if: \$\{\{ github\.event_name != 'pull_request' \}\}/);
  assert.match(publishedRelease, /name: Upload verification report\n\s+if: \$\{\{ github\.event_name != 'pull_request' \}\}/);

  const packageArtifactIndex = release.indexOf('name: Upload workflow artifact');
  const storeUploadIndex = release.indexOf('name: Upload to Chrome Web Store and verify delivery mode');
  const evidenceArtifactIndex = release.indexOf('name: Upload verified delivery evidence');
  const githubReleaseIndex = release.indexOf('name: Create GitHub Release after successful store upload');
  assert.ok(
    packageArtifactIndex >= 0
      && storeUploadIndex > packageArtifactIndex
      && evidenceArtifactIndex > storeUploadIndex
      && githubReleaseIndex > evidenceArtifactIndex,
    'ZIP validation must precede store upload, and verified evidence must precede GitHub Release creation'
  );

  assert.match(release, /grep -Fq 'Upload finished successfully\.'/);
  assert.match(release, /grep -Fq 'Skipping publish step\.'/);
  assert.match(release, /chromeWebStoreUpload:\s*'SUCCEEDED'/);
  assert.match(release, /publishSubmission:\s*uploadOnly \? 'SKIPPED' : 'REQUESTED'/);
  assert.match(release, /gh release create "\$\{TAG\}" page-to-md-pro\.zip release-evidence\.json/);

  assert.match(release, /if \[\[ "\$\{EVENT_NAME\}" == "push" \]\];[\s\S]*publish_type="UPLOAD_ONLY"/);
  const pushStart = release.indexOf('if [[ "${EVENT_NAME}" == "push" ]]');
  const releaseEnable = release.indexOf('create_release=true');
  const pushEnd = release.indexOf('\n          fi', releaseEnable);
  assert.ok(pushStart >= 0 && releaseEnable > pushStart && pushEnd > releaseEnable,
    'only a verified main-branch push may create a GitHub Release');
  assert.equal(release.match(/create_release=true/g)?.length, 1);
  assert.match(ignore, /^gha-creds-\*\.json$/m);
});
