# Roadmap

> 状态：P0 骨架已落地。工期为单人估算，按实际速度调整。

## P0 — 骨架（当前）

- [x] pnpm workspace、TypeScript strict、Vite、Vitest
- [x] `@vela/core`：窗口管理器 / 应用注册表 / 命令 / VFS / 通知 / 快捷键 / 深相等信号
- [x] `@vela/remote`：Hub / Session / WsWire / MemoryWire / propose·patch·release·barrier
- [x] `@vela/theme`：设计令牌与 CSS 变量
- [x] `@vela/ui`：Button、IconButton、Stack、Row、Label、MenuList、WindowFrame、Taskbar、MenuBar、DesktopIcon
- [x] `@vela/desktop`：DesktopShell、About / Files / Service / Settings
- [x] `apps/demo`：Counter + 深相等演示
- [x] `apps/desktop`：Tauri 2 壳、Node 服务 supervisor
- [x] `services/demo`：Node/TS WebSocket 服务，发布 tasks/status/clock
- [x] 首次 `pnpm install`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全绿
- [x] 图标生成（`pnpm tauri icon assets/icon.svg`）
- [x] 首次 `tauri build` 产出可运行包（Vela.app / DMG，macOS 启动验证通过）
- [x] 桌面启动自动拉起 Node 服务；SIGKILL 主进程后服务随 stdin 关闭退出

验收：

- 所有包 typecheck 通过；
- Core 单测通过；
- `pnpm dev` 打开 Counter，深相等按钮不增加 effect 次数；
- `pnpm dev:desktop` 打开 Vela 桌面，图标双击开窗；
- `pnpm build` 产出前端静态文件。

## P1 — 桌面壳完整

- [ ] 多实例窗口（`WindowRecord.appId`，同一应用可开多窗）
- [ ] 窗口拖拽吸附（边缘检测、实时预览）
- [ ] 窗口最小化动画、任务栏状态同步
- [ ] 启动器搜索、键盘导航（↑/↓/Enter）
- [ ] 菜单栏下拉菜单
- [ ] 通知自动消失与堆叠
- [ ] 窗口焦点丢失/恢复（`blur`）
- [ ] 任务栏时钟分钟级刷新
- [ ] 快捷键中心（⌘ Space、⌘ W、⌘ M、⌘ Q）
- [ ] Node 运行时随应用打包（sidecar 或 SEA），不依赖系统 node
- [ ] 服务健康检查、崩溃重启、随机端口、日志面板

验收：

- 窗口操作与 Beryl 版行为对齐（拖拽、缩放、z 序、最大化、吸附、最小化）；
- Playwright 覆盖拖拽与吸附；
- 键盘可完成“打开启动器 → 选中应用 → 回车开窗”。

## P2 — 组件库

按优先级：

1. 基础：Input、Textarea、Checkbox、Switch、Select、Slider、NumberInput；
2. 反馈：Dialog、Confirm、Toast、Alert、Progress、Spinner、EmptyState；
3. 布局：Tabs、Accordion、Divider、Breadcrumb、Pagination、Toolbar、StatusBar；
4. 数据：List、Table、Tree、KV、Tag、Badge；
5. 桌面专用：Popover、Tooltip、ContextMenu、ColorPicker、DatePicker。

每个组件的完成标准：

- 实现 + Vitest/happy-dom 渲染测试；
- Vite 示例页；
- 键盘可达（Tab / Enter / Escape）；
- 不读未声明的 props。

验收：桌面内置应用（Files / Settings）全部改用组件库，无手写按钮/输入框。

## P3 — 桌面应用与持久化

- [ ] VFS 换 IndexedDB / OPFS，刷新保留
- [ ] 文件选择、导入/导出
- [ ] 设置持久化（主题、快捷键、壁纸）
- [ ] 通知权限与系统通知适配（Tauri 插件）
- [ ] 内置应用：Editor、Terminal、Files 完整化
- [ ] 应用包安装（`.vpk` zip：manifest + 入口 + 资源）

验收：

- 刷新后文件与设置保留；
- 安装一个本地应用包并启动；
- 系统通知可在 macOS/Windows 弹出（Tauri 插件）。

## P4 — 应用迁移

顺序：

1. `emerald-calc`（科学计算器，576 行）
2. `citrine-sheets`（电子表格，3,372 行）
3. `citrine-market-terminal`（行情终端，3,036 行）
4. `agentos-desk`（桌面客户端，2,054 行）
5. `emerald-zui`（无限画布桌面，2,012 行）

每个应用：

- 先迁移纯逻辑（计算引擎、撮合、公式）；
- 再迁移视图；
- 最后接入桌面壳，产出可双击的包。

验收：功能对齐原应用；纯逻辑单测通过。

## P5 — 分发与工程化

- [ ] GitHub Actions：typecheck / test / build / tauri build 三平台
- [ ] 版本与 Changesets
- [ ] macOS 签名与公证、Windows 签名
- [ ] 自动更新（Tauri updater）
- [ ] 文档站与组件示例站

## 不做

- 不重写响应式内核；
- 不兼容 Citrine 的 Ruby API；
- 不双轨维护 Ruby 与 TS；
- 不做移动端；
- 不做 React/Vue 适配层（除非客户明确要求）。
