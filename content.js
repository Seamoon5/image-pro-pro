// content.js — Image Pro v2.0 (content script)
// Runs inside the page. Collects every usable image candidate, replies
// instantly with sizes the page already knows, then probes the rest in the
// background and streams updates back to the extension.

export function resolveUrl(url, base = window.location.href) {
  try {
    return new URL(url, base).href;
  } catch (e) {
    return null;
  }
}

// Pick the highest-quality candidate from a srcset string.
export function bestFromSrcset(srcset) {
  if (!srcset) return null;
  const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
  let best = null;
  let bestScore = -1;
  for (const part of parts) {
    const bits = part.split(/\s+/);
    const url = bits[0];
    if (!url) continue;
    let score = 1;
    if (bits[1]) {
      const m = bits[1].match(/^([\d.]+)([wx])$/i);
      if (m) {
        const n = parseFloat(m[1]);
        score = m[2].toLowerCase() === 'w' ? n : n * 10000;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return best;
}

export function getFormat(url) {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const m = clean.match(/\.([a-zA-Z0-9]+)$/);
    const ext = m ? m[1].toLowerCase() : '';
    if (ext === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'tiff', 'ico', 'jxl', 'heic'].includes(ext)) return ext;
    return 'other';
  } catch (e) {
    return 'other';
  }
}

export function basename(url) {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const part = clean.split('/').pop() || '';
    return decodeURIComponent(part) || 'image';
  } catch (e) {
    return 'image';
  }
}

export function collectRawImages() {
  const rawImageDatas = [];

  const addImage = (url, type, alt) => {
    if (!url) return;
    const absoluteUrl = resolveUrl(url);
    if (absoluteUrl && absoluteUrl.startsWith('http') && !absoluteUrl.startsWith('data:')) {
      rawImageDatas.push({ url: absoluteUrl, type: type, alt: alt || '', width: 0, height: 0 });
    }
  };

  // 1.  tags — prefer largest srcset candidate, then lazy attributes.
  document.querySelectorAll('img').forEach(img => {
    const alt = img.alt || img.title || '';
    const srcsetBest = bestFromSrcset(img.getAttribute('srcset')) ||
                       bestFromSrcset(img.getAttribute('data-srcset'));
    if (srcsetBest) {
      addImage(srcsetBest, 'img', alt);
      return;
    }
    const lazy =
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-lazy-src') ||
      img.getAttribute('data-full') ||
      img.getAttribute('data-large') ||
      img.getAttribute('data-image') ||
      img.getAttribute('data-hi-res');
    if (lazy) {
      addImage(lazy, 'img', alt);
    } else if (img.currentSrc || img.src) {
      addImage(img.currentSrc || img.src, 'img', alt);
    }
  });

  // 2. <picture> / <source> candidates
  document.querySelectorAll('picture source, source[srcset]').forEach(source => {
    const best = bestFromSrcset(source.getAttribute('srcset'));
    if (best) addImage(best, 'img', source.getAttribute('alt') || '');
  });

  // 3. CSS background-image — targeted selectors.
  const bgSelector = 'div,span,section,article,li,a,figure,p,header,footer,nav,td,th,button,main,aside';
  document.querySelectorAll(bgSelector).forEach(element => {
    let style;
    try { style = window.getComputedStyle(element); } catch (e) { return; }
    const backgroundImage = style.backgroundImage;
    if (backgroundImage && backgroundImage !== 'none') {
      const urlMatch = backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
      if (urlMatch && urlMatch[1]) addImage(urlMatch[1], 'css', '');
    }
  });

  // 4. Direct image links
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.href;
    if (href && /\.(jpeg|jpg|gif|png|webp|avif|svg|bmp|tiff|ico)(\?.*)?$/i.test(href)) {
      addImage(href, 'link', link.textContent.trim().slice(0, 120));
    }
  });

  // 5. Video posters
  document.querySelectorAll('video[poster]').forEach(video => {
    addImage(video.getAttribute('poster'), 'img', video.getAttribute('title') || '');
  });

  // 6. Social / preview metadata
  document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], meta[property="og:image:secure_url"]').forEach(meta => {
    addImage(meta.getAttribute('content'), 'img', '');
  });

  // 7. Preloaded images
  document.querySelectorAll('link[rel="preload"][as="image"]').forEach(link => {
    addImage(link.getAttribute('href'), 'img', '');
  });

  // Deduplicate, preferring richer types.
  const uniqueUrlMap = new Map();
  const priority = { link: 3, img: 2, css: 1 };
  rawImageDatas.forEach(data => {
    if (!uniqueUrlMap.has(data.url)) {
      uniqueUrlMap.set(data.url, data);
      return;
    }
    const existing = uniqueUrlMap.get(data.url);
    if ((priority[data.type] || 0) > (priority[existing.type] || 0)) {
      existing.type = data.type;
    }
    if (!existing.alt && data.alt) existing.alt = data.alt;
  });

  return Array.from(uniqueUrlMap.values());
}

