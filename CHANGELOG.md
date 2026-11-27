# Changelog

## Desktop 0.6.1

- 手动背包增加快捷追加材料数量按钮、局部浮层及确认前数量预览，支持 Enter 提交。
- 启动优先读取本地游戏资料缓存，后台校验 Nanoka 及发布时间资料。
- 支持 HTTP 条件请求和内容哈希比较，未变化的缓存保持原样；更新数据在界面空闲时统一应用。
- 网络异常时保留有效缓存，继续使用已有游戏资料。

## Desktop 0.6.0

- 新增居中的黄色圆点等待提示，覆盖库存同步、资料加载、账号查询及数据导入。
- 阻塞任务期间暂停界面操作，任务完成或失败后自动解除限制。
- 并行任务独立管理等待状态，实时显示主要任务进度。
- 正式版采用三段式版本号，测试包在当前正式版本后追加第四位，通过 Actions Artifacts 分发。

## Desktop 0.5.9

- Added one- and two-star weapon ascension and corrected individual crafting deficit presentation.
- Improved GOOD weapon instance matching and consistent instance numbering.
- Protected local planning data, saved changes on close, and retried incomplete legacy inventory migration.
- Refined roster filters, game icons, preview names and card badges.
- Desktop-specific update discovery and fail-fast build validation.

## 1.2.12

- Added compact up and down controls to every inventory quantity field.
- Each click increases or decreases the evaluated value by 1.
- Values do not go below 0.
- Arithmetic expressions remain supported.
- Button changes trigger automatic calculation and local saving.

## 1.2.11

- Refined the inventory material layout and image display.
- Preserved the Nanoka, Lunaris, and placeholder image fallback order.

## Earlier versions

- Added merged live and latest character and weapon data.
- Added preview tagging, search, filters, and material images.
