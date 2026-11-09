# Design: add-scoped-config-store

## Context

Vela 已有可复用的持久化与响应式基础：`@vela/core` 提供同步 `Vfs` 接口、`MemoryVfs` / `IndexedDbVfs`、`createSignal` / `deepEqual`；`@vela/desktop` 的 `SettingsStore` 目前直接依赖 `localStorage` 单键；`apps/desktop` 入口在渲染前 `await openPersistentVfs()` 并创建 `SettingsStore`。内置应用共享同一个 `DesktopServices`，第三方 VPK 运行在断网且无同源存储的 iframe 中。现有 `openspec/specs` 尚无归档主 spec，本变更为新增能力。

## Goals / Non-Goals

**Goals:**

- 用现有 VFS 提供按作用域隔离的配置读写、默认值、校验、版本迁移与订阅，不引入新存储后端。
- 让桌面设置继续以原有语义工作，并完成从 localStorage 的一次性迁移。
- 为后续内置应用接入提供稳定、最小的 API 边界。

**Non-Goals:**

- 不做全局键树、ACL、远程策略、配置管理 UI 或跨设备同步。
- 不开放 VPK 配置 API，不改变 iframe 沙箱边界。
- 不存业务配置，不替代后端设置接口。
- 不实现跨作用域事务或并发合并；每个作用域独立提交。

## Decisions

### D1: 配置层放在 `@vela/core`，只依赖 `Vfs` 与 Solid signal

配置层需要同时被桌面、测试和未来的 Node 侧复用，而 VFS 已属于 core。放在 core 可以避免 desktop 复制一套路径与序列化规则。备选是在 `@vela/desktop` 内实现，弃用，因为会把可复用逻辑绑到 DOM 包。

### D2: 每个作用域一个 JSON 文件

路径固定为 `/Config/system.json` 与 `/Config/apps/<id>.json`。按作用域分文件可以限制单次写入体积、隔离损坏范围，并让卸载清理只需删除一个文件。备选是单一 `/Config.json`，弃用，因为任一作用域写入都要重写全量数据，且一个损坏会拖垮所有配置。备选是每个键一个文件，弃用，因为文件数量与读取开销不可控。

### D3: 配置信封包含版本与值，未知字段保留

磁盘格式为：

```json
{
  "version": 1,
  "values": { "...": "..." }
}
```

信封把版本元数据与用户值分开，便于迁移与兼容。未知字段必须原样保留，避免低版本写入丢失高版本数据。备选是直接存裸对象，弃用，因为无法区分业务字段与版本元数据。备选是遇到未知字段即报错，弃用，会破坏前向兼容。

### D4: 默认值与校验按作用域声明，不使用全局 schema 注册表

每个作用域通过 `{ defaults, validate, migrate }` 描述自身配置；`get` 返回 `defaults` 与已存值的深合并结果；`set` 先合并、再校验、最后持久化。`validate` 只校验已知字段，返回错误时不写入。备选是引入通用 JSON Schema 库，弃用，当前只有少量作用域，新增依赖与抽象成本高于收益；备选是只做类型断言，弃用，无法阻止非法值落盘。

### D5: 用 Solid signal 承载值，作用域维护显式订阅集合

每个作用域首次加载时创建一个 `createSignal`（`equals: deepEqual`）作为状态源；`subscribe` 由作用域维护监听集合，在写入或重置成功后同步通知并返回取消函数。这样与 `SettingsStore`、`SurfaceRegistry` 的现有响应式模式一致，同时避免为每个订阅创建需要 owner 的 effect。备选是直接用 `createEffect` 监听 signal，弃用，普通对象订阅的生命周期应由调用方显式管理；备选是自建 EventEmitter，弃用，会引入第二套订阅语义。

### D6: 写入顺序为“读取当前 → 合并 → 校验 → 写 VFS → 更新 signal”

校验失败或 VFS 写入抛错时不更新 signal，保证内存与磁盘一致。VFS 写入是同步接口，`IndexedDbVfs` 内部排队事务；配置层暴露 `flush()` 透传 `Vfs.flush()`，迁移与测试可显式等待持久化屏障。备选是先写 signal 再落盘，弃用，失败时会出现内存已变、磁盘未变的分裂状态。

### D7: `SettingsStore` 保持现有公开 API，新增可选配置后端

`DesktopSettings` 形状与 `update` / `setHotkey` / `reset` 不变。构造函数保留 `SettingsStorage` 参数，并新增可选的配置作用域参数：提供配置后端时读写 `system` 作用域；未提供时继续使用现有 localStorage 路径，保证单元测试与浏览器旧路径可用。桌面入口传入持久 VFS 上的配置后端。备选是直接替换构造函数为 options 对象，弃用，会无谓改动现有测试与调用方。

### D8: 迁移在渲染前完成，且不删除旧键

`apps/desktop/src/main.tsx` 在创建配置层后、渲染前执行一次性迁移：

1. 若 `/Config/system.json` 已存在，跳过；
2. 否则读取 localStorage 的 `vela.desktop.settings.v1`，解析并校验；
3. 写入 `system` 作用域并 `await flush()`；
4. 不删除旧键。

迁移放在渲染前，避免首个渲染周期读到默认值后再闪回。迁移失败只记录并继续使用默认值，不阻塞启动。备选是在 `SettingsStore` 构造函数内同步迁移，弃用，因为无法等待 IndexedDB 写入完成。

### D9: 应用作用域通过注入的服务访问，VPK 不注入

`DesktopServices` 增加 `config`；内置应用通过它取得 `app(<id>)` 作用域。作用域 id 采用与 VPK 相同的 `^[a-z0-9][a-z0-9-]{1,31}$` 校验，并显式拒绝 `system` 与路径分隔符。这里的隔离是路径与 API 边界，不是完整 ACL：内置应用同处一个 JS 运行时，属于可信代码。VPK 仍拿不到 `DesktopServices`，也没有 postMessage 桥，因此本变更不新增攻击面。

### D10: 重置只作用于单个 scope

`system` 重置只恢复桌面设置默认值，不影响任何应用 scope；应用重置只影响自身。备选是全局重置，弃用，会把用户应用偏好一并清空，超出“重置设置”的预期。

## Risks / Trade-offs

- [localStorage 旧键在迁移后继续存在，后续修改不再同步到旧键] → 回滚只能恢复迁移前快照；这是保留单一事实源的代价，迁移说明中明确写出。
- [VFS 单文件写入没有跨作用域事务] → 不提供跨作用域批量写入；每个 scope 独立提交，失败只影响当前 scope。
- [未知字段保留可能让废弃字段长期留在文件中] → 首版接受；后续可在迁移步骤中显式清理并提升版本。
- [应用 id 校验只防路径注入，不防可信内置应用越权] → 内置应用视为可信；未来接入第三方包时必须先增加宿主代理与权限声明。
- [迁移依赖 `flush()` 才能保证立即刷新不丢数据] → 迁移在渲染前 await；普通设置写入沿用现有行为，IndexedDB 事务已立即入队。

## Migration Plan

1. 先发布 core 配置模块与 desktop 接入，不改旧 localStorage 键。
2. 首次启动执行迁移并等待持久化屏障；失败时使用默认值，不阻塞。
3. 回归验证既有设置、快捷键与 Market URL 语义。
4. 回滚策略：回退到旧版本后仍可从 localStorage 旧键恢复迁移前设置；迁移后的新改动不会回写旧键。
5. 应用作用域暂无数据，不需要数据迁移；未来接入 VPK 时再补作用域清理。
