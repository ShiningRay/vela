## Purpose

让 `.vpk` 应用包以声明方式描述其向 Agent 暴露的表面、图表、数据与工具，并在安装时取得用户对所需权限的明确授权。

## ADDED Requirements

### Requirement: manifest 声明 Agent 能力

manifest SHALL 支持可选 `agent` 段，包含 `surfaces`、`charts`、`datasources`、`tools` 四个可选数组，以及可选 `permissions` 字符串数组。未携带 `agent` 段的包 MUST 保持现有安装与运行行为不变。

#### Scenario: 旧包不受影响

- **WHEN** 安装不含 `agent` 段的既有 `.vpk`
- **THEN** 安装流程与运行行为与当前版本一致，不出现授权步骤

#### Scenario: 非法声明被拒绝

- **WHEN** `agent` 段含未知字段、非法 id 或越权路径
- **THEN** 安装中止并返回指明字段的错误，VFS 不写入任何文件

### Requirement: 安装时权限授权

包声明非空 `permissions` 时，安装流程 SHALL 在写入 VFS 前向用户展示完整权限清单，仅在用户确认后完成安装。授权结果 MUST 随包持久化，卸载时清除。

#### Scenario: 用户拒绝则不安装

- **WHEN** 用户在权限清单界面选择拒绝
- **THEN** 安装中止，VFS 无写入，应用注册表无变化

#### Scenario: 授权随包持久化

- **WHEN** 用户确认授权并完成安装后重启 shell
- **THEN** 该包的授权状态与声明能力自动恢复，无需重新授权

### Requirement: 包 id 即能力命名空间

包声明的表面与数据键 MUST 归属以包 `id` 为 owner 的命名空间，数据键自动加前缀 `pkg.<id>.`。包之间 MUST NOT 互相修改对方的声明能力。

#### Scenario: 跨包修改被拒绝

- **WHEN** 某包的声明试图引用或修改另一包 owner 下的表面
- **THEN** 校验失败并返回 `forbidden`
