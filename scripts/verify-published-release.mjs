import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RELEASE_RUNTIME_FILES = Object.freeze([
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'assets/icon128.png',
  'assets/icon16.png',
  'assets/icon32.png',
  'assets/icon48.png',
  'lib/Readability.js',
  'licenses/Apache-2.0.txt',
  'manifest.json',
  'src/background.js',
  'src/content.js',
  'src/offscreen.html',
  'src/offscreen.js',
  'src/options.css',
  'src/options.html',
  'src/options.js',
  'src/shared.js',
  'src/storage.js'
].sort());

export async function verifyPublishedRelease(options = {}) {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const repository = options.repository || process.env.GITHUB_REPOSITORY || '646826/page-to-md-pro';
  const tag = options.tag || process.env.RELEASE_TAG || `v${manifest.version}`;
  const version = manifest.version;
  const apiBase = String(options.apiBase || 'https://api.github.com').replace(/\/$/, '');
  const token = options.token ?? process.env.GITHUB_TOKEN ?? '';
  const outputPath = options.outputPath || path.join(root, 'published-release-verification.json');

  assert(/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag), `Invalid release tag: ${tag}`);
  assert(tag === `v${version}`, `Release tag ${tag} does not match manifest version ${version}`);

  const release = await fetchJson(
    `${apiBase}/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    token
  );
  assert(release.tag_name === tag, `Release API returned tag ${release.tag_name || '<missing>'}`);
  assert(release.draft === false, 'Published release must not be a draft');
  assert(release.prerelease === false, 'Published release must not be a prerelease');

  const zipAsset = findUploadedAsset(release, 'page-to-md-pro.zip');
  const evidenceAsset = findUploadedAsset(release, 'release-evidence.json');
  const tagCommit = await resolveTagCommit(apiBase, repository, tag, token);

  const evidenceBytes = await downloadBytes(evidenceAsset.browser_download_url, token);
  assertSize(evidenceAsset, evidenceBytes, 'release-evidence.json');

  let evidence;
  try {
    evidence = JSON.parse(evidenceBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`release-evidence.json is not valid JSON: ${error.message}`);
  }

  validateDeliveryEvidence(evidence, { repository, version, tag, tagCommit });
  assert(
    release.target_commitish === evidence.commit,
    `Release target ${release.target_commitish || '<missing>'} does not match evidence commit ${evidence.commit}`
  );

  const zipBytes = await downloadBytes(zipAsset.browser_download_url, token);
  assertSize(zipAsset, zipBytes, 'page-to-md-pro.zip');
  const zip = await inspectReleaseZip(zipBytes, version);

  const report = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    repository,
    tag,
    version,
    commit: evidence.commit,
    release: {
      name: release.name || '',
      url: release.html_url || '',
      publishedAt: release.published_at || '',
      draft: release.draft,
      prerelease: release.prerelease,
      targetCommitish: release.target_commitish,
      assets: [zipAsset.name, evidenceAsset.name].sort()
    },
    chromeWebStoreUpload: evidence.chromeWebStoreUpload,
    publishSubmission: evidence.publishSubmission,
    publishType: evidence.publishType,
    skipReview: evidence.skipReview,
    evidenceVerifiedAt: evidence.verifiedAt,
    verifiedLogMarkers: [...evidence.verifiedLogMarkers],
    zip
  };

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function findUploadedAsset(release, name) {
  const asset = Array.isArray(release.assets)
    ? release.assets.find((candidate) => candidate?.name === name)
    : null;
  assert(asset, `GitHub Release is missing ${name}`);
  assert(asset.state === 'uploaded', `${name} is not in uploaded state`);
  assert(typeof asset.browser_download_url === 'string' && asset.browser_download_url, `${name} has no download URL`);
  return asset;
}

async function resolveTagCommit(apiBase, repository, tag, token) {
  const reference = await fetchJson(
    `${apiBase}/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
    token
  );
  const object = reference.object;
  assert(object && typeof object.sha === 'string', `Tag ${tag} has no Git object`);
  if (object.type === 'commit') return object.sha;
  assert(object.type === 'tag', `Tag ${tag} points to unsupported object type ${object.type || '<missing>'}`);

  const annotated = await fetchJson(`${apiBase}/repos/${repository}/git/tags/${object.sha}`, token);
  assert(annotated.object?.type === 'commit', `Annotated tag ${tag} does not point to a commit`);
  assert(typeof annotated.object.sha === 'string', `Annotated tag ${tag} has no commit SHA`);
  return annotated.object.sha;
}

