export const DEFAULT_OPTIONS = Object.freeze({
  actionMode: 'auto',
  includeFrontMatter: true,
  prependTitleHeadingIfMissing: true,
  includeSourceLink: true,
  includeImages: true,
  stripTrackingParams: true,
  saveAs: false,
  maxFilenameLength: 120,
  prependDateToFilename: false,
  tableMode: 'smart'
});

const ACTION_MODES = new Set(['auto', 'main', 'full']);
const TABLE_MODES = new Set(['smart', 'markdown', 'html']);
const WINDOWS_RESERVED_NAME_RE = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const TRANSIENT_CAPTURE_ERROR_RE = /(?:receiving end does not exist|could not establish connection|message port closed|extension context invalidated|no frame with id|frame with id .* was removed|the tab was closed|cannot access contents of the page|cannot access a chrome:\/\/ url)/i;

export function normalizeOptions(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    actionMode: ACTION_MODES.has(value.actionMode) ? value.actionMode : DEFAULT_OPTIONS.actionMode,
    includeFrontMatter: value.includeFrontMatter !== false,
    prependTitleHeadingIfMissing: value.prependTitleHeadingIfMissing !== false,
    includeSourceLink: value.includeSourceLink !== false,
    includeImages: value.includeImages !== false,
    stripTrackingParams: value.stripTrackingParams !== false,
    saveAs: value.saveAs === true,
    maxFilenameLength: clampInteger(value.maxFilenameLength, 40, 200, DEFAULT_OPTIONS.maxFilenameLength),
    prependDateToFilename: value.prependDateToFilename === true,
    tableMode: TABLE_MODES.has(value.tableMode) ? value.tableMode : DEFAULT_OPTIONS.tableMode
  };
}

export function isSupportedTabUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'file:';
  } catch {
    return false;
  }
}

export function buildFilename(result, rawOptions = DEFAULT_OPTIONS, now = new Date()) {
  const options = normalizeOptions(rawOptions);
  const source = result?.meta?.title || result?.meta?.siteName || 'page';
  let title = sanitizeFilename(source, options.maxFilenameLength);
  if (WINDOWS_RESERVED_NAME_RE.test(title)) title = `_${title}`;
  const prefix = options.prependDateToFilename ? `${datePrefix(now)}-` : '';
  return `${prefix}${title || 'page'}.md`;
}

export function sanitizeFilename(input, maxLength = DEFAULT_OPTIONS.maxFilenameLength) {
  const limit = clampInteger(maxLength, 10, 240, DEFAULT_OPTIONS.maxFilenameLength);
  let value = String(input ?? '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]+/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');

  if (!value) return 'page';
  value = Array.from(value).slice(0, limit).join('').trim().replace(/[. ]+$/g, '');
  return value || 'page';
}

export function isTransientCaptureError(error) {
  return TRANSIENT_CAPTURE_ERROR_RE.test(errorMessage(error));
}

export function codedError(code, message, cause) {
  const error = new Error(message || code || 'Unknown error', cause === undefined ? undefined : { cause });
  error.code = code || 'UNKNOWN';
  return error;
}

export function withTimeout(value, timeoutMs, code = 'TIMEOUT', message = 'Operation timed out') {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve(value);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(codedError(code, message)), ms);
    Promise.resolve(value).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function toErrorInfo(error, fallbackCode = 'UNKNOWN') {
  const code = typeof error?.code === 'string' && error.code ? error.code : fallbackCode;
  return {
    code,
    message: errorMessage(error) || 'Unknown error'
  };
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function datePrefix(now) {
  const date = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function errorMessage(error) {
  if (typeof error === 'string') return error;
  if (error && typeof error.message === 'string') return error.message;
  try {
    return String(error ?? '');
  } catch {
    return '';
  }
}
