# 原神养成规划 · Windows 桌面版

Windows WPF + WebView2 桌面端，默认窗口为 1600 × 900。

## 启动与构建

需要 Windows 10/11、Microsoft Edge WebView2 Runtime。源码构建需要 .NET 10 SDK。

```powershell
dotnet restore .\GenshinPlanner.csproj
dotnet run --project .\GenshinPlanner.csproj
```

Windows x64 发布：

```powershell
dotnet publish .\GenshinPlanner.csproj -c Release -r win-x64 --self-contained true -o .\publish
```

运行发布目录中的 `GenshinPlanner.exe`，保留整个发布文件夹。

## 数据

账号、培养项、等级和手动背包库存存放在当前 Windows 用户目录：

`%LOCALAPPDATA%\GenshinPlanner\planner.json`

Nanoka 角色、武器数据缓存存放在 `NanokaCache`；WebView2 运行时数据位于 `WebView2` 子目录。联网时从 `static.nanoka.cc` 获取官方已实装和前瞻资料，网络不可用时使用已缓存的数据。

可通过窗口右上角导入、导出 JSON 配置。支持导入原 Chrome 养成规划面板导出的配置数据。

## 计算

角色突破、天赋和武器突破需求由原项目计算模块计算。当前账号内的多个培养项先按材料 ID 汇总需求，再使用一份共享背包数量进行 3:1 材料合成及缺口计算。账号之间的数据分别保存。

米游社登录入口暂作为占位控件。桌面版当前通过手动背包计算。
