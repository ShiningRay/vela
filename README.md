# Vela

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
    theme/     @vela/theme    设计令牌与 CSS 变量
    ui/        @vela/ui       基础组件 + 窗口框 / 任务栏 / 菜单栏 / 桌面图标
    desktop/   @vela/desktop  桌面 shell、启动器、内置应用（About / Files / Settings）
  apps/
    demo/      @vela/app-demo     最小 Solid + @vela/core 示例
    desktop/   @vela/app-desktop  Tauri 主应用
  docs/
  assets/
```

依赖方向单向：`core ← theme / ui ← desktop ← apps`。

## 快速开始

要求：Node 22+、pnpm 12+、Rust 1.77+（仅桌面壳需要）。

```bash
pnpm install

# 最小示例（浏览器）
pnpm dev

# 桌面开发（Vite + Tauri 窗口，HMR 生效）
pnpm dev:desktop

# 检查
pnpm typecheck
pnpm test
pnpm build

# 打包桌面应用
pnpm build:desktop
```

`pnpm dev` 打开 `http://localhost:5173` 的 Counter 示例。`pnpm dev:desktop` 会先启动 Vite，再由 Tauri 打开原生窗口。

## 当前状态

骨架阶段（P0）：

- `@vela/core`：窗口管理器、应用注册表、命令、VFS、通知、快捷键、深相等信号，带 Vitest 单测；
- `@vela/ui`：Button / IconButton / Stack / Row / Label / MenuList / WindowFrame / Taskbar / MenuBar / DesktopIcon；
- `@vela/desktop`：DesktopShell + About / Files / Settings 三个内置应用；
- `@vela/app-demo`：Counter 与深相等行为演示；
- `@vela/app-desktop`：Tauri 2 壳与图标。

已在 macOS 本机验证：

- `pnpm typecheck`、`pnpm test`（15 项）、`pnpm build` 全绿；
- `pnpm dev`：Counter 渲染，点击 +1 后 `count=1 / double=2 / effect runs=2`，写入结构相等对象后 effect 次数保持 2；
- `pnpm dev:desktop`：桌面图标单击选中、双击开窗，窗口拖拽、最大化、最小化、任务栏恢复、关闭与启动器均正常；
- `pnpm build:desktop`：产出 `Vela.app`（9.6 MB）与 `Vela_0.1.0_aarch64.dmg`（2.7 MB），`open` 后可启动。

已知限制：

- 所有应用窗口按 app id 单例，多实例窗口未实现；
- VFS 是内存实现，刷新后丢失；
- 任务栏时钟为渲染时快照，尚未做分钟级刷新；
- 组件库只覆盖桌面骨架所需的少量组件；
- Tauri 打包未做签名/公证。

## 命名

一套名字覆盖仓库、包、产品与桌面应用：

| 项 | 名称 |
|---|---|
| 项目 / 仓库 | `vela` |
| npm scope | `@vela/*`（发布前核对 npm org） |
| 产品名 | Vela Desktop |
| 桌面应用 ID | `com.vela.desktop` |
| 核心包 | `@vela/core` |
| 组件库 | `@vela/ui` |
| 桌面层 | `@vela/desktop` |
| 主题 | `@vela/theme` |
| 应用 | `@vela/app-<name>` |

包名 kebab-case；组件 PascalCase；属性与事件 camelCase。

## 与 Citrine 的关系

Citrine 的 Ruby 实现保留为**行为参考**，不双轨维护。迁移判断、窗口管理器算法、测试策略见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；阶段计划见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## License

MIT（沿用原项目）。
