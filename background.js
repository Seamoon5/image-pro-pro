// background.js — Image Pro v2.0 service worker (module)
// Handles: multi-tab image scan, auto-download, context menus, alarms,
// download history, and premium license state sync.

import { premium, pushToHistory, STORAGE_KEYS } from './premium.js';

// Restore premium state on startup.
chrome.storage.local.get([STORAGE_KEYS.IS_PREMIUM], (r) => {
  premium.isPremium = r[STORAGE_KEYS.IS_PREMIUM] === true;
});

// ---- Context menu ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ip-download-all-images',
      title: 'Image Pro: Download all images on this page',
      contexts: ['page', 'image'],
    });
    chrome.contextMenus.create({
      id: 'ip-open-sidepanel',
      title: 'Image Pro: Open side panel',
      contexts: ['action'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ip-download-all-images' && tab) {
    const images = await collectImagesForTab(tab.id);
    if (!images || images.length === 0) return;
    const folder = await getFolderName(tab.url);
    await downloadImageList(images.map(i => i.url), folder);
    await pushToHistory({ action: 'context-menu', count: images.length, host: new URL(tab.url).hostname });
  }
});

// ---- Image collection for a single tab ----
async function collectImagesForTab(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      { target: { tabId }, files: ['content.js'] },
      () => {
        if (chrome.runtime.lastError) { resolve([]); return; }
        chrome.tabs.sendMessage(tabId, { action: 'getImagesFromTab' }, (response) => {
          if (chrome.runtime.lastError || !response || !response.images) { resolve([]); return; }
          resolve(response.images);
        });
      }
    );
  });
}

async function getFolderName(tabUrl) {
  const settings = await chrome.storage.local.get(['folderByHost']);
  const byHost = settings.folderByHost || {};
  let host = '';
  try { host = new URL(tabUrl).hostname; } catch (e) {}
  return byHost[host] || '';
}

// ---- Download list (shared logic) ----
async function downloadImageList(urls, folderName = '') {
  const usedNames = new Set();
  const results = { done: 0, failed: 0 };

  for (const url of urls) {
    let name = originalFilename(url);
    if (usedNames.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.');
      const ext = dot > 0 ? name.slice(dot) : '';
      const stem = dot > 0 ? name.slice(0, dot) : name;
      let n = 2;
      while (usedNames.has((stem + '_' + n + ext).toLowerCase())) n++;
      name = stem + '_' + n + ext;
    }
    usedNames.add(name.toLowerCase());
    const filename = folderName ? `${folderName}/${name}` : name;

    await new Promise((resolve) => {
      chrome.downloads.download({ url, filename, saveAs: false }, () => {
        if (chrome.runtime.lastError) {
          results.failed++;
          console.error('download err', url, chrome.runtime.lastError.message);
        } else {
          results.done++;
        }
        resolve();
      });
    });
  }
  return results;
}

function originalFilename(url) {
  try {
    const u = new URL(url);
    let base = (u.pathname.split('/').pop() || '').trim();
    base = decodeURIComponent(base);
    if (!base || base === '/') base = 'image';
    if (!/\.[a-zA-Z0-9]{2,5}$/.test(base)) {
      const m = url.match(/\.([a-zA-Z0-9]{2,5})(\?|#|$)/);
      base += '.' + (m ? m[1].toLowerCase() : 'jpg');
    }
    return base.replace(/[\\/:*?"<>|]/g, '_');
  } catch (e) {
    return 'image_' + Date.now() + '.jpg';
  }
}

// ---- Multi-tab scan (for sidepanel / all-tabs action) ----
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'searchAllTabsForImages') {
    (async () => {
      const images = [];
      const tabs = await chrome.tabs.query({ currentWindow: true });
      for (const tab of tabs) {
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
        try {
          const imgs = await collectImagesForTab(tab.id);
          imgs.forEach(img => {
            if (!images.find(existing => existing.url === img.url)) images.push(img);
          });
        } catch (e) { /* ignore per-tab errors */ }
      }
      sendResponse({ status: 'done', images });
    })();
    return true;
  }
  return false;
});

// ---- Alarms: periodic premium state refresh ----
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ip-license-refresh') {
    // Re-validate license periodically in a real build
    console.log('[Image Pro] license refresh alarm');
  }
});

chrome.alarms.create('ip-license-refresh', { periodInMinutes: 1440 });

// Keep service worker alive briefly for download completion
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    console.log('[Image Pro] download complete', delta.id);
  }
});
