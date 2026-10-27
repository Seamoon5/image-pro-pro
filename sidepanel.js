// sidepanel.js — Image Pro side panel (premium feature)
// Persistent sidebar: scan current page, build collections, ZIP download.

import { premium, FEATURE_LIMITS, pushToHistory, get, set, getCollections, saveCollections, getFavorites, saveFavorites } from './premium.js';

// ---------- Elements ----------
const spGallery = document.getElementById('sp-gallery');
const spWrap = document.getElementById('sp-gallery-wrap');
const spCount = document.getElementById('sp-count');
const spStatus = document.getElementById('sp-status');
const spStatusDot = document.getElementById('sp-status-dot');
const spScan = document.getElementById('sp-scan');
const spSearch = document.getElementById('sp-search');
const spSort = document.getElementById('sp-sp-sort') || document.getElementById('sp-sort');
const spUpsell = document.getElementById('sp-upsell');
const spTierLabel = document.getElementById('sp-tier-label');
const spPremiumBadge = document.getElementById('sp-premium-badge');
const spSettings = document.getElementById('sp-settings');
const spToast = document.getElementById('sp-toast');

// ---------- State ----------
const state = {
  images: [],
  filtered: [],
  selection: new Map(),
  search: '',
  sort: 'default',
  loading: false,
};

let searchTimer = null;
let toastTimer = null;

// ---------- Premium UI ----------
function updatePremiumUI() {
  if (premium.isPremium) {
    spPremiumBadge.style.display = 'inline-flex';
    spTierLabel.textContent = 'Pro';
    spUpsell.hidden = true;
  } else {
    spPremiumBadge.style.display = 'none';
    spTierLabel.textContent = 'Free';
    spUpsell.hidden = false;
  }
}

function showToast(text, kind) {
  spToast.textContent = text;
  spToast.className = 'toast';
  if (kind) spToast.classList.add(kind);
  spToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => spToast.classList.remove('show'), 2200);
}

function setStatus(text, kind) {
  spStatus.textContent = text;
  spStatusDot.className = 'status-dot' + (kind ? ' ' + kind : '');
}

// ---------- Helpers ----------
function escapeAttr(str) { return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
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

// ---------- Scan current page ----------
function scanCurrentPage() {
  state.loading = true;
  setStatus('Scanning page…', 'busy');
  spScan.disabled = true;
  showSkeleton();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) { state.loading = false; setStatus('No active tab.', 'error'); render(); spScan.disabled = false; return; }
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }, () => {
      if (chrome.runtime.lastError) { state.loading = false; setStatus('Cannot scan this page.', 'error'); render(); spScan.disabled = false; return; }
      chrome.tabs.sendMessage(tab.id, { action: 'getImagesFromTab' }, (response) => {
        state.loading = false;
        spScan.disabled = false;
        if (chrome.runtime.lastError || !response) { setStatus('Could not read page.', 'error'); render(); return; }
        state.images = response.images || [];
        state.selection = new Map();
        if (state.images.length === 0) setStatus('No images found.', 'error');
        else setStatus(`Found ${state.images.length} images.`, 'ok');
        render();
      });
    });
  });
}

// ---------- Rendering ----------
function showSkeleton() {
  spGallery.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton" style="height:90px"></div>').join('');
}

