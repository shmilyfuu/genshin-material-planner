# 原神养成规划 · Windows 桌面版

Windows WPF + WebView2 桌面端，首次启动窗口为 1600 × 900。

界面采用可拖动调整宽度的四栏布局：账号及培养项、角色与武器选择、当前培养项背包、全部已启用培养项的缺口。培养项开关控制是否参与汇总计算，相关库存与目标设置继续保留。

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

窗口上次的位置与尺寸、各栏宽度保存在：

`%LOCALAPPDATA%\GenshinPlanner\desktop-layout.json`

Nanoka 角色、武器数据缓存存放在 `NanokaCache`；WebView2 运行时数据位于 `WebView2` 子目录。联网时从 `static.nanoka.cc` 获取官方已实装和前瞻资料，网络不可用时使用已缓存的数据。

可通过窗口右上角导入、导出 JSON 配置。支持导入原 Chrome 养成规划面板导出的配置数据。

## 计算

角色突破、天赋和武器突破需求由原项目计算模块计算。当前账号内的多个培养项先按材料 ID 汇总需求，再使用一份共享背包数量进行 3:1 材料合成及缺口计算。账号之间的数据分别保存。

武器突破材料分组包含武器突破秘境的材料，武器使用的怪物掉落归入培养素材。缺口持续显示在最右侧，材料图标与背包中的材料 ID 对应。

元素与武器类型图标资源来自 [GenshinUI](https://github.com/shi-zhong/genshin-ui/tree/main/packages/assets) 所整理的原神游戏素材，相关游戏美术资产版权归原版权方。

米游社登录入口暂作为占位控件。桌面版当前通过手动背包计算。
