import { DEFAULT_OPTIONS, normalizeOptions } from './shared.js';

const OPTION_KEYS = Object.freeze(Object.keys(DEFAULT_OPTIONS));

export async function ensureDefaultOptions(storage = globalThis.chrome?.storage) {
  assertStorage(storage);
  const { syncValues, localValues, syncReadable } = await readBoth(storage);
  const merged = { ...localValues, ...syncValues };
  const missing = {};

  for (const [key, defaultValue] of Object.entries(DEFAULT_OPTIONS)) {
    if (merged[key] === undefined) missing[key] = defaultValue;
  }

  if (Object.keys(missing).length > 0) {
    if (syncReadable) {
      try {
        await storage.sync.set(missing);
      } catch {
        await storage.local.set(missing);
      }
    } else {
      await storage.local.set(missing);
    }
  }

  return normalizeOptions({ ...merged, ...missing });
}

export async function getOptions(storage = globalThis.chrome?.storage) {
  assertStorage(storage);
  const { syncValues, localValues } = await readBoth(storage);
  return normalizeOptions({ ...localValues, ...syncValues });
}

export async function setOptions(storage = globalThis.chrome?.storage, values = {}) {
  assertStorage(storage);
  const normalized = normalizeOptions(values);

  try {
    await storage.sync.set(normalized);
    if (typeof storage.local.remove === 'function') {
      await storage.local.remove(OPTION_KEYS).catch(() => {});
    }
    return { area: 'sync', options: normalized };
  } catch {
    await storage.local.set(normalized);
    return { area: 'local', options: normalized };
  }
}

async function readBoth(storage) {
  let syncValues = {};
  let syncReadable = true;
  try {
    syncValues = await storage.sync.get(OPTION_KEYS);
  } catch {
    syncReadable = false;
  }

  let localValues = {};
  try {
    localValues = await storage.local.get(OPTION_KEYS);
  } catch {
    // Local storage is the last fallback. Returning defaults is safer than
    // failing every capture because browser storage is temporarily broken.
  }

  return {
    syncValues: objectOrEmpty(syncValues),
    localValues: objectOrEmpty(localValues),
    syncReadable
  };
}

function assertStorage(storage) {
  if (!storage?.sync?.get || !storage?.sync?.set || !storage?.local?.get || !storage?.local?.set) {
    throw new TypeError('A Chrome-compatible storage object is required.');
  }
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' ? value : {};
}