function computeFiltered() {
  const q = state.search.trim().toLowerCase();
  let list = state.images.filter(img => {
    if (q) { const hay = (img.url + ' ' + (img.alt||'')).toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  });
  if (state.sort === 'largest') list = list.slice().sort((a,b) => area(b) - area(a));
  else if (state.sort === 'name') list = list.slice().sort((a,b) => basename(a.url).localeCompare(basename(b.url)));
  return list;
}

function render() {
  const scrollTop = spWrap.scrollTop;
  state.filtered = computeFiltered();
  spCount.textContent = state.filtered.length;

  if (state.loading) { showSkeleton(); return; }

  if (state.filtered.length === 0) {
    spGallery.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="m21 16-5-5-4 4-2-2-7 7"></path></svg>
        <span class="empty-title">${state.images.length ? 'No matches' : 'No images yet'}</span>
        <span class="empty-sub">Click "Scan page" to collect images.</span>
      </div>`;
  } else {
    spGallery.innerHTML = state.filtered.map((img, index) => cardHTML(img, index)).join('');
    bindCards();
  }
  spWrap.scrollTop = scrollTop;
}

function cardHTML(img, index) {
  const selected = isSelected(img.url);
  const dims = (img.width && img.height) ? `${img.width}×${img.height}` : '—';
  const fmt = getFormat(img.url);
  return `
    <div class="card ${selected ? 'selected' : ''}" data-url="${escapeAttr(img.url)}" data-index="${index}" tabindex="0" role="checkbox" aria-checked="${selected}" title="${escapeAttr(img.url)}">
      <img src="${escapeAttr(img.url)}" alt="" loading="lazy" decoding="async">
      <span class="check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"></path></svg></span>
      <span class="fmt">${escapeHtml(fmt)}</span>
      <span class="badge">${dims}</span>
    </div>`;
}

function bindCards() {
  spGallery.querySelectorAll('.card').forEach(card => {
    const index = parseInt(card.dataset.index, 10);
    card.addEventListener('click', (e) => toggleSelection(index, e.shiftKey));
    card.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleSelection(index, e.shiftKey); } });
    card.querySelector('img').addEventListener('error', function(){ this.src = 'icons/icon48.svg'; });
  });
}

function syncSelectionUI() {
  spGallery.querySelectorAll('.card').forEach(card => {
    const url = card.dataset.url;
    card.classList.toggle('selected', isSelected(url));
  });
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
spSearch.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = spSearch.value; render(); }, 140); });
spSort.addEventListener('change', () => { state.sort = spSort.value; render(); });

// ---------- Actions (premium gated) ----------
spScan.addEventListener('click', () => {
  if (!premium.isPremium) {
    // Free tier: still allow scan, but side panel is premium — upsell
    scanCurrentPage();
    return;
  }
  scanCurrentPage();
});

// Download selected as ZIP (premium)
async function downloadSelectedAsZip() {
  if (!premium.isPremium) { showToast('ZIP download is a Pro feature.', 'warn'); return; }
  const urls = state.filtered.filter(img => isSelected(img.url)).map(img => img.url);
  if (!urls.length) { showToast('Nothing selected'); return; }

  setStatus('Building ZIP…', 'busy');
  spScan.disabled = true;

  try {
    const JSZip = await loadJszip();
    const zip = new JSZip();
    const folder = 'images';

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setStatus(`Zipping ${i + 1}/${urls.length}…`, 'busy');
      try {
        const blob = await fetchImageAsBlob(url);
        const name = basename(url);
        zip.file(`${folder}/${sanitizeFilename(name)}`, blob);
      } catch (e) { console.warn('zip skip', url, e); }
    }

    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const outUrl = URL.createObjectURL(content);
    chrome.downloads.download({ url: outUrl, filename: 'image-pro-collection.zip', saveAs: true });
    URL.revokeObjectURL(outUrl);
    await pushToHistory({ action: 'zip-download', count: urls.length });
    setStatus(`ZIP ready — ${urls.length} images.`, 'ok');
    showToast(`ZIP downloaded (${urls.length} images)`, 'success');
  } catch (e) {
    setStatus('ZIP failed.', 'error');
    showToast('ZIP download failed.', 'error');
  } finally {
    spScan.disabled = false;
  }
}

function loadJszip() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error('JSZip load failed'));
    document.head.appendChild(s);
  });
}

function fetchImageAsBlob(url) {
  return fetch(url, { mode: 'cors', credentials: 'omit' }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.blob();
  });
}

// ---------- Init ----------
updatePremiumUI();
premium.onChange(updatePremiumUI);
premium.init().then(updatePremiumUI);

spScan.addEventListener('click', scanCurrentPage);

spSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

// Load last scan if stored
chrome.storage.local.get(['spLastImages'], (r) => {
  if (r.spLastImages && r.spLastImages.length) {
    state.images = r.spLastImages;
    render();
  }
});
