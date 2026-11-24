# 原神养成规划桌面版

Windows WPF + WebView2，多培养目标与共享材料库存，支持 GGScanner GOOD v3 角色与武器导入。

## 运行

解压发布 ZIP 到具有写入权限的文件夹，运行 `GenshinPlanner.exe`。首次窗口为 1600×900，可调整窗口大小和三栏宽度。需要 Windows 10/11 和 Microsoft Edge WebView2 Runtime。

发布目录：

```text
GenshinPlanner.exe
resources/
  wwwroot/
    index.html
    desktop-app.mjs
    core.mjs
    good-import.mjs
    planner-model.mjs
    ...
data/
  planner.json
  planner.json.bak
  desktop-layout.json
  NanokaCache/
  WebView2/
```

`data/` 保存账号、武器实例、材料库存、窗口位置及缓存；程序自动创建缺少的数据文件。同一 Windows 用户可复制整个程序文件夹迁移到其他位置；米游社凭证受当前 Windows 用户加密保护。

## 使用

点击角色或武器卡片右上角的提升指南按钮，配置培养等级与完成状态。点击对象选择当前缺口和背包材料，再次点击取消选择并查看合并缺口。顶部正在培养区域可暂停目标，完成目标保留在图鉴中。

角色可关联已有武器实例或创建新实例，也可解除关联。每把武器实例独立保存练度及培养目标，相同名称支持多把。材料按 ID 合并，库存只扣除一次。右侧缺口可展开查看每个培养对象的材料需求贡献。

通过「设置 → 导入 GGScanner」选择 GOOD v3 JSON，匹配已有角色与武器的当前等级、突破、天赋及精炼。重复且不可唯一确认的武器记录会提示核对；原培养目标与手动库存保持独立。

角色和武器资料来自 Nanoka，图片素材来自相应游戏资源。

一星、二星武器支持四次突破（最高 Lv.70）；三星至五星支持六次突破。单项目标显示原始需求及合成后的实际缺口。

## 程序更新

启动时自动检查正式版本，或通过设置菜单手动检查更新。确认后校验 SHA256、替换程序及界面资源并自动重启；更新事务保留 `data/`，启动失败时恢复原程序。

## 本地构建

需要 .NET 10 SDK：

```powershell
dotnet publish .\GenshinPlanner.csproj -c Release -r win-x64 --self-contained true -o .\publish
```

## 数据兼容

从桌面 v0.2.1 升级时，原单项「角色＋武器」会迁移为独立角色与武器培养目标，保留关联和原有库存。导入旧版配置前建议先备份整个 `data` 目录。

### 图鉴排序资料

角色与武器统一按照培养及拥有状态、前瞻状态、首次推出日期、星级、内部 ID 排列。首次推出日期使用 GachaTracker 角色及武器列表，Snap.Metadata 历史卡池的首次 UP 日期用于补充缺失资料；非卡池物品缺少发布时间时按星级和 ID 排列。时间资料随刷新更新，缓存及内置卡池索引用于离线回退。

- [GachaTracker](https://www.gachatracker.app/games/genshin/)
- [Snap.Metadata](https://github.com/SnapHutaoRemasteringProject/Snap.Metadata)

### 米游社账号与材料同步

点击设置 → 米游社账号与绑定，选择已有登录记录或扫码登录，自动读取 UID 后绑定已有规划账号或新建账号。顶部「同步库存」按当前规划账号的绑定同步全量材料。登录记录使用 Windows DPAPI CurrentUser 加密，存放在 data/Miyoushe，规划导出仅包含培养和库存数据。同步调用官方完整角色及武器目录和 batch_compute，按材料系列结合需求、缺口和剩余材料恢复原始库存；可证明的下限单独标记，未知材料留空。手动背包与同步背包按规划账号独立保存，通过背包栏切换模式；缺口与日历读取当前模式的数据。同步背包只读。同步背包中可核对手动数量及差异，点击「应用到手动背包」后覆盖所有已确认的材料数量（含零），下限与未取得的材料保留手动记录。基础探测失败时保留原库存；无法确认的材料留空。

参考：[SeelieEx](https://github.com/KeyPJ/seelieEx)。

### 材料诊断

米游社弹窗中选择已登录账号及 UID 后点击「材料诊断」，核对官方已收录的凛雪帝皇系列武器（优先使用凝雪沉心），并执行单把、重复武器、同系列武器及分突破阶段的诊断请求。结果保存在 `data/inventory-diagnostics.json`，记录材料字段、请求等级与覆盖情况，不写入库存。
