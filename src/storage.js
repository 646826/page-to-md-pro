import { DEFAULT_OPTIONS, normalizeOptions } from './shared.js';

const OPTION_KEYS = Object.freeze(Object.keys(DEFAULT_OPTIONS));
const PENDING_OPTIONS_KEY = 'pageToMdPendingOptions';
const LOCAL_KEYS = Object.freeze([...OPTION_KEYS, PENDING_OPTIONS_KEY]);

export async function ensureDefaultOptions(storage = globalThis.chrome?.storage) {
  assertStorage(storage);
  const snapshot = await readBoth(storage);
  const merged = mergeValues(snapshot);
  const missing = {};

  for (const [key, defaultValue] of Object.entries(DEFAULT_OPTIONS)) {
    if (merged[key] === undefined) missing[key] = defaultValue;
  }

  if (Object.keys(missing).length > 0) {
    if (snapshot.syncReadable) {
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
  return normalizeOptions(mergeValues(await readBoth(storage)));
}

export async function setOptions(storage = globalThis.chrome?.storage, values = {}) {
  assertStorage(storage);
  const normalized = normalizeOptions(values);
  // Keep legacy flat keys for fallback compatibility. The marker distinguishes
  // a newly unsynced user choice from old local data that should defer to sync.
  const pending = { ...normalized, [PENDING_OPTIONS_KEY]: normalized };
  try {
    await storage.sync.set(normalized);
  } catch {
    await storage.local.set(pending);
    return { area: 'local', options: normalized };
  }

  try {
    if (typeof storage.local.remove !== 'function') throw new Error('Local cleanup unavailable.');
    await storage.local.remove(LOCAL_KEYS);
  } catch {
    // If cleanup fails, replace the old pending choice rather than allowing it
    // to override the successful save. Surface a second write failure honestly.
    await storage.local.set(pending);
  }
  return { area: 'sync', options: normalized };
}

function mergeValues({ localValues, syncValues }) {
  const pending = objectOrEmpty(localValues[PENDING_OPTIONS_KEY]);
  return { ...localValues, ...syncValues, ...pending };
}

async function readBoth(storage) {
  // Independent reads need not add their latencies together.
  const [sync, local] = await Promise.all([
    readArea(storage.sync, OPTION_KEYS),
    readArea(storage.local, LOCAL_KEYS)
  ]);
  return { syncValues: sync.values, localValues: local.values, syncReadable: sync.readable };
}

async function readArea(area, keys) {
  try {
    return { values: objectOrEmpty(await area.get(keys)), readable: true };
  } catch {
    // A failure in one area must not discard the other area's usable settings.
    return { values: {}, readable: false };
  }
}

function assertStorage(storage) {
  if (!storage?.sync?.get || !storage?.sync?.set || !storage?.local?.get || !storage?.local?.set) {
    throw new TypeError('A Chrome-compatible storage object is required.');
  }
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
