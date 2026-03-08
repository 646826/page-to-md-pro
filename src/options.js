const DEFAULT_OPTIONS = {
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
};

const fields = Object.keys(DEFAULT_OPTIONS);

init().catch((error) => {
  console.error('Could not initialize options page:', error);
});

async function init() {
  const values = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  for (const key of fields) {
    const element = document.getElementById(key);
    if (!element) continue;

    if (element.type === 'checkbox') {
      element.checked = Boolean(values[key]);
    } else {
      element.value = values[key];
    }
  }

  document.getElementById('saveButton').addEventListener('click', save);
}

async function save() {
  const payload = {};
  for (const key of fields) {
    const element = document.getElementById(key);
    if (!element) continue;

    if (element.type === 'checkbox') {
      payload[key] = element.checked;
    } else if (element.type === 'number') {
      payload[key] = Number(element.value || DEFAULT_OPTIONS[key]);
    } else {
      payload[key] = element.value;
    }
  }

  payload.maxFilenameLength = Math.max(40, Math.min(200, Number(payload.maxFilenameLength || 120)));

  await chrome.storage.sync.set(payload);
  const status = document.getElementById('status');
  status.textContent = 'Saved.';
  setTimeout(() => {
    status.textContent = '';
  }, 1500);
}
