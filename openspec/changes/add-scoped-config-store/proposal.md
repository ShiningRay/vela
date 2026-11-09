# Proposal: add-scoped-config-store

## Why

Vela 的配置目前分散在三处：`SettingsStore` 只覆盖 accent/wallpaper/marketplaceUrl/hotkeys 四项桌面设置，并写入 localStorage 单键；应用包清单落在 VFS 的 `/Apps/<id>/`；内置应用若要保存偏好，只能各自约定路径。zHDC 计划迁移 43 个应用，如果每个应用都复制一套配置读写、默认值与迁移逻辑，配置会迅速碎片化。本变更补一个最小作用域配置层，不建 Windows 注册表式的全局配置系统。

## What Changes

- **`@vela/core` 新增 `ConfigStore`**：以现有 `Vfs` 为后端，scope 固定为 `system` 与 `apps/<id>`；每个 scope 一个文件（`/Config/system.json`、`/Config/apps/<id>.json`），提供 `get` / `set` / `subscribe` / `reset`，支持默认值合并、schema 校验、版本号与迁移钩子。
- **`SettingsStore` 接入 `system` scope**：对外 `DesktopSettings` 形状与 `update` / `setHotkey` / `reset` API 保持不变；首次启动把 localStorage 的 `vela.desktop.settings.v1` 一次性迁移到 `/Config/system.json`，迁移非破坏性，旧键保留以便回滚。
- **`DesktopServices` 增加 `config`**：桌面壳把 `ConfigStore` 注入内置应用；`apps/desktop` 入口用持久 VFS 创建实例，浏览器预览继续回退到内存 VFS。
- **测试与文档**：补 core 单测、Settings 迁移测试与刷新恢复 E2E；修正 `ARCHITECTURE.md` 中“设置与 VFS 共享持久化”的过时描述。

明确排除：

- 不建全局键树、ACL、远程策略或配置管理 UI；不做 Windows 注册表式层级。
- 不开放 VPK 配置 API。第三方包仍运行在断网沙箱中，本变更不改变其无持久存储的现状。
- 不存业务配置。zHDC 的业务真相源仍在 FastAPI/MariaDB/TimescaleDB，`ConfigStore` 只存客户端偏好、UI 状态与连接指针。
- 不引入新数据库或新依赖，不改变 VFS 的存储后端。

## Capabilities

### New Capabilities

- `scoped-config-store`: `system` / `apps/<id>` 作用域隔离、VFS 持久化、默认值合并与 schema 校验、版本化迁移、订阅与重置，以及 `SettingsStore` 的兼容迁移行为。

### Modified Capabilities

- 无。`openspec/specs` 尚无已归档主 spec。

## Impact

- **代码**：`packages/core`（新增 `config-store.ts` 并从 `index.ts` 导出）、`packages/desktop`（`settings.ts`、`context.ts`、`shell.tsx` 及测试）、`apps/desktop/src/main.tsx`、`e2e/p3.spec.ts`。
- **API**：新增 `ConfigStore`、`ConfigScope`、`ConfigSchema` 等类型；`DesktopServices` 增加 `config` 字段，直接构造完整服务对象的调用方需补该字段，`DesktopShell` 始终注入；`SettingsStore` 现有公开行为与设置形状不变。
- **存储**：新增 `/Config/...` 文件；localStorage 旧键保留一个版本作为迁移源与回滚路径。
- **兼容性**：升级后已有设置继续生效；`SettingsStore` 旧路径保留；未配置 VFS 的测试与浏览器路径仍使用内存实现。
- **安全**：内置应用只能通过 `ConfigScope` 访问自身 `appId` 命名空间；scope 路径与 app id 做格式校验，禁止 `..` 与路径分隔符注入；VPK 不暴露该 API。
- **依赖**：无新增第三方依赖。
