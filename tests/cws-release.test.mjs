import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function runRelease(publishType) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'p2m-cws-'));
  const bin = path.join(temp, 'bin');
  const log = path.join(temp, 'curl.log');
  const packageFile = path.join(temp, 'extension.zip');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(bin));
  await writeFile(packageFile, 'fixture');
  const fakeCurl = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${log}"
out=''
url=''
while (($#)); do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    -w|-H|-X|-T|-d)
      shift 2
      ;;
    --silent|--show-error)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
if [[ "$url" == *':upload' ]]; then
  body='{"uploadState":"SUCCEEDED"}'
elif [[ "$url" == *':publish' ]]; then
  body='{"state":"PUBLISHED_WITH_FRICTION"}'
elif [[ "$url" == *':fetchStatus' ]]; then
  body='{"lastAsyncUploadState":"SUCCEEDED"}'
else
  body='{}'
fi
printf '%s' "$body" > "$out"
printf '200'
`;
  const fakeNode = `#!/usr/bin/env bash
exec "${process.execPath}" "$@"
`;
  await writeFile(path.join(bin, 'curl'), fakeCurl);
  await writeFile(path.join(bin, 'node'), fakeNode);
  await chmod(path.join(bin, 'curl'), 0o755);
  await chmod(path.join(bin, 'node'), 0o755);

  const result = spawnSync('bash', ['scripts/cws-release.sh', packageFile], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CWS_ACCESS_TOKEN: 'token',
      CWS_PUBLISHER_ID: 'publisher',
      CWS_EXTENSION_ID: 'extension',
      CWS_PUBLISH_TYPE: publishType,
      CWS_SKIP_REVIEW: 'false'
    }
  });
  const calls = await readFile(log, 'utf8').catch(() => '');
  await rm(temp, { recursive: true, force: true });
  return { ...result, calls };
}

test('UPLOAD_ONLY uploads but never calls the publish endpoint', async () => {
  const result = await runRelease('UPLOAD_ONLY');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.calls, /:upload/);
  assert.doesNotMatch(result.calls, /:publish/);
  assert.match(result.stdout, /Skipping publish step\./);
});

test('rejects an unknown publish type before making a network request', async () => {
  const result = await runRelease('UNSAFE_UNKNOWN_MODE');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported CWS_PUBLISH_TYPE/);
  assert.equal(result.calls, '');
});
