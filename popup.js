// popup.js — Image Pro v2.0 popup logic
// Imports the shared premium module for feature gating.
import { premium, FEATURE_LIMITS, pushToHistory, get, set, getCollections, saveCollections, getFavorites, saveFavorites } from './premium.js';

// ---------- Elements ----------
const gallery = document.getElementById('image-gallery');
const galleryWrap = document.getElementById('gallery-wrap');
const statusMessage = document.getElementById('status-message');
const statusDot = document.getElementById('status-dot');
const pageCount = document.getElementById('page-count');
const pageCountLabel = document.getElementById('page-count-label');
const selectedCount = document.getElementById('selected-count');
const downloadCount = document.getElementById('download-count');
const downloadBtn = document.getElementById('download-btn');
const scanAllTabsBtn = document.getElementById('scan-all-tabs-btn');
const minWidthInput = document.getElementById('min-width');
const minHeightInput = document.getElementById('min-height');
const onlyLinksCheckbox = document.getElementById('only-links-checkbox');
const applyFiltersBtn = document.getElementById('apply-filters-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const folderNameInput = document.getElementById('folder-name');
const settingsBtn = document.getElementById('settings-btn');
const sidepanelBtn = document.getElementById('sidepanel-btn');
const licenseBtn = document.getElementById('license-btn');
const premiumBadge = document.getElementById('premium-badge');
const tierLabel = document.getElementById('tier-label');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const formatChips = document.getElementById('format-chips');
const filtersToggle = document.getElementById('filters-toggle');
const advancedFilters = document.getElementById('advanced-filters');
const toastEl = document.getElementById('toast');

const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbTitle = document.getElementById('lb-title');
const lbSub = document.getElementById('lb-sub');
const lbClose = document.getElementById('lb-close');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');
const lbDownload = document.getElementById('lb-download');
const lbCopy = document.getElementById('lb-copy');
const lbOpen = document.getElementById('lb-open');
const lbEdit = document.getElementById('lb-edit');

// ---------- State ----------
const state = {
  images: [],
  filtered: [],
  selection: new Map(),
  formats: new Set(),
  search: '',
  sort: 'default',
  minW: 0,
  minH: 0,
  onlyLinks: false,
  lastIndex: null,
  loading: true,
  lightboxIndex: -1,
  source: 'current',
};

let searchTimer = null;
let toastTimer = null;
let batchTimer = null;

// ---------- Theme ----------
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
function loadTheme() {
  chrome.storage.local.get(['theme'], (r) => applyTheme(r.theme === 'light' ? 'light' : 'dark'));
}
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ---------- Premium UI ----------
function updatePremiumUI() {
  if (premium.isPremium) {
    premiumBadge.style.display = 'inline-flex';
    tierLabel.textContent = 'Pro';
    sidepanelBtn.style.display = 'block';
    lbEdit.style.display = 'block';
  } else {
    premiumBadge.style.display = 'none';
    tierLabel.textContent = 'Free';
    sidepanelBtn.style.display = 'none';
    lbEdit.style.display = 'none';
  }
}

// Show license modal
function showLicenseModal() {
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.zIndex = '900';
  modal.style.background = 'rgba(8,9,11,0.45)';
  modal.style.backdropFilter = 'blur(6px)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';

  const card = document.createElement('div');
  card.style.background = 'var(--surface)';
  card.style.borderRadius = 'var(--radius-lg)';
  card.style.padding = '24px';
  card.style.width = 'min(360px, 88vw)';
  card.style.border = '1px solid var(--line)';
  card.style.boxShadow = 'var(--shadow)';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '14px';

  card.innerHTML = `
    <div style="font-size:17px;font-weight:800">Unlock Image Pro</div>
    <div style="font-size:12.5px;color:var(--muted);line-height:1.5">
      Get ZIP downloads, side panel, image editor, collections, download history and unlimited batch downloads.
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <input type="text" id="lic-key" placeholder="Enter license key" class="input" style="font-size:12px;padding:10px">
      <div style="font-size:11px;color:var(--muted-2)">Any key of 4+ chars activates Pro in this build.</div>
      <div style="display:flex;gap:8px">
        <button id="lic-cancel" class="btn btn-ghost" style="flex:1">Not now</button>
        <button id="lic-activate" class="btn btn-premium btn-full">Activate Pro</button>
      </div>
      <div id="lic-msg" style="font-size:11px;color:var(--danger);height:14px"></div>
    </div>
  `;

  modal.appendChild(card);
  document.body.appendChild(modal);

  const keyInput = modal.querySelector('#lic-key');
  const msg = modal.querySelector('#lic-msg');
  const activate = modal.querySelector('#lic-activate');
  const cancel = modal.querySelector('#lic-cancel');

  activate.addEventListener('click', async () => {
    try {
      await premium.validateLicense(keyInput.value);
      modal.remove();
      updatePremiumUI();
      showToast('Pro activated');
    } catch (e) {
      msg.textContent = e.message;
    }
  });
  cancel.addEventListener('click', () => modal.remove());
  keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') activate.click(); });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  keyInput.focus();
}

// ---------- Helpers ----------
function escapeAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeHtml(str) { return escapeAttr(str).replace(/'/g,'&#39;'); }
function getFormat(url) {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const m = clean.match(/\.([a-zA-Z0-9]+)$/);
    const ext = m ? m[1].toLowerCase() : '';
    if (ext === 'jpeg') return 'jpg';
    if (['jpg','png','gif','webp','avif','svg','bmp','tiff','ico','jxl','heic'].includes(ext)) return ext;
    return 'other';
  } catch(e) { return 'other'; }
}
function basename(url) {
  try { const clean = url.split('?')[0].split('#')[0]; const part = clean.split('/').pop() || ''; return decodeURIComponent(part) || 'image'; } catch(e) { return 'image'; }
}
function area(img) { return (img.width||0)*(img.height||0); }
function isSelected(url) { return state.selection.has(url) ? state.selection.get(url) : true; }
function sanitizeFilename(name) { return String(name).replace(/[\\/:*?"<>|]/g,'_').trim() || 'image'; }

function setStatus(text, kind) {
  statusMessage.textContent = text;
  statusDot.className = 'status-dot' + (kind ? ' ' + kind : '');
}
function showToast(text, kind) {
  toastEl.textContent = text;
  toastEl.className = 'toast';
  if (kind) toastEl.classList.add(kind);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ---------- Scan current tab ----------
function requestImagesFromCurrentTab(doneCallback) {
  state.loading = true;
  state.source = 'current';
  setStatus('Scanning this page…', 'busy');
  showSkeleton();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab) {
      state.loading = false; setStatus('No active tab.', 'error'); render();
      if (doneCallback) doneCallback([]);
      return;
    }
    chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ['content.js'] }, () => {
      if (chrome.runtime.lastError) {
        state.loading = false; setStatus('Cannot scan this page.', 'error'); render();
        if (doneCallback) doneCallback([]);
        return;
      }
      chrome.tabs.sendMessage(activeTab.id, { action: 'getImagesFromTab' }, (response) => {
        state.loading = false;
        if (chrome.runtime.lastError) { setStatus('Could not read this page.', 'error'); render(); if (doneCallback) doneCallback([]); return; }
        state.images = (response && response.images) ? response.images : [];
        state.selection = new Map();
        state.lastIndex = null;
        if (state.images.length === 0) setStatus('No images found on this page.', 'error');
        else {
          const unknown = state.images.filter(i => !i.width || !i.height).length;
          setStatus(unknown > 0 ? `Found ${state.images.length} images — sizing…` : `Found ${state.images.length} images.`, unknown > 0 ? 'busy' : 'ok');
        }
        render();
        if (doneCallback) doneCallback(state.images);
      });
    });
  });
}

// ---------- Scan all tabs ----------
function requestImagesFromAllTabs(doneCallback) {
  state.loading = true;
  state.source = 'all';
  setStatus('Scanning all tabs…', 'busy');
  showSkeleton();

  chrome.runtime.sendMessage({ action: 'searchAllTabsForImages' }, (response) => {
    state.loading = false;
    if (chrome.runtime.lastError || !response) { setStatus('Scan failed.', 'error'); render(); if (doneCallback) doneCallback([]); return; }
    state.images = response.images || [];
    state.selection = new Map();
    state.lastIndex = null;
    if (state.images.length === 0) setStatus('No images across tabs.', 'error');
    else setStatus(`Found ${state.images.length} images across tabs.`, 'ok');
    render();
    if (doneCallback) doneCallback(state.images);
  });
}

// ---------- Live size updates ----------
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'dimsUpdate' && Array.isArray(request.updates)) {
    const byUrl = new Map(request.updates.map(u => [u.url, u]));
    let changed = false;
    state.images.forEach(img => { const u = byUrl.get(img.url); if (u && (!img.width || !img.height)) { img.width = u.width; img.height = u.height; changed = true; } });
    if (changed) render();
    if (request.done) setStatus(`Found ${state.images.length} images.`, 'ok');
  }
});

