# Vela

[![ci](https://github.com/ShiningRay/vela/actions/workflows/ci.yml/badge.svg)](https://github.com/ShiningRay/vela/actions/workflows/ci.yml)
[![pages](https://github.com/ShiningRay/vela/actions/workflows/pages.yml/badge.svg)](https://github.com/ShiningRay/vela/actions/workflows/pages.yml)
[![GitHub](https://img.shields.io/badge/GitHub-ShiningRay%2Fvela-181717?logo=github)](https://github.com/ShiningRay/vela)

文档站：<https://shiningray.github.io/vela/>

**Vela Desktop** — 用 Solid + TypeScript 重做的桌面平台，架构经验来自 Citrine，运行时不依赖 Ruby。

> Vela 是船帆座。名字取“帆”的意象：一组能力托住同一个桌面，而不是再造一个框架。

## 这是什么

Vela 不再自研响应式内核。它直接使用 Solid 的 `createSignal` / `createEffect` / `createMemo`，并把 Citrine 验证过的部分搬过来：

- 窗口管理器作为**服务**（Signal 驱动 z 序、几何、最大化、吸附）；
- 应用注册表、命令总线、VFS、通知、全局快捷键；
- 桌面 OS 隐喻：壁纸、图标、菜单栏、任务栏、启动器、多窗口；
- 组件库（`@vela/ui`）与桌面层（`@vela/desktop`）分离；
- 细粒度更新、显式生命周期、keyed 复用、错误边界、Context。

不搬的部分：Opal、Ruby DSL、自研渲染器内核、跨平台数值工具、手写打包器。

## 技术栈

| 层 | 选择 |
|---|---|
| UI 运行时 | Solid 1.9 |
| 语言 | TypeScript 7（strict） |
| 构建 / 开发 | Vite 8（HMR、错误浮层、source map） |
| 测试 | Vitest 5 |
| 桌面壳 | Tauri 2（系统 webview，Rust 只在壳层） |
| 包管理 | pnpm workspace |

## 结构

```
vela/
  packages/
    core/      @vela/core     窗口管理、应用注册、命令、VFS、通知、快捷键、深相等信号
    remote/    @vela/remote   权威 Hub / 镜像 Session / Wire 传输（propose·patch·release·barrier）
    theme/     @vela/theme    设计令牌与 CSS 变量
    ui/        @vela/ui       32 个组件（表单 / 反馈 / 布局 / 数据 / 桌面浮层）+ 窗口框 / 任务栏 / 菜单栏
    desktop/   @vela/desktop  桌面 shell、启动器、内置应用（About / Files / Editor / Terminal / Plugin Market / Service / Settings）
  apps/
    demo/      @vela/app-demo        最小 Solid + @vela/core 示例
    components/@vela/app-components  组件示例页（全部 @vela/ui 组件）
    desktop/   @vela/app-desktop     Tauri 主应用
  services/
    demo/         @vela/service-demo  Node/TS 后台服务，WebSocket 发布信号
  docs/       VitePress 文档站（架构 / VPK / Roadmap / 发布）
  assets/
```

依赖方向单向：`core ← theme / ui ← desktop ← apps`；`remote` 被桌面与 Node 服务共同使用。

## 快速开始

要求：Node 22+、pnpm 12+、Rust 1.77+（仅桌面壳需要）。

```bash
pnpm install

# 最小示例（浏览器）
pnpm dev

# 组件示例页（全部 @vela/ui 组件）
pnpm dev:components

# 单独运行后台服务（浏览器调试时手动起；Tauri 会自动起）
pnpm dev:service

# 桌面开发（Vite + Tauri 窗口，HMR 生效；自动启动后台服务）
pnpm dev:desktop

# 检查
pnpm typecheck
pnpm test
pnpm build

# 浏览器端 E2E（首次先装 Chromium）
pnpm e2e:install
pnpm e2e

# 打包桌面应用
pnpm build:desktop

# 文档站
pnpm docs:dev
pnpm docs:build
```

`pnpm dev` 打开 `http://localhost:5173` 的 Counter 示例，`pnpm dev:components` 打开 `http://localhost:5174` 的组件示例页。`pnpm dev:desktop` 会先启动 Vite，再由 Tauri 打开原生窗口；Rust 侧用随包暂存的 Node 运行时启动 `services/demo`，服务绑定随机空闲端口，实际 `ws://` 地址通过 supervisor 状态事件交给前端。浏览器调试时用 `pnpm dev:service` 手动起服务（默认 `ws://127.0.0.1:4317`）。如果本机已有可用的 Chromium、但无法访问 Playwright CDN，可为 `pnpm e2e` 设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。

三个 VPK demo 已独立到 [ShiningRay/vela-apps](https://github.com/ShiningRay/vela-apps)，构建产物在其 `dist/vpk/` 生成并通过 [v0.1.0 Release](https://github.com/ShiningRay/vela-apps/releases/tag/v0.1.0) 发布；Vela 只保留 `.vpk` 安装器。

插件市场服务已独立到 [vela-marketplace](https://github.com/ShiningRay/vela-marketplace) 仓，随独立仓部署；Vela 只保留内置 Plugin Market 客户端。客户端默认连接 `http://127.0.0.1:4320`，可在 Settings → Marketplace URL 改为部署后的市场地址。

## 当前状态

P1 桌面壳与服务治理、P2 组件库、P3 持久化与应用包、P6 插件市场完成；P5 发布工程已配置 CI、Changesets、多平台 Release workflow 与文档站，签名/公证/自动更新待证书；P4 的三个 VPK demo 独立到 [vela-apps](https://github.com/ShiningRay/vela-apps)，插件市场服务独立到 [vela-marketplace](https://github.com/ShiningRay/vela-marketplace)，ZUI 不做：

- `@vela/core`：窗口管理器（多实例 `appId`、blur 恢复、吸附、最大化）、应用注册表、命令、VFS（`MemoryVfs` / `IndexedDbVfs`）、通知（自动消失 + 可选宿主桥）、快捷键（Space 归一化）、深相等信号，带 Vitest 单测；
- `@vela/remote`：权威 `RemoteHub`、镜像 `RemoteSession`、`WsWire` / `MemoryWire`，支持 `propose` / `patch` / `release` / `barrier`；权威侧用平台无关的 `createSource`，不依赖 Solid；
- `@vela/ui`：32 个组件，覆盖表单（Input / Textarea / Checkbox / Switch / Select / Slider / NumberInput）、反馈（Dialog / Confirm / Toast / Alert / Progress / Spinner / EmptyState）、布局（Tabs / Accordion / Divider / Breadcrumb / Pagination / Toolbar / StatusBar）、数据（List / Table / Tree / KV / Tag / Badge）、桌面浮层（Popover / Tooltip / ContextMenu / ColorPicker / DatePicker）；窗口框含吸附预览与最小化过渡；
- `@vela/desktop`：DesktopShell + About / Files / Editor / Terminal / Plugin Market / Service / Settings；Plugin Market 可搜索、安装远端 `.vpk`；Files 支持导入/导出、新建、删除与路径面包屑；Settings 持久化主题、壁纸、Marketplace URL 与快捷键，并可安装 `.vpk` 应用包；Editor 与 Terminal 共用持久 VFS；
- `@vela/app-demo`：Counter 与深相等行为演示；
- `@vela/app-components`：全部组件的 Vite 示例页；
- `@vela/app-desktop`：Tauri 2 壳、Node 服务 supervisor（随机端口、健康检查、崩溃重启、日志）、notification 插件、图标；
- `@vela/service-demo`：Node/TS WebSocket 服务，发布 `tasks:list` / `service:status` / `clock` 三个信号；
- `docs`：VitePress 文档站，GitHub Pages 自动部署，含组件示例站；

已在 macOS 本机验证：

- `pnpm typecheck`、`pnpm test`（80 项，其中 `@vela/ui` 35 项、P3 持久化/包测试、Plugin Market 客户端 2 项）、`pnpm build` 全绿；
- `pnpm e2e`（15 项）通过：桌面 10 项、组件示例页 smoke、VFS 导入/导出刷新保留、设置刷新恢复、Editor/Terminal 共享 VFS、通用 `.vpk` 安装→启动→刷新恢复；
- `pnpm dev:components`：Primitives / Feedback / Layout / Data / Desktop 五个分区均正常渲染；
- `pnpm dev`：Counter 渲染，点击 +1 后 `count=1 / double=2 / effect runs=2`，写入结构相等对象后 effect 次数保持 2；
- `pnpm build:desktop`：产出 `Vela.app`（122.28 MB，含 Node 运行时）与 `Vela_0.1.0_aarch64.dmg`（38.91 MB）；CSP 已启用并完成主窗口与 srcdoc 沙箱冒烟；
- 打包应用启动后子进程为 `Vela.app/Contents/Resources/runtime/node`，服务监听随机端口，前端成功连接；
- 强杀 Node 子进程后 2s 内自动重启并换新端口，前端重连；强杀 Tauri 主进程后 Node 子进程随 stdin 关闭退出；
- `VELA_TEST_NOTIFICATION=1` 启动打包应用时 Rust `show()` 返回成功，macOS 显示通知权限提示。

已知限制：

- Node 运行时按当前构建平台暂存；Release workflow 配置 macOS arm64/x64、Linux x64、Windows x64 矩阵，首次运行待验证；
- 健康检查是 TCP 可达性 + 子进程存活，不是业务级探针；重启为固定 2s 轮询，无退避；
- 组件库覆盖 P2 清单，未包含虚拟列表、富文本、数据网格等复杂组件；
- 通知最多同屏 3 条；系统通知需用户在 macOS/Windows 授权，Windows 未实测；
- `.vpk` v1 只支持根 `manifest.json` + 单个 HTML 入口；CSS/JS 以内联方式注入，其他资源经 blob URL；单文件上限 5 MB、总计 6 MB；无签名/发布者身份，详见 [docs/VPK.md](docs/VPK.md)；
- 插件市场服务由独立仓部署，Vela 仅负责客户端；默认 `http://127.0.0.1:4320`，可在 Settings 中更换。
- Tauri 打包尚未配置 Apple/Windows 签名证书，当前产物未签名、未公证，也未启用 updater；发布与签名流程见 [docs/RELEASING.md](docs/RELEASING.md)。
- 文档站与组件示例站通过 GitHub Pages workflow 部署。

## 发布

```bash
pnpm changeset   # 记录本次改动
pnpm version     # 更新版本、CHANGELOG，并同步 Tauri/Cargo 版本
pnpm release     # 生成 tag
git push origin main --follow-tags
```

推送 `v*` tag 触发多平台构建与 GitHub Release；详细签名、公证与 updater 前置条件见 [docs/RELEASING.md](docs/RELEASING.md)。

## 命名

一套名字覆盖仓库、包、产品与桌面应用：

| 项 | 名称 |
|---|---|
| 项目 / 仓库 | `vela` |
| npm scope | `@vela/*`（发布前核对 npm org） |
| 产品名 | Vela Desktop |
| 桌面应用 ID | `com.vela.desktop` |
| 核心包 | `@vela/core` |
| 远程信号 | `@vela/remote` |
| 组件库 | `@vela/ui` |
| 桌面层 | `@vela/desktop` |
| 主题 | `@vela/theme` |
| 后台服务 | `@vela/service-<name>` |
| 应用 | `@vela/app-<name>` |

包名 kebab-case；组件 PascalCase；属性与事件 camelCase。

## 与 Citrine 的关系

Citrine 的 Ruby 实现保留为**行为参考**，不双轨维护。迁移判断、窗口管理器算法、测试策略见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；阶段计划见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## License

MIT（沿用原项目）。
