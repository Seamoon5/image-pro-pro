// premium.js — License validation + feature gating (freemium model)
// Importable module shared by popup, sidepanel, options and background.

export const STORAGE_KEYS = {
  LICENSE_KEY: 'ip_license_key',
  IS_PREMIUM: 'ip_is_premium',
  LICENSE_VALIDATED_AT: 'ip_license_validated_at',
  THEME: 'ip_theme',
  DOWNLOADS: 'ip_downloads',
  COLLECTIONS: 'ip_collections',
  FAVORITES: 'ip_favorites',
  HISTORY: 'ip_history',
  SETTINGS: 'ip_settings',
};

// Feature gates: what free vs premium users can do.
export const FEATURE_LIMITS = {
  free: {
    maxDownloadsPerBatch: 20,
    zipDownload: false,
    sidePanel: false,
    imageEditor: false,
    collections: false,
    downloadHistory: false,
    favorites: false,
    autoDownload: false,
    bulkRename: false,
  },
  premium: {
    maxDownloadsPerBatch: 9999,
    zipDownload: true,
    sidePanel: true,
    imageEditor: true,
    collections: true,
    downloadHistory: true,
    favorites: true,
    autoDownload: true,
    bulkRename: true,
  },
};

export class Premium {
  constructor() {
    this.isPremium = false;
    this.licenseKey = null;
    this.validatedAt = null;
    this.listeners = new Set();
  }

  async init() {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.IS_PREMIUM,
      STORAGE_KEYS.LICENSE_KEY,
      STORAGE_KEYS.LICENSE_VALIDATED_AT,
    ]);
    this.isPremium = result[STORAGE_KEYS.IS_PREMIUM] === true;
    this.licenseKey = result[STORAGE_KEYS.LICENSE_KEY] || null;
    this.validatedAt = result[STORAGE_KEYS.LICENSE_VALIDATED_AT] || null;
    return this.isPremium;
  }

  has(feature) {
    const tier = this.isPremium ? 'premium' : 'free';
    return FEATURE_LIMITS[tier][feature] !== false;
  }

  limit(feature) {
    const tier = this.isPremium ? 'premium' : 'free';
    return FEATURE_LIMITS[tier][feature];
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit() {
    this.listeners.forEach(cb => cb(this.isPremium));
  }

  async validateLicense(key) {
    // In a real product this calls your license server. For this build we
    // accept any non-empty key as "premium" so the UI flow is complete.
    // Replace validateLicense() with a real HTTPS endpoint before publishing.
    if (!key || key.trim().length < 4) throw new Error('Invalid license key');

    // Simulate network call
    await new Promise(r => setTimeout(r, 600));

    this.isPremium = true;
    this.licenseKey = key.trim();
    this.validatedAt = new Date().toISOString();

    await chrome.storage.local.set({
      [STORAGE_KEYS.IS_PREMIUM]: true,
      [STORAGE_KEYS.LICENSE_KEY]: this.licenseKey,
      [STORAGE_KEYS.LICENSE_VALIDATED_AT]: this.validatedAt,
    });
    this.emit();
    return true;
  }

  async deactivate() {
    this.isPremium = false;
    this.licenseKey = null;
    this.validatedAt = null;
    await chrome.storage.local.set({
      [STORAGE_KEYS.IS_PREMIUM]: false,
      [STORAGE_KEYS.LICENSE_KEY]: null,
      [STORAGE_KEYS.LICENSE_VALIDATED_AT]: null,
    });
    this.emit();
  }
}

// Singleton shared across extension pages.
export const premium = new Premium();

// Storage helpers
export async function get(key, def) {
  const r = await chrome.storage.local.get([key]);
  return r[key] !== undefined ? r[key] : def;
}

export async function set(obj) {
  await chrome.storage.local.set(obj);
}

export async function pushToHistory(entry) {
  const history = (await get(STORAGE_KEYS.HISTORY, []));
  history.unshift({ ...entry, id: Date.now(), at: new Date().toISOString() });
  // Keep last 500
  if (history.length > 500) history.length = 500;
  await set({ [STORAGE_KEYS.HISTORY]: history });
  return history;
}

export async function getHistory() {
  return get(STORAGE_KEYS.HISTORY, []);
}

export async function getCollections() {
  return get(STORAGE_KEYS.COLLECTIONS, []);
}

export async function saveCollections(collections) {
  await set({ [STORAGE_KEYS.COLLECTIONS]: collections });
}

export async function getFavorites() {
  return get(STORAGE_KEYS.FAVORITES, []);
}

export async function saveFavorites(favorites) {
  await set({ [STORAGE_KEYS.FAVORITES]: favorites });
}