// ---------- Rendering ----------
function showSkeleton() {
  gallery.innerHTML = Array.from({ length: 9 }, () => '<div class="skeleton" style="height:110px"></div>').join('');
}

function computeFiltered() {
  const q = state.search.trim().toLowerCase();
  let list = state.images.filter(img => {
    if (q) { const hay = (img.url + ' ' + (img.alt||'')).toLowerCase(); if (!hay.includes(q)) return false; }
    if (state.formats.size && !state.formats.has(getFormat(img.url))) return false;
    const unknown = !img.width && !img.height;
    if (!unknown && (img.width < state.minW || img.height < state.minH)) return false;
    if (state.onlyLinks && img.type !== 'link') return false;
    return true;
  });
  if (state.sort === 'largest') list = list.slice().sort((a,b) => area(b) - area(a));
  else if (state.sort === 'smallest') list = list.slice().sort((a,b) => area(a) - area(b));
  else if (state.sort === 'name') list = list.slice().sort((a,b) => basename(a.url).localeCompare(basename(b.url)));
  return list;
}

function render() {
  const scrollTop = galleryWrap.scrollTop;
  state.filtered = computeFiltered();

  if (state.loading) { showSkeleton(); updateCounts(); return; }

  if (state.filtered.length === 0) {
    gallery.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="m21 16-5-5-4 4-2-2-7 7"></path></svg>
        <span class="empty-title">${state.images.length ? 'No matches' : 'No images yet'}</span>
        <span class="empty-sub">${state.images.length ? 'Try clearing filters or lowering the minimum size.' : 'Open a page with images, then reopen this popup.'}</span>
      </div>`;
  } else {
    gallery.innerHTML = state.filtered.map((img, index) => cardHTML(img, index)).join('');
    bindCards();
  }
  updateCounts();
  galleryWrap.scrollTop = scrollTop;
}

function cardHTML(img, index) {
  const selected = isSelected(img.url);
  const dims = (img.width && img.height) ? `${img.width}×${img.height}` : '—';
  const fmt = getFormat(img.url);
  const alt = img.alt || '';
  const premiumIcon = premium.isPremium ? '' : `<span class="premium-badge" style="position:absolute;right:6px;top:6px;padding:2px 6px;font-size:8px">Premium</span>`;
  return `
    <div class="card ${selected ? 'selected' : ''}" data-url="${escapeAttr(img.url)}" data-index="${index}" tabindex="0" role="checkbox" aria-checked="${selected}" title="${escapeAttr(img.url)}">
      <img src="${escapeAttr(img.url)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async">
      <span class="check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"></path></svg></span>
      <span class="fmt">${escapeHtml(fmt)}</span>
      <span class="badge">${dims}</span>
      <button type="button" class="open" data-open="${index}" aria-label="Preview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg></button>
    </div>`;
}

function bindCards() {
  gallery.querySelectorAll('.card').forEach(card => {
    const index = parseInt(card.dataset.index, 10);
    card.addEventListener('click', (e) => { if (e.target.closest('.open')) return; toggleSelection(index, e.shiftKey); });
    card.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleSelection(index, e.shiftKey); } });
    card.querySelector('img').addEventListener('error', function(){ this.src = 'icons/icon48.svg'; this.title = 'Broken image'; });
    card.querySelector('.open').addEventListener('click', (e) => { e.stopPropagation(); openLightbox(index); });
  });
}

function updateCounts() {
  const total = state.images.length;
  pageCount.textContent = total;
  pageCountLabel.textContent = total === 1 ? 'image found' : 'images found';
  const selected = state.filtered.filter(img => isSelected(img.url)).length;
  selectedCount.textContent = selected;
  downloadCount.textContent = selected;
  const max = premium.limit('maxDownloadsPerBatch');
  if (!premium.isPremium && selected > max) {
    downloadBtn.disabled = true;
    downloadBtn.title = `Free tier: max ${max} per batch. Upgrade for unlimited.`;
  } else {
    downloadBtn.disabled = false;
    downloadBtn.title = '';
  }
}

function syncSelectionUI() {
  gallery.querySelectorAll('.card').forEach(card => {
    const url = card.dataset.url;
    const selected = isSelected(url);
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-checked', String(selected));
  });
  updateCounts();
}

function toggleSelection(index, shiftKey) {
  const list = state.filtered;
  if (!list[index]) return;
  const url = list[index].url;
  if (shiftKey && state.lastIndex !== null) {
    const start = Math.min(state.lastIndex, index), end = Math.max(state.lastIndex, index);
    const target = !isSelected(url);
    for (let i = start; i <= end; i++) state.selection.set(list[i].url, target);
  } else {
    state.selection.set(url, !isSelected(url));
  }
  state.lastIndex = index;
  syncSelectionUI();
}

// ---------- Filters ----------
function updateFilterBadge() { filtersToggle.classList.toggle('active', state.minW > 0 || state.minH > 0 || state.onlyLinks); }
filtersToggle.addEventListener('click', () => { const willOpen = advancedFilters.hidden; advancedFilters.hidden = !willOpen; filtersToggle.setAttribute('aria-expanded', String(willOpen)); });

function updateChipUI() {
  formatChips.querySelectorAll('.chip').forEach(chip => {
    const f = chip.dataset.format;
    const active = f === 'all' ? state.formats.size === 0 : state.formats.has(f);
    chip.classList.toggle('active', active);
  });
}
formatChips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  const f = chip.dataset.format;
  if (f === 'all') state.formats.clear();
  else if (state.formats.has(f)) state.formats.delete(f);
  else state.formats.add(f);
  updateChipUI(); render();
});
searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = searchInput.value; render(); }, 140); });
sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; render(); });

function readMinFilters() {
  state.minW = Math.max(0, parseInt(minWidthInput.value, 10) || 0);
  state.minH = Math.max(0, parseInt(minHeightInput.value, 10) || 0);
  state.onlyLinks = onlyLinksCheckbox.checked;
  updateFilterBadge();
}
minWidthInput.addEventListener('change', () => { readMinFilters(); render(); });
minHeightInput.addEventListener('change', () => { readMinFilters(); render(); });
onlyLinksCheckbox.addEventListener('change', () => { readMinFilters(); render(); });
applyFiltersBtn.addEventListener('click', () => { readMinFilters(); render(); showToast('Filters applied'); });

selectAllBtn.addEventListener('click', () => { state.filtered.forEach(img => state.selection.set(img.url, true)); syncSelectionUI(); });
deselectAllBtn.addEventListener('click', () => { state.filtered.forEach(img => state.selection.set(img.url, false)); syncSelectionUI(); });

// ---------- Download ----------
function downloadUrls(urls) {
  if (!urls || urls.length === 0) { showToast('Nothing selected'); return; }
  const max = premium.limit('maxDownloadsPerBatch');
  if (!premium.isPremium && urls.length > max) {
    showToast(`Free tier: max ${max} images per batch. Upgrade for unlimited.`, 'warn');
    return;
  }

  const folder = sanitizeFilename(folderNameInput.value.trim());
  const useFolder = folderNameInput.value.trim().length > 0;
  const usedNames = new Set();
  let done = 0, failed = 0, total = urls.length;

  setStatus(`Downloading 0/${total}…`, 'busy');
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Downloading…';

  const progress = () => {
    if (done + failed >= total) {
      setStatus(`Done — ${done} downloaded${failed ? `, ${failed} failed` : ''}.`, failed ? 'error' : 'ok');
      showToast(failed ? `${done} saved, ${failed} failed` : `${done} images saved`, failed ? 'error' : 'success');
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg> Download <span id="download-count">0</span>`;
    } else {
      setStatus(`Downloading ${done + failed}/${total}…`, 'busy');
    }
  };

  urls.forEach((url) => {
    let name = basename(url);
    if (usedNames.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.');
      const ext = dot > 0 ? name.slice(dot) : '';
      const stem = dot > 0 ? name.slice(0, dot) : name;
      let n = 2;
      while (usedNames.has((stem + '_' + n + ext).toLowerCase())) n++;
      name = stem + '_' + n + ext;
    }
    usedNames.add(name.toLowerCase());
    const filename = useFolder ? `${folder}/${name}` : name;

    chrome.downloads.download({ url, filename, saveAs: false }, () => {
      if (chrome.runtime.lastError) { failed++; console.error('download err', url, chrome.runtime.lastError.message); }
      else { done++; }
      progress();
    });
  });
}

