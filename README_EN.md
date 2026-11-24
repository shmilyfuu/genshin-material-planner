# Genshin Material Planner

[简体中文](README.md)

A Windows desktop planner for Genshin Impact character and weapon upgrades, shared material inventory, and weekly domain schedules.

**Release: [v0.3.7](https://github.com/shmilyfuu/genshin-material-planner/releases/latest)** · **Development: v0.4.1**

[Download Windows x64 portable release](https://github.com/shmilyfuu/genshin-material-planner/releases/latest) · [Development builds](https://github.com/shmilyfuu/genshin-material-planner/actions/workflows/build-webview2.yml)

## Features

- Character and weapon catalogs with search, rarity, element, and weapon type filters.
- Multiple independent upgrade goals with level, ascension, talent, pause, and completion settings.
- Independent instances of identical weapons and character-to-weapon links.
- Unified catalog ordering by goal and ownership status, preview status, release date, and rarity.
- Shared material inventory, combined shortages, and individual goal comparisons.
- Weekly domain schedule for active upgrade goals.
- Separate local planner accounts, inventory, and goals.
- GGScanner GOOD v3 imports for character and weapon progression.
- Manual inventory editing and planner configuration import/export.

### Miyoushe inventory synchronization (v0.4.1 development)

QR login, saved accounts, token refresh, and mainland China Genshin UID selection. Material requests use the complete official character and weapon calculator catalogs.

Inventory is inferred from `num - lack_num`; the maximum observation is retained across requests. Values that reach the calculation limit are marked as lower bounds. Existing inventory is retained for materials absent from the response. Automated builds have passed; live account login and inventory synchronization require validation.

## Installation and updates

Download the Windows x64 ZIP from [Releases](https://github.com/shmilyfuu/genshin-material-planner/releases/latest), extract it to a writable folder, and run `GenshinPlanner.exe`.

Requires Windows 10/11 x64 and Microsoft Edge WebView2 Runtime. The .NET runtime is included.

Click a catalog card to view its materials, and use the settings button on the card to configure its goal.

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

The primary development branch is `main`. GitHub Actions produces Windows ZIP archives and SHA-256 checksums. Historical browser extension source is archived at [release/v1.5.1](https://github.com/shmilyfuu/genshin-material-planner/tree/release/v1.5.1).

## Feedback and copyright

Include the application version, Windows version, relevant character or weapon, and error details when reporting issues.

This is an unofficial project, unaffiliated with HoYoverse, miHoYo, or third-party data providers. This repository does not provide an open-source license. Except where applicable law permits otherwise, copying, modification, redistribution, or reuse requires permission from the copyright holder. Third-party names, data, and images are subject to their respective owners' terms.