// Sizes the page already knows — free and instant.
export function pageKnownDims() {
  const map = new Map();
  const remember = (url, w, h) => {
    if (!w || !h) return;
    const abs = resolveUrl(url);
    if (abs) map.set(abs, { width: w, height: h });
  };

  document.querySelectorAll('img').forEach(img => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    remember(img.currentSrc || img.src, w, h);
    remember(img.getAttribute('data-src'), w, h);
    remember(img.getAttribute('data-original'), w, h);
    [img.getAttribute('srcset'), img.getAttribute('data-srcset')].forEach(set => {
      if (!set) return;
      set.split(',').forEach(part => {
        const u = part.trim().split(/\s+/)[0];
        if (u) remember(u, w, h);
      });
    });
  });

  return map;
}

// Probe one URL for its real size. 2-second cap so nothing ever stalls.
export function probeSize(url) {
  return new Promise((resolve) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) { resolve(null); return; }
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null; img.onerror = null; resolve(null);
    }, 2000);
    img.onload = () => { clearTimeout(timer); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

// Probe with concurrency; report progress in batches.
export async function probeUnknown(unknownUrls, onBatch) {
  const CONCURRENCY = 6;
  const BATCH = 8;
  let index = 0;
  let pending = [];

  const flush = (done) => {
    if (pending.length === 0 && !done) return;
    if (onBatch) onBatch(pending.slice(), done);
    pending = [];
  };

  async function worker() {
    while (index < unknownUrls.length) {
      const i = index++;
      const url = unknownUrls[i];
      const dims = await probeSize(url);
      if (dims) {
        pending.push({ url, width: dims.width, height: dims.height });
        if (pending.length >= BATCH) flush(false);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unknownUrls.length) }, () => worker()));
  flush(true);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getImagesFromTab') {
    let raw;
    try { raw = collectRawImages(); } catch (e) {
      sendResponse({ images: [] }); return;
    }

    const known = pageKnownDims();
    const images = raw.map(data => {
      const d = known.get(data.url);
      return {
        url: data.url,
        width: d ? d.width : 0,
        height: d ? d.height : 0,
        type: data.type,
        alt: data.alt || ''
      };
    });

    // Reply immediately so the grid appears without waiting for probes.
    sendResponse({ images });

    const unknownUrls = images.filter(img => !img.width || !img.height).map(img => img.url);
    if (unknownUrls.length > 0) {
      probeUnknown(unknownUrls, (batch, done) => {
        try {
          chrome.runtime.sendMessage({ action: 'dimsUpdate', updates: batch, done });
        } catch (e) {}
      });
    } else {
      try { chrome.runtime.sendMessage({ action: 'dimsUpdate', updates: [], done: true }); } catch (e) {}
    }
    return;
  }
});
