# 原神养成规划

[English](README_EN.md)

面向原神的 Windows 桌面养成规划工具，支持多角色、多武器培养计划、共享材料库存与每周刷取日历。

**正式版：[v0.3.7](https://github.com/shmilyfuu/genshin-material-planner/releases/latest)**　|　**开发版：v0.4.6**

[下载 Windows x64 便携版](https://github.com/shmilyfuu/genshin-material-planner/releases/latest) · [开发版构建](https://github.com/shmilyfuu/genshin-material-planner/actions/workflows/build-webview2.yml)

## 功能

- 角色、武器图鉴，支持名称搜索、星级、元素和武器类型筛选。
- 独立配置角色等级、突破、天赋和武器等级，支持多项培养计划、暂停及完成状态。
- 同名武器支持多个独立实例，角色可关联武器实例。
- 按培养与拥有状态、前瞻状态、首次推出日期及星级统一排列角色和武器。
- 多个培养目标共享材料库存，按材料 ID 汇总需求并计算缺口，支持单项与全部目标对照。
- 每周刷取日历，显示当前培养目标所需秘境材料。
- 多规划账号独立保存培养目标、角色、武器和库存。
- 导入 GGScanner GOOD v3 数据，匹配角色及武器的当前练度。
- 支持材料数量手动输入、微调及规划配置导入导出。

### 米游社材料同步（v0.4.6 开发版）

支持扫码自动确认、自动读取国服 UID，并绑定已有规划账号或新建规划账号。顶部「同步库存」按当前规划账号的绑定执行同步。通过米游社官方养成计算器的角色和武器目录进行全量材料探测，覆盖官方已收录的未拥有角色与武器。

按材料系列结合需求、缺口和剩余材料反推原始库存，对未确定的品质追加请求。可证明的库存下限单独标记，未知材料留空。每个规划账号独立保存手动背包与同步背包，切换模式后按所选库存计算材料缺口和日历。同步背包为只读，手动背包支持编辑。开发版已通过自动化构建，实际账号登录及库存同步仍需验证。

## 下载与使用

1. 前往 [GitHub Releases](https://github.com/shmilyfuu/genshin-material-planner/releases/latest) 下载 Windows x64 ZIP。
2. 将压缩包解压到有写入权限的固定目录。
3. 运行 `GenshinPlanner.exe`。

系统要求：Windows 10/11 x64，Microsoft Edge WebView2 Runtime。发布包包含 .NET 运行时。

单击角色或武器卡片可查看材料与缺口，点击卡片右上角设置按钮可配置培养目标。再次单击选中卡片可返回全部目标视图。

## 更新与本地数据

升级前备份 `data/`，将新版文件覆盖到原程序目录，并保留原有 `data/`。

```text
GenshinPlanner.exe
resources/wwwroot/
data/
  planner.json
  desktop-layout.json
  NanokaCache/
  ReleaseCache/
  Miyoushe/
  WebView2/
```

规划数据与缓存存放在程序目录。米游社登录凭证使用 Windows DPAPI 当前用户加密，保存在 `data/Miyoushe/`，规划导出文件仅包含规划与库存数据。更换 Windows 用户或电脑后需要重新登录。

## 数据来源

- [Nanoka](https://nanoka.cc/)：角色、武器、材料与正式服及前瞻数据。
- [GachaTracker](https://www.gachatracker.app/games/genshin/)：角色与武器发布时间。
- [Snap.Metadata](https://github.com/SnapHutaoRemasteringProject/Snap.Metadata)：历史卡池记录，补充发布时间。
- 米游社养成计算器：材料库存探测（开发版）。
- [SeelieEx](https://github.com/KeyPJ/seelieEx)：材料请求方式参考。

外部数据接口变更可能影响资料读取和同步。

## 开发

桌面应用源码位于 [desktop/GenshinPlanner/](desktop/GenshinPlanner/)，使用 WPF、WebView2 与 JavaScript ES Modules。

需要 .NET 10 SDK 和 Node.js。在仓库根目录执行：

```powershell
node --test desktop/GenshinPlanner/tests/*.test.mjs
dotnet publish desktop/GenshinPlanner/GenshinPlanner.csproj -c Release -r win-x64 --self-contained true -o desktop/publish
```

主分支为 `main`。Windows 构建通过 GitHub Actions 生成便携 ZIP 及 SHA-256 校验文件。历史浏览器扩展源码归档于 [release/v1.5.1](https://github.com/shmilyfuu/genshin-material-planner/tree/release/v1.5.1)。

## 反馈与版权

反馈问题时请附上程序版本、Windows 版本、相关角色或武器名称以及错误提示或截图。

本项目为非官方工具，与米哈游、HoYoverse 及第三方数据提供者无隶属或合作关系。当前仓库未提供开源许可证；未经版权所有者许可，除适用法律明确允许的情形外，不得复制、修改、再分发或将本项目用于其他项目。第三方名称、数据和图片受各自权利人的条款约束。