function validateDeliveryEvidence(evidence, expected) {
  assert(evidence && typeof evidence === 'object', 'Release evidence must be an object');
  assert(evidence.schemaVersion === 1, 'Release evidence schemaVersion must be 1');
  assert(evidence.repository === expected.repository, `Evidence repository must be ${expected.repository}`);
  assert(evidence.version === expected.version, `Evidence version must be ${expected.version}`);
  assert(evidence.tag === expected.tag, `Evidence tag must be ${expected.tag}`);
  assert(evidence.commit === expected.tagCommit, `Evidence commit must match tag target ${expected.tagCommit}`);
  assert(evidence.eventName === 'push', 'Release delivery must originate from a main-branch push');
  assert(evidence.publishType === 'UPLOAD_ONLY', 'Evidence publishType must be UPLOAD_ONLY');
  assert(evidence.skipReview === false, 'Evidence skipReview must be false');
  assert(evidence.chromeWebStoreUpload === 'SUCCEEDED', 'Chrome Web Store upload must be SUCCEEDED');
  assert(evidence.publishSubmission === 'SKIPPED', 'Chrome Web Store publish submission must be SKIPPED');
  assert(Array.isArray(evidence.verifiedLogMarkers), 'Evidence verifiedLogMarkers must be an array');
  for (const marker of ['Upload finished successfully.', 'Skipping publish step.']) {
    assert(evidence.verifiedLogMarkers.includes(marker), `Evidence is missing log marker: ${marker}`);
  }
  assert(typeof evidence.verifiedAt === 'string' && !Number.isNaN(Date.parse(evidence.verifiedAt)), 'Evidence verifiedAt must be an ISO timestamp');
}

async function inspectReleaseZip(zipBytes, expectedVersion) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'p2m-release-verify-'));
  const zipPath = path.join(temp, 'page-to-md-pro.zip');
  try {
    await writeFile(zipPath, zipBytes);
    const listing = run('unzip', ['-Z1', zipPath]);
    const entries = listing.split(/\r?\n/).filter(Boolean).sort();
    assert(
      JSON.stringify(entries) === JSON.stringify(RELEASE_RUNTIME_FILES),
      `Release ZIP entries differ from the exact allowlist:\n${entries.join('\n')}`
    );

    const manifestText = run('unzip', ['-p', zipPath, 'manifest.json']);
    let embeddedManifest;
    try {
      embeddedManifest = JSON.parse(manifestText);
    } catch (error) {
      throw new Error(`Release ZIP manifest.json is invalid: ${error.message}`);
    }
    assert(embeddedManifest.manifest_version === 3, 'Release ZIP manifest_version must be 3');
    assert(embeddedManifest.version === expectedVersion, `Release ZIP manifest version must be ${expectedVersion}`);

    return {
      sha256: createHash('sha256').update(zipBytes).digest('hex'),
      bytes: zipBytes.length,
      entryCount: entries.length,
      entries,
      manifestVersion: embeddedManifest.version
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} exited with status ${result.status}`);
  }
  return result.stdout;
}

async function fetchJson(url, token) {
  const response = await request(url, token, 'application/vnd.github+json');
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Could not parse JSON from ${url}: ${error.message}`);
  }
}

async function downloadBytes(url, token) {
  const response = await request(url, token, 'application/octet-stream');
  return Buffer.from(await response.arrayBuffer());
}

async function request(url, token, accept) {
  const headers = {
    Accept: accept,
    'User-Agent': 'page-to-md-pro-published-release-verifier',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 1_000);
    throw new Error(`Request failed (${response.status} ${response.statusText}) for ${url}: ${body}`);
  }
  return response;
}

function assertSize(asset, bytes, name) {
  if (Number.isInteger(asset.size)) {
    assert(bytes.length === asset.size, `${name} downloaded ${bytes.length} bytes but GitHub reports ${asset.size}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entry === import.meta.url) {
  verifyPublishedRelease()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}
