# Genshin Material Planner

[简体中文](README.md)

A Chrome side panel extension for planning character, talent, and weapon upgrade materials in Genshin Impact.

Current version: **v1.2.11**

> This is an unofficial project and is not affiliated with or endorsed by HoYoverse, miHoYo, Nanoka, or Lunaris.

## Features

- Select characters and weapons directly from the Chrome side panel.
- Search and filter characters by element and rarity.
- Search and filter weapons by type and rarity.
- Set target levels for characters, talents, and weapons.
- Calculate shortages for Mora, EXP materials, character ascension materials, talent materials, and weapon ascension materials.
- Use one global inventory; shared character and weapon materials are merged automatically.
- Automatically save selected entries, target levels, and inventory values.
- Import and export planner configuration.
- Merge live and latest data; entries found only in the latest dataset are marked as preview content.
- Load material images in this order: `Nanoka → Lunaris → rarity-colored placeholder`.
- Keep image-source diagnostics hidden when both sources work; show an error only when a source fails.
- Fall back to manual mode when remote data cannot be loaded.

## Data Sources

- Character, weapon, material, and version data: Nanoka
- Backup material images: Lunaris

Changes to external data structures or service endpoints may temporarily affect lists, details, or images.

## Installation

The extension is currently distributed as an unpacked Chrome extension.

1. Download the repository source or the latest archive.
2. Extract it to a permanent directory.
3. Open `chrome://extensions/` in Chrome.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the directory containing `manifest.json`.
7. Click the extension icon in the browser toolbar to open the side panel.

Minimum supported Chrome version: **114**.

## Updating

Unpacked extensions are not updated automatically by Chrome. To upgrade:

1. Back up or export the current configuration.
2. Replace the existing extension files with the new version.
3. Open `chrome://extensions/` and click **Reload** for the extension.

The project keeps a fixed extension ID and storage key, so existing configuration will normally remain available after an in-place update. Exporting a backup first is still recommended.

## Permissions

The extension requests the following permissions:

- `sidePanel`: display the Chrome side panel.
- `storage`: save planner configuration and cache locally.
- `https://static.nanoka.cc/*`: read Nanoka data and images.
- `https://api.lunaris.moe/*`: load backup material images when Nanoka has no matching image.

Version v1.2.11 does not include HoYoLAB/Miyoushe login, cookie access, or cloud account synchronization.

## Local Data

Planner state is stored in `chrome.storage.local`. This release has no dedicated backend and does not upload manually entered inventory values to a developer-operated server.

## Project Structure

```text
.
├── manifest.json       # Manifest V3 configuration
├── background.js       # Background data and image requests
├── sidepanel.html      # Side panel page
├── app.js              # UI, state, and interaction logic
├── core.mjs            # Upgrade calculation core
├── hakushin.mjs        # Nanoka parsing and live/latest merging
├── styles.css          # UI styles
└── icons/              # Extension icons
```

## Development

No build step is required. After editing the files, reload the extension from `chrome://extensions/`.

Suggested validation commands:

```bash
node --check background.js
node --check app.js
node --check core.mjs
node --check hakushin.mjs
python -m json.tool manifest.json
```

## Current Status and Possible Next Steps

The current stage includes the core planner, global inventory, live/latest data merging, backup material images, and configuration import/export.

Areas under evaluation include:

- Version checks and update notifications.
- Account-based cross-device synchronization.
- Research into Miyoushe enhancement-calculator data integration with explicit user authorization.

These features are not included in v1.2.11.

## Reporting Issues

Please include the following information:

- Chrome version.
- Extension version.
- Character or weapon name.
- Error message or screenshot.
- Relevant errors from the extension service worker console in `chrome://extensions/`.

## License

No open-source license has been selected for this repository yet. Until a license is added, the source code remains under default copyright protection.
