# 开始使用

## 环境

- Node 22+
- pnpm 12+
- Rust 1.77+，仅桌面壳需要
- macOS 需要 Xcode Command Line Tools

## 安装与开发

```bash
pnpm install
pnpm dev            # Counter 示例页
pnpm dev:components # 组件示例页
pnpm dev:desktop    # Tauri 桌面窗口
```

`pnpm dev:desktop` 会启动 Vite 与 Tauri，并自动拉起随包的 Node 服务。浏览器调试时可单独运行：

```bash
pnpm dev:service
```

## 检查与构建

```bash
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
pnpm build:desktop
```

`pnpm e2e` 首次运行前需要浏览器：

```bash
pnpm e2e:install
```

本机已有 Chromium 但无法访问 Playwright CDN 时，可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。

桌面构建产物在 `apps/desktop/src-tauri/target/release/bundle/`。

## 目录

| 路径 | 用途 |
|---|---|
| `packages/core` | 窗口、应用注册、命令、VFS、通知、快捷键 |
| `packages/desktop` | 桌面壳与内置应用 |
| `packages/ui` | 组件库 |
| `packages/remote` | 远程信号 Hub/Session |
| `apps/desktop` | Tauri 主应用 |
| `services/demo` | 示例 WebSocket 服务 |
| `docs` | 文档站 |

## 下一步

- [插件市场](./marketplace)
- [VPK 应用包](../VPK)
- [发布与签名](../RELEASING)
