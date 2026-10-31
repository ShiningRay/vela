# Roadmap

> 状态：P0 骨架、P1 桌面壳与服务治理、P2 组件库、P3 持久化与应用包、P4 VPK 应用分发、P6 插件市场已落地（VPK 应用外置在 ShiningRay/vela-apps，市场服务外置在 [vela-marketplace](https://github.com/ShiningRay/vela-marketplace)）；P5 发布链路已落地，签名/公证/updater 待证书；ZUI 不做；工期为单人估算，按实际速度调整。

## P0 — 骨架（完成）

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

## P1 — 桌面壳完整（完成）

- [x] 多实例窗口（`WindowRecord.appId`，同一应用可开多窗）
- [x] 窗口拖拽吸附（边缘检测、实时预览）
- [x] 窗口最小化动画、任务栏状态同步
- [x] 启动器搜索、键盘导航（↑/↓/Enter）
- [x] 菜单栏下拉菜单
- [x] 通知自动消失与堆叠
- [x] 窗口焦点丢失/恢复（`blur`）
- [x] 任务栏时钟分钟级刷新
- [x] 快捷键中心（⌘ Space、⌘ W、⌘ M、⌘ Q）
- [x] Node 运行时随应用打包（sidecar 或 SEA），不依赖系统 node
- [x] 服务健康检查、崩溃重启、随机端口、日志面板

验收：

- 窗口操作与 Beryl 版行为对齐（拖拽、缩放、z 序、最大化、吸附、最小化）；
- Playwright 覆盖拖拽与吸附；
- 键盘可完成“打开启动器 → 选中应用 → 回车开窗”。

验证记录：

- `pnpm e2e`：10 项浏览器测试通过，覆盖多实例、搜索键盘导航、Service 面板、吸附预览、缩放/最大化/z 序、最小化同步、菜单、通知自动消失、blur 恢复、快捷键；
- Tauri 产物使用 `Vela.app/Contents/Resources/runtime/node`，服务随机端口启动；
- 强杀 Node 子进程后 2s 内自动重启并换新端口，前端重连；
- 强杀 Tauri 主进程后 Node 子进程随 stdin 关闭退出。

## P2 — 组件库（完成）

状态：32 个组件全部实现，`@vela/ui` 导出完整组件 API；组件示例页在 `apps/components`。

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

验证记录：

- `packages/ui/test` 34 项 happy-dom 测试，覆盖 32 个组件的渲染与交互；
- `pnpm dev:components` 打开 `http://localhost:5174`，Data / Desktop 分区均实测渲染；
- `pnpm e2e` 增加组件示例页 smoke（共 11 项）；
- Files 使用 `List`，Settings 使用 `ColorPicker`，两处 `grep` 无裸 `<button>` / `<input>`。

## P3 — 桌面应用与持久化（完成）

- [x] VFS 换 IndexedDB / OPFS，刷新保留
- [x] 文件选择、导入/导出
- [x] 设置持久化（主题、快捷键、壁纸）
- [x] 通知权限与系统通知适配（Tauri 插件）
- [x] 内置应用：Editor、Terminal、Files 完整化
- [x] 应用包安装（`.vpk` zip：manifest + 入口 + 资源）

验收：

- 刷新后文件与设置保留；
- 安装一个本地应用包并启动；
- 系统通知可在 macOS/Windows 弹出（Tauri 插件）。

验证记录：

- `pnpm test` 77 项通过，含 IndexedDB VFS、设置持久化、`.vpk` 解析与通知桥；
- `pnpm e2e` 15 项通过：文件导入/导出后刷新仍在、主题/壁纸/快捷键刷新恢复、Editor 与 Terminal 共用 VFS、`.vpk` 安装→启动→刷新后图标恢复；
- `.vpk` 入口在 `sandbox="allow-scripts"` iframe 中运行，CSS/JS 内联，CSP 阻断网络，详见 [VPK.md](VPK.md)；
- Tauri notification 插件接入，macOS 首启出现通知权限提示，Rust `show()` 返回成功；Windows 未实测；
- `pnpm build:desktop` 产出 `Vela.app` 122.28 MB、DMG 38.91 MB。

## P4 — VPK 应用分发（完成，应用已外置）

2026-10-31 用户决定：三个 demo 通过 `.vpk` 分发，ZUI 不做；计算器移出内置应用。应用源码、构建与发布随后移入独立公开仓 [ShiningRay/vela-apps](https://github.com/ShiningRay/vela-apps)，Vela 主仓只保留 `.vpk` 安装器。

- [x] `scientific-calculator`：Solid/TS 计算器，独立构建为 `scientific-calculator.vpk`；
- [x] `citrine-sheets`：复用 Citrine Sheets Ruby/Opal demo，打包为 `citrine-sheets.vpk`；
- [x] `citrine-market-terminal`：复用行情终端 Ruby/Opal demo，打包为 `citrine-market-terminal.vpk`；
- ~~`emerald-zui`~~：不做（用户决定）。

验收：

- `vela-apps` 的 [v0.1.0 Release](https://github.com/ShiningRay/vela-apps/releases/tag/v0.1.0) 提供三个 `.vpk` 与 `SHA256SUMS`；
- Settings → App packages → Install `.vpk` 可安装；
- 包在 `sandbox="allow-scripts"` iframe 中启动。VPK 上限为单文件 5 MB、总计 6 MB。

## P5 — 分发与工程化（基础完成）

- [x] GitHub Actions CI：typecheck / test / build / e2e / macOS desktop build；
- [x] v0.1.0 Release 已发布：macOS arm64/x64、Linux x64、Windows x64 与 SHA256SUMS；
- [x] 版本与 Changesets：私有包版本、CHANGELOG、Tauri/Cargo 版本同步；
- [x] 文档站与组件示例站：VitePress + GitHub Pages；
- [ ] macOS 签名与公证（待 Apple Developer 证书与公证凭据）；
- [ ] Windows 代码签名（待 Authenticode 证书）；
- [ ] 自动更新（Tauri updater，待签名包与更新密钥）。

## P6 — 插件市场（完成）

- [x] [vela-marketplace](https://github.com/ShiningRay/vela-marketplace) 独立仓：Express 服务、JSON/文件存储、上传/搜索/下载 API 与 Web 管理页；
- [x] 发布者账号：注册/登录、scrypt 密码哈希、7 天会话、publisher/admin 角色；
- [x] 审核上架：pending/published/rejected/suspended，管理员批准/拒绝/暂停；
- [x] 分类与精选：productivity/developer/finance/fun/system/other，管理员可设 featured；
- [x] 评分评论：登录用户 1-5 星与文本，去重更新，插件列表返回平均分；
- [x] 上传校验：ZIP、manifest、semver、入口、5 MB/6 MB 限制、保留内置 id、ZIP bomb 防护；
- [x] Vela 内置 Plugin Market：搜索、分类/排序、评分展示、安装/重装；Settings 可配置 Marketplace URL；
- [x] 部署准备：独立仓 Dockerfile、`/data` 卷、healthcheck、CI/Release workflow；
- [x] 独立仓 API 测试；Vela 内置客户端单测覆盖列表、筛选与安装；
- 限制：单实例 JSON 存储，无邮箱验证/找回密码/对象存储/病毒扫描/签名校验；未实际部署公网。

## 不做

- 不重写响应式内核；
- 不兼容 Citrine 的 Ruby API；
- 不双轨维护 Ruby 与 TS；
- 不做移动端；
- 不做 React/Vue 适配层（除非客户明确要求）。
