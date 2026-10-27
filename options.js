// options.js — Image Pro settings page logic
import { premium, STORAGE_KEYS, get, set, getCollections, saveCollections, getFavorites, saveFavorites, pushToHistory } from './premium.js';

// ---------- Elements ----------
const licKey = document.getElementById('lic-key');
const licActivate = document.getElementById('lic-activate');
const licStatus = document.getElementById('lic-status');
const licDeactivate = document.getElementById('lic-deactivate');
const licInfo = document.getElementById('lic-info');
const premiumBadge = document.getElementById('opt-premium-badge');
const themeDark = document.getElementById('theme-dark');
const defaultFolder = document.getElementById('default-folder');
const skipTiny = document.getElementById('skip-tiny');
const btnExport = document.getElementById('btn-export');
const btnReset = document.getElementById('btn-reset');
const dataMsg = document.getElementById('data-msg');
const toastEl = document.getElementById('opt-toast');

// ---------- Premium UI ----------
function updatePremiumUI() {
  if (premium.isPremium) {
    premiumBadge.style.display = 'inline-flex';
    licKey.disabled = true;
    licActivate.disabled = true;
    licActivate.textContent = 'Active';
    licDeactivate.style.display = 'inline-block';
    document.querySelectorAll('.premium-gated').forEach(el => el.style.display = 'block');
  } else {
    premiumBadge.style.display = 'none';
    licKey.disabled = false;
    licActivate.disabled = false;
    licActivate.textContent = 'Activate';
    licDeactivate.style.display = 'none';
    document.querySelectorAll('.premium-gated').forEach(el => el.style.display = 'none');
  }
}

function showToast(text, kind) {
  toastEl.textContent = text;
  toastEl.className = 'toast';
  if (kind) toastEl.classList.add(kind);
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ---------- License ----------
async function loadLicense() {
  await premium.init();
  updatePremiumUI();
  const saved = await get(STORAGE_KEYS.LICENSE_KEY, '');
  if (saved) licKey.value = saved;
  if (premium.isPremium) licStatus.textContent = 'Pro is active.';
}

licActivate.addEventListener('click', async () => {
  const key = licKey.value.trim();
  if (!key) { licStatus.textContent = 'Enter a key first.'; return; }
  licActivate.disabled = true;
  licActivate.textContent = 'Activating…';
  try {
    await premium.validateLicense(key);
    licStatus.textContent = 'Pro activated!';
    licStatus.style.color = 'var(--brand)';
    updatePremiumUI();
    showToast('Pro activated');
  } catch (e) {
    licStatus.textContent = e.message;
    licStatus.style.color = 'var(--danger)';
    licActivate.disabled = false;
    licActivate.textContent = 'Activate';
  }
});

licDeactivate.addEventListener('click', async () => {
  await premium.deactivate();
  licKey.disabled = false;
  licKey.value = '';
  licActivate.disabled = false;
  licActivate.textContent = 'Activate';
  licDeactivate.style.display = 'none';
  licStatus.textContent = '';
  updatePremiumUI();
  showToast('Pro deactivated');
});

licInfo.addEventListener('click', () => {
  showToast('In this build any 4+ char key activates Pro. Replace validateLicense() in premium.js with your real license server before publishing.', 'warn');
});

// ---------- Settings ----------
async function loadSettings() {
  const theme = await get(STORAGE_KEYS.THEME, 'system');
  themeDark.checked = theme === 'dark';
  const folder = await get('ip_default_folder', '');
  defaultFolder.value = folder;
  const skip = await get('ip_skip_tiny', false);
  skipTiny.checked = skip;
}

themeDark.addEventListener('change', async () => {
  await set({ [STORAGE_KEYS.THEME]: themeDark.checked ? 'dark' : 'light' });
  chrome.runtime.sendMessage({ action: 'theme-changed', theme: themeDark.checked ? 'dark' : 'light' });
  showToast(themeDark.checked ? 'Dark mode on' : 'Light mode on');
});

defaultFolder.addEventListener('change', async () => {
  await set({ 'ip_default_folder': defaultFolder.value.trim() });
  showToast('Default folder saved');
});

skipTiny.addEventListener('change', async () => {
  await set({ 'ip_skip_tiny': skipTiny.checked });
  showToast(skipTiny.checked ? 'Skip tiny images on' : 'Skip tiny images off');
});

// ---------- Data ----------
btnExport.addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'image-pro-settings-backup.json', saveAs: true });
  URL.revokeObjectURL(url);
  showToast('Settings exported');
});

btnReset.addEventListener('click', async () => {
  if (!confirm('Reset all settings, collections and history? This cannot be undone.')) return;
  await chrome.storage.local.clear();
  await premium.deactivate();
  location.reload();
  showToast('All data reset');
});

// ---------- Init ----------
loadLicense();
loadSettings();

premium.onChange(updatePremiumUI);
