# Genshin Material Planner

[简体中文](README.md)

A Windows desktop planner for Genshin Impact character and weapon upgrades, shared material inventory, and weekly domain schedules.

**[Download v0.6.1](https://github.com/shmilyfuu/genshin-material-planner/releases/tag/desktop-v0.6.1)**

[Download Windows x64 portable release](https://github.com/shmilyfuu/genshin-material-planner/releases/tag/desktop-v0.6.1) · [Development builds](https://github.com/shmilyfuu/genshin-material-planner/actions/workflows/build-webview2.yml)

## Features

- Weapon ascension for all five rarities; one- and two-star weapons cap at Lv.70.
- Preview objects are marked with an asterisk after the centered name.
- Individual deficits include lower-tier materials required for crafting.
- A centered yellow-dot waiting indicator locks the interface during inventory synchronization, game data loading, and imports until active blocking tasks finish.
- Quick-add material quantities with a confirmation button or Enter and a live inventory preview.
- Load cached game data first, validate remote changes in the background, and apply updated data when the interface is idle. Existing caches remain available offline.
- Character and weapon catalogs with search, rarity, element, and weapon type filters.
- Multiple independent upgrade goals with level, ascension, talent, pause, and completion settings.
- Independent instances of identical weapons and character-to-weapon links.
- Unified catalog ordering by goal and ownership status, preview status, release date, and rarity.
- Shared material inventory, combined shortages, and individual goal comparisons.
- Weekly domain schedule for active upgrade goals.
- Separate local planner accounts, inventory, and goals.
- GGScanner GOOD v3 imports for character and weapon progression.
- Manual inventory editing and planner configuration import/export.

### Miyoushe inventory synchronization

QR login, saved accounts, token refresh, and mainland China Genshin UID selection. Material requests use the complete official character and weapon calculator catalogs.

Raw inventory is recovered per crafting family using demand, shortages and direct surplus observations. Additional requests resolve uncertain tiers; proven lower bounds are marked separately. Each planner account stores separate manual and synchronized inventories. The selected mode controls shortages and the weekly schedule. Synchronized inventory is read-only; manual inventory is editable. Compare the two inventories and apply all confirmed quantities to manual inventory, including zero. Lower bounds and unknown quantities leave manual records intact. Unknown quantities remain empty. A completed synchronization replaces the synchronized inventory snapshot. Some material quantities may remain unknown or available only as lower bounds.

## Installation and updates

Download the Windows x64 ZIP from [Releases](https://github.com/shmilyfuu/genshin-material-planner/releases/tag/desktop-v0.6.1), extract it to a writable folder, and run `GenshinPlanner.exe`.

Requires Windows 10/11 x64 and Microsoft Edge WebView2 Runtime. The .NET runtime is included.

Click a catalog card to view its materials, and use the upgrade button on the card to configure its goal.

Back up the `data/` folder before updating. Replace application files with the new release while retaining this folder.

Planner data and caches are stored locally. Miyoushe credentials are encrypted using Windows DPAPI for the current Windows user and stored under `data/Miyoushe/`. Planner exports contain planner and inventory data only. Signing in again is required after moving to another Windows user or computer.

## Data sources

- [Nanoka](https://nanoka.cc/): character, weapon, material, and live/preview data.
- [GachaTracker](https://www.gachatracker.app/games/genshin/): release dates.
- [Snap.Metadata](https://github.com/SnapHutaoRemasteringProject/Snap.Metadata): historical banner data.
- Miyoushe enhancement calculator: inventory observations in the development build.
- [SeelieEx](https://github.com/KeyPJ/seelieEx): reference for material requests.

Changes to external services may affect data loading and synchronization.

## Development

The [desktop/GenshinPlanner/](desktop/GenshinPlanner/) application uses WPF, WebView2, and JavaScript ES modules. Install the .NET 10 SDK and Node.js, then run from the repository root:

```powershell
node --test desktop/GenshinPlanner/tests/*.test.mjs
dotnet publish desktop/GenshinPlanner/GenshinPlanner.csproj -c Release -r win-x64 --self-contained true -o desktop/publish
```

The primary development branch is `main`. GitHub Actions produces Windows ZIP archives and SHA-256 checksums. Formal releases use three-part versions (e.g. `0.6.0`); test builds append a fourth component to the current formal version (e.g. `0.6.0.1`, `0.6.0.2`) and are distributed through Actions artifacts. The first three components advance only for formal releases tagged `desktop-vX.Y.Z`. Automatic updates select formal releases only. Historical browser extension source is archived at [release/v1.5.1](https://github.com/shmilyfuu/genshin-material-planner/tree/release/v1.5.1).

## Feedback and copyright

Include the application version, Windows version, relevant character or weapon, and error details when reporting issues.

This is an unofficial project, unaffiliated with HoYoverse, miHoYo, or third-party data providers. This repository does not provide an open-source license. Except where applicable law permits otherwise, copying, modification, redistribution, or reuse requires permission from the copyright holder. Third-party names, data, and images are subject to their respective owners' terms.
