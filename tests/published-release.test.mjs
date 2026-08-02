import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_RUNTIME_FILES,
  verifyPublishedRelease
} from '../scripts/verify-published-release.mjs';

const REPOSITORY = 'test-owner/test-repo';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(await readFile(path.join(ROOT, 'manifest.json'), 'utf8')).version;
const TAG = `v${VERSION}`;
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

async function createReleaseFixture(t, evidenceOverrides = {}) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'p2m-published-release-'));
  t.after(async () => rm(temp, { recursive: true, force: true }));

  const stage = path.join(temp, 'stage');
  await mkdir(stage, { recursive: true });
  for (const relativePath of RELEASE_RUNTIME_FILES) {
    const absolutePath = path.join(stage, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const body = relativePath === 'manifest.json'
      ? `${JSON.stringify({ manifest_version: 3, name: 'Page to Markdown Pro', version: VERSION }, null, 2)}\n`
      : `${relativePath}\n`;
    await writeFile(absolutePath, body);
  }

  const zipPath = path.join(temp, 'page-to-md-pro.zip');
  const zip = spawnSync('zip', ['-X', '-q', zipPath, ...RELEASE_RUNTIME_FILES], {
    cwd: stage,
    encoding: 'utf8'
  });
  assert.equal(zip.status, 0, zip.stderr || zip.stdout);
  const zipBytes = await readFile(zipPath);

  const evidence = {
    schemaVersion: 1,
    repository: REPOSITORY,
    version: VERSION,
    tag: TAG,
    commit: COMMIT,
    eventName: 'push',
    publishType: 'UPLOAD_ONLY',
    skipReview: false,
    chromeWebStoreUpload: 'SUCCEEDED',
    publishSubmission: 'SKIPPED',
    verifiedLogMarkers: [
      'Upload finished successfully.',
      'Skipping publish step.'
    ],
    verifiedAt: '2026-07-19T23:30:00.000Z',
    ...evidenceOverrides
  };
  const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);

  const server = createServer((request, response) => {
    const origin = `http://${request.headers.host}`;
    const releasePath = `/repos/${REPOSITORY}/releases/tags/${TAG}`;
    const tagPath = `/repos/${REPOSITORY}/git/ref/tags/${TAG}`;

    if (request.url === releasePath) {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        tag_name: TAG,
        name: `Page to Markdown Pro ${VERSION}`,
        draft: false,
        prerelease: false,
        target_commitish: COMMIT,
        html_url: `${origin}/release-page`,
        published_at: '2026-07-19T23:30:01.000Z',
        assets: [
          {
            name: 'page-to-md-pro.zip',
            state: 'uploaded',
            size: zipBytes.length,
            browser_download_url: `${origin}/assets/page-to-md-pro.zip`
          },
          {
            name: 'release-evidence.json',
            state: 'uploaded',
            size: evidenceBytes.length,
            browser_download_url: `${origin}/assets/release-evidence.json`
          }
        ]
      }));
      return;
    }

    if (request.url === tagPath) {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ object: { type: 'commit', sha: COMMIT } }));
      return;
    }

    if (request.url === '/assets/page-to-md-pro.zip') {
      response.setHeader('content-type', 'application/zip');
      response.end(zipBytes);
      return;
    }

    if (request.url === '/assets/release-evidence.json') {
      response.setHeader('content-type', 'application/json');
      response.end(evidenceBytes);
      return;
    }

    response.statusCode = 404;
    response.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  return {
    apiBase: `http://127.0.0.1:${address.port}`,
    outputPath: path.join(temp, 'published-release-verification.json'),
    zipSha256: createHash('sha256').update(zipBytes).digest('hex')
  };
}

test('verifies upload-only evidence, release assets, tag target, and ZIP contents', async (t) => {
  const fixture = await createReleaseFixture(t);
  const report = await verifyPublishedRelease({
    repository: REPOSITORY,
    tag: TAG,
    apiBase: fixture.apiBase,
    outputPath: fixture.outputPath
  });

  assert.equal(report.repository, REPOSITORY);
  assert.equal(report.tag, TAG);
  assert.equal(report.version, VERSION);
  assert.equal(report.commit, COMMIT);
  assert.equal(report.chromeWebStoreUpload, 'SUCCEEDED');
  assert.equal(report.publishSubmission, 'SKIPPED');
  assert.equal(report.publishType, 'UPLOAD_ONLY');
  assert.equal(report.zip.sha256, fixture.zipSha256);
  assert.equal(report.zip.entryCount, RELEASE_RUNTIME_FILES.length);
  assert.deepEqual(report.zip.entries, [...RELEASE_RUNTIME_FILES].sort());

  const persisted = JSON.parse(await readFile(fixture.outputPath, 'utf8'));
  assert.deepEqual(persisted, report);
});

test('rejects evidence that requested a publication submission', async (t) => {
  const fixture = await createReleaseFixture(t, {
    publishType: 'DEFAULT_PUBLISH',
    publishSubmission: 'REQUESTED',
    verifiedLogMarkers: ['Upload finished successfully.']
  });

  await assert.rejects(
    verifyPublishedRelease({
      repository: REPOSITORY,
      tag: TAG,
      apiBase: fixture.apiBase,
      outputPath: fixture.outputPath
    }),
    /publishType must be UPLOAD_ONLY/
  );
});
