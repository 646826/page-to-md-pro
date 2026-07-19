import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const runtimeFiles = [
  'manifest.json',
  'src/background.js',
  'src/content.js',
  'src/shared.js',
  'src/storage.js',
  'src/offscreen.html',
  'src/offscreen.js',
  'src/options.html',
  'src/options.js',
  'src/options.css',
  'lib/Readability.js',
  'assets/icon16.png',
  'assets/icon32.png',
  'assets/icon48.png',
  'assets/icon128.png'
].sort();

const [manifest, pkg, lock] = await Promise.all([
  readJson('manifest.json'), readJson('package.json'), readJson('package-lock.json')
]);

assert(manifest.manifest_version === 3, 'manifest_version must be 3');
assert(typeof manifest.description === 'string' && manifest.description.length <= 132, 'manifest description must be 132 characters or fewer');
assert(manifest.version === '0.2.0', 'manifest version must be 0.2.0');
assert(pkg.version === manifest.version, 'package and manifest versions must match');
assert(lock.version === manifest.version && lock.packages?.['']?.version === manifest.version, 'lockfile version metadata must match');
assert(manifest.background?.type === 'module', 'background service worker must be a module');
assert(manifest.minimum_chrome_version === '109', 'minimum Chrome version must be 109');
assert(!manifest.host_permissions, 'host_permissions are not allowed');
assert(!manifest.content_scripts, 'static content scripts are not allowed');

const permissions = [...(manifest.permissions || [])].sort();
const expectedPermissions = ['activeTab', 'contextMenus', 'downloads', 'offscreen', 'scripting', 'storage'].sort();
assert(JSON.stringify(permissions) === JSON.stringify(expectedPermissions), 'permission set changed unexpectedly');

for (const relativePath of runtimeFiles) await access(path.join(root, relativePath));
for (const htmlPath of ['src/options.html', 'src/offscreen.html']) {
  const html = await readFile(path.join(root, htmlPath), 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    assert(/\btype=["']module["']/i.test(match[1]), `${htmlPath} contains a non-module script`);
    assert(!/\bsrc=["']https?:/i.test(match[1]), `${htmlPath} contains remote code`);
  }
}

const zipPath = path.join(root, 'page-to-md-pro.zip');
try {
  await access(zipPath);
  const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  assert(result.status === 0, result.stderr || 'Could not inspect release ZIP');
  const entries = result.stdout.split(/\r?\n/).filter(Boolean).sort();
  assert(JSON.stringify(entries) === JSON.stringify(runtimeFiles), `ZIP entries differ from the runtime allowlist:\n${entries.join('\n')}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log(`Package validation passed for version ${manifest.version} (${runtimeFiles.length} runtime files).`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
