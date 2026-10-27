# Image Pro — Professional Chrome Extension (Manifest V3)

A polished, premium-grade image downloader, editor and organiser for Chrome.

> Scan any page → filter & preview → edit → download in bulk or as ZIP.
> Free tier + Pro upgrade (side panel, ZIP, editor, collections, history).

## Features

### Free tier
- **Scan current page** — finds ``, `srcset`, `<picture>`, CSS backgrounds, direct image links, video posters, Open Graph / Twitter images, preloads
- **Scan all open tabs** — merge results from every tab in the window
- **Filters** — min width/height, format (JPG/PNG/WebP/AVIF/GIF/SVG), links only, search by name/URL
- **Sort** — page order, largest first, smallest first, name A–Z
- **Preview lightbox** — click any image to preview, navigate with arrow keys, download / copy URL / open in new tab
- **Batch download** — select images (click, shift-click range, select all) and download into an optional folder
- **Dark / light theme** — remembered between sessions
- **Context menu** — right-click a page → "Download all images on this page"
- **Keyboard shortcuts** — `Ctrl+Shift+S` scan page, `Ctrl+Shift+I` open side panel (Pro)

### Pro (premium)
- **Side panel** — persistent sidebar; scan while you browse without opening the popup
- **ZIP download** — bundle selected images into a single `.zip`
- **Image editor** — crop / resize / compress / convert before download (v2.1+)
- **Collections** — save named groups of images for later
- **Download history** — view and re-download past batches
- **Unlimited batch** — no per-batch download cap
- **Auto-download** — automatically download images when a page loads

## Install (developer mode)

1. Open Chrome → `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder: `image-pro-pro/`
5. Pin the extension to your toolbar

## Project structure

```
image-pro-pro/
├── manifest.json          # Chrome Manifest V3 config
├── design-system.css      # Shared design tokens (dark/light, premium badges)
├── background.js          # Service worker: multi-tab scan, auto-download, context menus, alarms
├── content.js             # In-page image collection + background size probing
├── content.css            # In-page styles
├── premium.js             # License validation + feature gating (freemium)
├── popup.html/js/css      # Popup UI: quick scan + download
├── sidepanel.html/js/css  # Persistent sidebar (Pro)
├── options.html/js/css    # Full settings & license page
├── icons/                 # icon16 / icon48 / icon128 (SVG)
└── tests/                 # Playwright browser tests
```

## Monetisation model

Freemium. The extension is fully functional for free; Pro unlocks the premium features above.

License validation lives in `premium.js` (`validateLicense()`). In this build any key of 4+ characters activates Pro so the UI flow is complete. Before publishing to the Chrome Web Store, replace `validateLicense()` with a call to your real license server (HTTPS).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+S` (Mac: `Cmd+Shift+S`) | Scan current page for images |
| `Ctrl+Shift+I` (Mac: `Cmd+Shift+I`) | Open Image Pro side panel (Pro) |

## Privacy

Image Pro runs entirely in your browser. Images are downloaded directly from websites to your Downloads folder. No image data is sent to any server. License keys are stored locally in Chrome's extension storage.

## Version history

### v2.0.0 (2026-10-27)
- Rebuilt as professional premium product
- Manifest V3 service worker
- Side panel API (Pro)
- Options page + license system
- ZIP download (Pro)
- Download history, collections, favorites (Pro)
- Dark/light theme, polished design system
- Keyboard shortcuts
- Playwright test suite

### v1.3 → v1.x (previous)
- See prior `README.md` in the original `Image_Pro_4_images` folder

## Testing

Playwright tests live in `tests/`. Run:

```bash
cd /home/salman/Extensions/image-pro-pro/tests
npm install
npx playwright test
```

Tests cover: popup load, image scan, filters, download, lightbox, license activation, side panel.
