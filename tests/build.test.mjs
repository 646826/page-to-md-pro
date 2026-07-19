import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

async function zipHash() {
  const bytes = await readFile(path.join(root, 'page-to-md-pro.zip'));
  return createHash('sha256').update(bytes).digest('hex');
}

test('release ZIP has fixed timestamps and reproducible bytes', async () => {
  run('bash', ['scripts/build-zip.sh']);
  const firstHash = await zipHash();
  const entries = run('unzip', ['-Z1', 'page-to-md-pro.zip']).trim().split(/\r?\n/).sort();
  const expectedEntries = [
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
  ].sort();
  assert.deepEqual(entries, expectedEntries);

  const listing = run('unzip', ['-l', 'page-to-md-pro.zip']);
  const fileLines = listing.split(/\r?\n/).filter((line) => expectedEntries.some((entry) => line.endsWith(` ${entry}`)));
  assert.equal(fileLines.length, expectedEntries.length);
  for (const line of fileLines) assert.match(line, /1980-01-01\s+00:00/, line);

  run('bash', ['scripts/build-zip.sh']);
  assert.equal(await zipHash(), firstHash);
});
