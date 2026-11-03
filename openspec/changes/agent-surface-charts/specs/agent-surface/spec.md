## Purpose

让 Agent 或应用在运行时以编程方式创建、修改、持久化桌面上的窗口、小组件与面板，并按所有者隔离权限。

## ADDED Requirements

### Requirement: 编程式创建桌面表面

系统 SHALL 提供接口在运行时创建三类桌面表面：`window`（标准窗口）、`widget`（无装饰、不进任务栏的浮动组件）、`panel`（容器）。每个表面 MUST 携带全局唯一 id 与 owner 标识。

#### Scenario: Agent 创建一个 widget

- **WHEN** 调用方提交 `kind:"widget"`、几何、内容与 owner
- **THEN** 桌面在指定位置渲染该组件，任务栏不出现对应条目，接口返回 surface id

#### Scenario: 重复 id 被拒绝

- **WHEN** 调用方使用已存在的 surface id 发起创建
- **THEN** 系统返回 `duplicate_id` 错误且不改变现有表面

### Requirement: 所有者命名空间隔离

每个表面 MUST 归属一个 owner。调用方 SHALL 只能修改、删除、枚举属于自己 owner 的表面；跨 owner 操作 MUST 被拒绝。

#### Scenario: 跨 owner 修改被拒绝

- **WHEN** owner 为 `agent-a` 的调用方尝试 patch 属于 `agent-b` 的表面
- **THEN** 系统返回 `forbidden` 错误且目标表面保持不变

### Requirement: 表面持久化与回放

标记 `persist:true` 的表面 MUST 写入 VFS `/Surfaces/<id>.json`，并在 shell 下次启动时自动回放几何与内容引用。表面引用的动态数据 MUST NOT 随表面持久化，由数据提供方在重启后重新发布。

#### Scenario: 重启后 widget 复活

- **WHEN** 一个 `persist:true` 的 widget 存在且 shell 重启
- **THEN** 该 widget 以原几何与内容引用重新出现，数据区显示等待态直至数据重新发布

#### Scenario: 临时表面不留存

- **WHEN** 表面 `persist:false` 或携带 `ttlSeconds` 且已过期
- **THEN** 系统删除该表面且不写入或清除对应 VFS 记录

### Requirement: 白名单内容类型

表面内容 MUST 仅支持 `static`（纯文本）、`remote`（绑定数据键）、`component`（引用已注册应用）、`chart`（声明式图表）四种类型。系统 MUST NOT 接受 html、url 或可执行脚本作为内容。

#### Scenario: 脚本注入被拒绝

- **WHEN** 调用方提交包含 html 或 url 类型的内容
- **THEN** 系统返回 `unsupported_content` 错误