downloadBtn.addEventListener('click', () => {
  const urls = state.filtered.filter(img => isSelected(img.url)).map(img => img.url);
  downloadUrls(urls);
});

scanAllTabsBtn.addEventListener('click', () => {
  scanAllTabsBtn.disabled = true;
  requestImagesFromAllTabs(() => { scanAllTabsBtn.disabled = false; });
});

// ---------- Lightbox ----------
function openLightbox(index) {
  if (index < 0 || index >= state.filtered.length) return;
  state.lightboxIndex = index;
  const img = state.filtered[index];
  lbImg.onerror = function(){ this.onerror = null; this.src = 'icons/icon48.svg'; };
  lbImg.src = img.url;
  lbTitle.textContent = basename(img.url);
  lbSub.textContent = `${img.width||'?'}×${img.height||'?'} · ${getFormat(img.url).toUpperCase()} · ${img.type}`;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() { lightbox.hidden = true; lbImg.src = ''; state.lightboxIndex = -1; document.body.style.overflow = ''; }
function stepLightbox(delta) {
  if (state.lightboxIndex < 0) return;
  const next = state.lightboxIndex + delta;
  if (next < 0 || next >= state.filtered.length) return;
  openLightbox(next);
}

lbClose.addEventListener('click', closeLightbox);
lbPrev.addEventListener('click', () => stepLightbox(-1));
lbNext.addEventListener('click', () => stepLightbox(1));
lbDownload.addEventListener('click', () => { const img = state.filtered[state.lightboxIndex]; if (img) downloadUrls([img.url]); closeLightbox(); });
lbCopy.addEventListener('click', () => { const img = state.filtered[state.lightboxIndex]; if (!img) return; navigator.clipboard.writeText(img.url).then(() => showToast('URL copied'), () => showToast('Copy failed')); });
lbOpen.addEventListener('click', () => { const img = state.filtered[state.lightboxIndex]; if (img) chrome.tabs.create({ url: img.url }); });
lbEdit.addEventListener('click', () => {
  if (!premium.isPremium) { showLicenseModal(); return; }
  showToast('Image editor coming in v2.1', 'warn');
});
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') stepLightbox(-1);
  else if (e.key === 'ArrowRight') stepLightbox(1);
});

// ---------- License ----------
licenseBtn.addEventListener('click', () => {
  if (premium.isPremium) { premium.deactivate(); updatePremiumUI(); showToast('Pro deactivated'); }
  else showLicenseModal();
});

// ---------- Side panel ----------
sidepanelBtn.addEventListener('click', () => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

// ---------- Init ----------
loadTheme();
updatePremiumUI();
premium.onChange(updatePremiumUI);
premium.init().then(() => {
  updatePremiumUI();
  requestImagesFromCurrentTab();
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes[chrome.storage.local.get.keys ? '' : '']) {}
  if (changes.theme) applyTheme(changes.theme.newValue === 'dark' ? 'dark' : 'light');
});
