import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OPTIONS,
  buildFilename,
  isSupportedTabUrl,
  isTransientCaptureError,
  normalizeOptions,
  toErrorInfo,
  withTimeout
} from '../src/shared.js';

test('normalizeOptions clamps hostile stored values and preserves valid values', () => {
  const normalized = normalizeOptions({
    actionMode: 'invalid',
    includeFrontMatter: false,
    prependTitleHeadingIfMissing: 'false',
    includeSourceLink: true,
    includeImages: 0,
    stripTrackingParams: false,
    saveAs: 'yes',
    maxFilenameLength: 9999,
    prependDateToFilename: true,
    tableMode: 'invalid'
  });

  assert.deepEqual(normalized, {
    actionMode: 'auto',
    includeFrontMatter: false,
    prependTitleHeadingIfMissing: true,
    includeSourceLink: true,
    includeImages: true,
    stripTrackingParams: false,
    saveAs: false,
    maxFilenameLength: 200,
    prependDateToFilename: true,
    tableMode: 'smart'
  });
  assert.equal(Object.isFrozen(DEFAULT_OPTIONS), true);
});

test('isSupportedTabUrl allows only http, https, and file pages', () => {
  for (const url of [
    'https://example.com/a',
    'http://localhost:3000/',
    'file:///tmp/article.html'
  ]) {
    assert.equal(isSupportedTabUrl(url), true, url);
  }

  for (const url of [
    '',
    'chrome://settings/',
    'edge://extensions/',
    'about:blank',
    'view-source:https://example.com/',
    'javascript:alert(1)',
    'data:text/html,hello',
    'not a url'
  ]) {
    assert.equal(isSupportedTabUrl(url), false, url);
  }
});

test('buildFilename handles reserved Windows names and fixed dates', () => {
  const options = normalizeOptions({ prependDateToFilename: true, maxFilenameLength: 120 });
  const now = new Date('2026-07-19T12:00:00Z');

  assert.equal(buildFilename({ meta: { title: 'CON' } }, options, now), '2026-07-19-_CON.md');
  assert.equal(buildFilename({ meta: { title: '  A / B : C  ' } }, options, now), '2026-07-19-A B C.md');
});

test('buildFilename truncates by Unicode code point without splitting surrogate pairs', () => {
  const title = `${'a'.repeat(39)}😀😀`;
  const filename = buildFilename(
    { meta: { title } },
    normalizeOptions({ maxFilenameLength: 40 }),
    new Date('2026-07-19T12:00:00Z')
  );

  assert.equal(filename, `${'a'.repeat(39)}😀.md`);
  assert.equal(filename.includes('\uFFFD'), false);
});

test('isTransientCaptureError recognizes only retryable extension messaging failures', () => {
  for (const message of [
    'Could not establish connection. Receiving end does not exist.',
    'The message port closed before a response was received.',
    'Extension context invalidated.',
    'No frame with id 3 in tab 10.'
  ]) {
    assert.equal(isTransientCaptureError(new Error(message)), true, message);
  }

  for (const message of [
    'Could not determine a usable content root for this page.',
    'Unsupported URL',
    'Download interrupted'
  ]) {
    assert.equal(isTransientCaptureError(new Error(message)), false, message);
  }
});

test('withTimeout rejects with a stable code and clears after resolution', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, 'CAPTURE_TIMEOUT', 'Capture timed out'),
    (error) => error.code === 'CAPTURE_TIMEOUT' && error.message === 'Capture timed out'
  );

  assert.equal(await withTimeout(Promise.resolve('ok'), 50, 'TIMEOUT'), 'ok');
});

test('toErrorInfo removes stack data and keeps stable codes', () => {
  const error = new Error('boom');
  error.code = 'KNOWN';
  error.stack = 'sensitive stack';

  assert.deepEqual(toErrorInfo(error), { code: 'KNOWN', message: 'boom' });
  assert.deepEqual(toErrorInfo('bad value', 'FALLBACK'), { code: 'FALLBACK', message: 'bad value' });
});
