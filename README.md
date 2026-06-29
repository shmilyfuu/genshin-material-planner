# 全能养成规划面板

[English](README_EN.md)

一个用于原神角色、天赋和武器养成材料规划的 Chrome 侧边栏扩展。

当前版本：**v1.2.11**

> 本项目为非官方工具，与米哈游、HoYoverse、Nanoka 或 Lunaris 无隶属或合作关系。

## 功能

- 在 Chrome 侧边栏中选择角色与武器。
- 支持角色名称搜索、属性筛选和星级筛选。
- 支持武器名称搜索、类型筛选和星级筛选。
- 设置角色等级、天赋等级和武器等级目标。
- 根据当前目标计算摩拉、经验材料、角色突破材料、天赋材料和武器突破材料缺口。
- 使用一套全局背包数据，角色与武器的同名材料会自动合并。
- 自动保存已选对象、目标等级和背包数量。
- 支持配置导入和导出。
- 合并正式服与最新数据；仅存在于最新数据中的对象显示“前瞻”标记。
- 材料图片按 `Nanoka → Lunaris → 品质色占位` 的顺序读取。
- Nanoka 与 Lunaris 图片源检测成功时保持隐藏，读取失败时显示错误信息。
- 数据读取失败时可进入手动模式，继续使用基础计算功能。

## 数据来源

- 角色、武器、材料与版本数据：Nanoka
- 材料图片备用来源：Lunaris

外部数据结构或服务地址发生变化时，部分列表、详情或图标可能暂时无法加载。

## Releases

正式版本通过 GitHub Releases 发布。每个版本包含：

- 可直接用于“加载已解压的扩展程序”的 ZIP 包。
- 对应的 SHA-256 校验文件。
- GitHub 自动生成的版本说明。

下载后请校验压缩包文件名与版本号，再解压到固定目录使用。

## 安装

本项目当前以“加载已解压的扩展程序”形式使用。

1. 从 GitHub Releases 下载最新 ZIP 包，或下载仓库源码。
2. 解压到一个固定目录。
3. 在 Chrome 地址栏打开 `chrome://extensions/`。
4. 开启右上角的“开发者模式”。
5. 点击“加载已解压的扩展程序”。
6. 选择包含 `manifest.json` 的目录。
7. 点击浏览器工具栏中的扩展图标，打开侧边栏。

最低 Chrome 版本：**114**。

## 更新

本地加载的扩展不会由 Chrome 自动更新。升级时：

1. 备份或导出配置。
2. 从 Releases 下载新版 ZIP，并覆盖原扩展目录。
3. 在 `chrome://extensions/` 中点击该扩展的“重新加载”。

项目保留固定扩展 ID 与本地存储键，覆盖更新时现有配置通常会继续保留。仍建议在更新前导出配置。

## 权限说明

扩展使用以下权限：

- `sidePanel`：显示 Chrome 侧边栏。
- `storage`：在本机保存规划配置和缓存。
- `https://static.nanoka.cc/*`：读取 Nanoka 数据与图片。
- `https://api.lunaris.moe/*`：在 Nanoka 图片缺失时读取材料图片。

当前版本没有米游社登录、Cookie 读取或账号云同步功能。

## 本地数据

主要配置保存在 `chrome.storage.local` 中。本项目不包含独立服务器，也不会主动把用户填写的背包数量上传到开发者服务器。

## 项目结构

```text
.
├── manifest.json       # Manifest V3 配置
├── background.js       # 后台数据与图片请求
├── sidepanel.html      # 侧边栏页面
├── app.js              # 界面、状态与交互逻辑
├── core.mjs            # 养成计算核心
├── hakushin.mjs        # Nanoka 数据解析与合并
├── styles.css          # 页面样式
└── icons/              # 扩展图标
```

## 开发

本项目没有构建步骤。修改文件后，在 `chrome://extensions/` 中点击“重新加载”即可测试。

建议在提交前执行：

```bash
node --check background.js
node --check app.js
node --check core.mjs
node --check hakushin.mjs
python -m json.tool manifest.json
```

推送形如 `v1.2.11` 的标签后，GitHub Actions 会校验标签与 `manifest.json` 版本一致，随后自动生成 ZIP、SHA-256 文件并发布 Release。也可以在 Actions 页面手动运行 `Build and publish release`。

## 当前状态与后续方向

当前阶段已经完成基础规划、全局背包、正式服与前瞻数据合并、材料图标备用链路和配置导入导出。

正在评估的方向包括：

- 版本检查与更新提示。
- 账号与跨设备数据同步。
- 在用户明确授权的前提下，研究米游社养成计算器相关数据接入。

以上功能尚未包含在 v1.2.11 中。

## 反馈

提交问题时，请附上：

- Chrome 版本。
- 扩展版本。
- 角色或武器名称。
- 错误提示或截图。
- `chrome://extensions/` 中后台服务工作线程控制台的相关报错。

## 许可

本项目采用 **GNU General Public License v3.0 only（GPL-3.0-only）** 发布，完整条款见 [LICENSE](LICENSE)。

你可以使用、研究、修改和再分发本项目。对外分发修改版或衍生版时，需要按照 GPL-3.0 的要求提供对应源代码、保留许可声明，并继续使用兼容的 GPL 条款。

版权归项目贡献者所有。第三方名称、数据和图片仍受各自权利人的条款约束。