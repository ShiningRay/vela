# Tasks: add-scoped-config-store

## 1. Core 配置模型

- [x] 1.1 在 `@vela/core` 新增 `config-store.ts`：定义作用域、配置信封、默认值/校验/迁移类型，提供 `system` 与 `app(id)` 入口；Vitest 覆盖 `system`、两个 app 作用域互不覆盖，以及含 `/`、`..`、反斜杠、空段的 id 被拒绝
- [x] 1.2 实现基于 `Vfs` 的读取与写入：每作用域一个 `/Config/...json`，缺失文件返回默认值，损坏 JSON 回退默认值且不覆盖原文件；用 `MemoryVfs` 与 `fake-indexeddb` 验证新建实例后仍能读回
- [x] 1.3 实现默认值合并、未知字段保留与写入原子性；Vitest 覆盖部分更新补默认、非法值被拒绝且文件不变、未知字段跨读写保留
- [x] 1.4 实现版本号与迁移钩子：成功写回新版本、失败保留原文件并回退默认、重复加载不重复迁移；Vitest 覆盖三种场景
- [x] 1.5 实现 `subscribe` / `reset` / `flush`：写入触发一次、深度相等不触发、取消订阅后不触发、重置恢复默认并持久化；Vitest 覆盖四条路径并从 `packages/core/src/index.ts` 导出类型，`pnpm --filter @vela/core typecheck` 通过

## 2. Desktop 接入与迁移

- [x] 2.1 扩展 `SettingsStore` 构造函数接受可选配置后端，保留现有 `SettingsStorage` 路径；Vitest 验证无配置后端时现有 localStorage 测试全绿，有配置后端时读写 `system` 作用域且 `update` / `setHotkey` / `reset` 语义不变
- [x] 2.2 实现 localStorage 一次性迁移：仅在 `system` 作用域为空时读取 `vela.desktop.settings.v1`，写入后 await flush，保留旧键，损坏或缺失时回退默认；单测覆盖首次迁移、已有配置不覆盖、旧键保留、损坏键不阻塞
- [x] 2.3 `DesktopServices` 增加 `config` 字段，`DesktopShell` 用当前 `vfs` 创建默认配置实例；更新显式构造 services 的测试夹具，`pnpm test` 相关用例通过
- [x] 2.4 `apps/desktop/src/main.tsx` 在持久 VFS 上创建配置实例，渲染前 await 迁移，再把设置实例注入 `DesktopShell`；浏览器与测试环境仍可回退内存 VFS，`pnpm --filter @vela/app-desktop typecheck` 通过
- [x] 2.5 验证 Settings 应用无需改动即可读写新后端：Accent、Wallpaper、Marketplace URL、快捷键的更新立即生效，`pnpm test` 中 settings 与 marketplace 用例通过

## 3. 端到端与文档

- [x] 3.1 在 `e2e/p3.spec.ts` 保留并跑通设置刷新恢复用例；迁移场景由 settings 单测覆盖以避免共享 IndexedDB 污染其他 E2E。本机 5173 被其他项目占用时，改用 5175 与临时本地配置验证，4 项全部通过
- [x] 3.2 更新 `docs/ARCHITECTURE.md`：说明系统设置存于 `/Config/system.json`、应用配置按 `/Config/apps/<id>.json` 隔离，删除“设置与 VFS 共享持久化”的含糊表述
- [x] 3.3 整体验证：`pnpm typecheck`、`pnpm test` 全绿；`pnpm exec playwright test e2e/p3.spec.ts` 在本地 Chrome 下 4 项通过；`openspec validate add-scoped-config-store --strict` 通过
