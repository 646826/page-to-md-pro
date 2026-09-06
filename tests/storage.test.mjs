import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPTIONS } from '../src/shared.js';
import { ensureDefaultOptions, getOptions, setOptions } from '../src/storage.js';

function createArea(initial = {}, { getError = null, setError = null } = {}) {
  const data = { ...initial };
  const calls = { get: 0, set: 0, remove: 0, lastGetKeys: undefined };
  return {
    data,
    calls,
    async get(keys) {
      calls.get += 1;
      calls.lastGetKeys = keys;
      if (getError) throw getError;
      if (keys === undefined || keys === null) return { ...data };
      if (typeof keys === 'string') return keys in data ? { [keys]: data[keys] } : {};
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]));
      }
      if (keys && typeof keys === 'object') {
        const output = { ...keys };
        for (const key of Object.keys(keys)) if (key in data) output[key] = data[key];
        return output;
      }
      return {};
    },
    async set(values) {
      calls.set += 1;
      if (setError) throw setError;
      Object.assign(data, values);
    },
    async remove(keys) {
      calls.remove += 1;
      for (const key of keys) delete data[key];
    }
  };
}

function createStorage({ sync = {}, local = {}, syncOptions = {}, localOptions = {} } = {}) {
  return {
    sync: createArea(sync, syncOptions),
    local: createArea(local, localOptions)
  };
}

test('getOptions prefers readable sync values over stale local fallbacks', async () => {
  const storage = createStorage({
    sync: { actionMode: 'main', maxFilenameLength: 90 },
    local: { actionMode: 'full' }
  });

  const options = await getOptions(storage);
  assert.equal(options.actionMode, 'main');
  assert.equal(options.maxFilenameLength, 90);
});

test('getOptions falls back completely when sync storage rejects', async () => {
  const storage = createStorage({
    local: { actionMode: 'full' },
    syncOptions: { getError: new Error('sync unavailable') }
  });

  const options = await getOptions(storage);
  assert.equal(options.actionMode, 'full');
  assert.equal(storage.local.calls.get, 1);
});

test('setOptions writes local fallback when sync rejects', async () => {
  const storage = createStorage({ syncOptions: { setError: new Error('quota') } });
  const saved = await setOptions(storage, { actionMode: 'main', maxFilenameLength: 80 });

  assert.equal(saved.area, 'local');
  assert.equal(storage.local.data.actionMode, 'main');
  assert.equal(storage.local.data.maxFilenameLength, 80);
});

test('setOptions clears stale local overrides after successful sync write', async () => {
  const storage = createStorage({ local: { actionMode: 'full', maxFilenameLength: 77 } });
  const saved = await setOptions(storage, { actionMode: 'main' });

  assert.equal(saved.area, 'sync');
  assert.equal(storage.sync.data.actionMode, 'main');
  assert.equal(storage.local.data.actionMode, undefined);
  assert.equal(storage.local.calls.remove, 1);
});

test('ensureDefaultOptions writes only keys missing from both areas', async () => {
  const storage = createStorage({
    sync: { actionMode: 'main' },
    local: { includeImages: false }
  });

  const result = await ensureDefaultOptions(storage);
  assert.equal(result.actionMode, 'main');
  assert.equal(result.includeImages, false);
  assert.equal(storage.sync.calls.set, 1);
  assert.equal(storage.sync.data.tableMode, DEFAULT_OPTIONS.tableMode);
  assert.equal(storage.sync.data.actionMode, 'main');
});


test('storage reads request the explicit option key list', async () => {
  const storage = createStorage({ sync: { actionMode: 'main' } });
  await getOptions(storage);
  assert.deepEqual(storage.sync.calls.lastGetKeys, Object.keys(DEFAULT_OPTIONS));
  assert.deepEqual(storage.local.calls.lastGetKeys, [...Object.keys(DEFAULT_OPTIONS), 'pageToMdPendingOptions']);
});
