import { DEFAULT_OPTIONS, normalizeOptions } from './shared.js';
import { getOptions, setOptions } from './storage.js';

const fields = Object.keys(DEFAULT_OPTIONS);
const saveButton = document.getElementById('saveButton');
const status = document.getElementById('status');

void initialize();

async function initialize() {
  try {
    const values = await getOptions(chrome.storage);
    writeForm(values);
    saveButton?.addEventListener('click', () => void save());
  } catch (error) {
    showStatus(`Could not load settings: ${error?.message || 'unknown error'}`, true);
  }
}

function writeForm(values) {
  const normalized = normalizeOptions(values);
  for (const key of fields) {
    const element = document.getElementById(key);
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = Boolean(normalized[key]);
    else element.value = String(normalized[key]);
  }
}

function readForm() {
  const values = {};
  for (const key of fields) {
    const element = document.getElementById(key);
    if (!element) continue;
    if (element.type === 'checkbox') values[key] = element.checked;
    else if (element.type === 'number') values[key] = Number(element.value);
    else values[key] = element.value;
  }
  return normalizeOptions(values);
}

async function save() {
  saveButton.disabled = true;
  showStatus('Saving…');
  try {
    await setOptions(chrome.storage, readForm());
    showStatus('Saved.');
    setTimeout(() => {
      if (status?.textContent === 'Saved.') showStatus('');
    }, 1800);
  } catch (error) {
    showStatus(`Could not save settings: ${error?.message || 'unknown error'}`, true);
  } finally {
    saveButton.disabled = false;
  }
}

function showStatus(message, isError = false) {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', isError);
}
