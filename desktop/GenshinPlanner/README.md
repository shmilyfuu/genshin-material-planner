# 原神养成规划 · Windows 桌面版

Windows WPF + WebView2 桌面端。首次运行窗口为 1600 × 900，四栏可拖动调整宽度，窗口与列宽在下次启动时恢复。

## 运行

将 ZIP 解压至具有写入权限的文件夹，运行 `GenshinPlanner.exe`。程序自带 .NET 10 运行组件，Windows 10/11 需安装 Microsoft Edge WebView2 Runtime。

发布目录：

```text
GenshinPlanner/
├── GenshinPlanner.exe
├── resources/
│   └── wwwroot/
│       ├── index.html
│       ├── desktop-app.mjs
│       ├── desktop.css
│       ├── icons/
│       └── ...
└── data/
    ├── planner.json
    ├── desktop-layout.json
    ├── NanokaCache/
    └── WebView2/
```

`data/` 及其文件由程序自动创建。每个解压目录独立保存数据，整体搬移或复制程序文件夹即可携带培养计划、库存和窗口配置。

请将程序解压至桌面、普通数据盘等可写目录，避免 Windows 系统保护的安装目录。运行中的 WebView2 会创建自己的数据和缓存文件。

## 从旧版迁移数据

v0.2.0 的数据保存在 `%LOCALAPPDATA%\GenshinPlanner`：

- 将旧 `planner.json` 复制到新程序旁的 `data\planner.json`
- 将旧 `desktop-layout.json` 复制到 `data\desktop-layout.json`（需要恢复窗口布局时）
- 旧缓存可重新生成，无需迁移

复制前关闭正在运行的程序。也可使用程序的导出／导入配置功能来迁移培养计划。旧目录中的数据由用户自行管理。

## 源码构建

需要 .NET 10 SDK。

```powershell
dotnet restore .\GenshinPlanner.csproj
dotnet run --project .\GenshinPlanner.csproj
```

Windows x64 便携发布：

```powershell
dotnet publish .\GenshinPlanner.csproj -c Release -r win-x64 --self-contained true -o .\publish
```

发布目录根层放置单文件 `GenshinPlanner.exe`，前端资源放置于 `resources/wwwroot/`。WebView2 Runtime 使用用户系统上的版本。

## 计算与资料

每个规划账号单独保存培养项和背包，同账号多个已启用培养项按材料 ID 汇总需求，再用本地背包和 3:1 合成算法计算缺口。角色和武器资料从 Nanoka 下载；脱机时读取已有缓存。

武器突破材料专栏仅放武器突破秘境掉落，其他怪物材料归入培养素材。元素和武器类型图形使用 [GenshinUI](https://github.com/shi-zhong/genshin-ui/tree/main/packages/assets) 整理的原神素材，相关美术版权归原权利方。米游社入口为预留功能。
