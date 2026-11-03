## Purpose

提供不执行包内代码的声明式工具机制，由宿主内置实现代为执行，并注册为 Agent 可调用的 MCP 工具。

## ADDED Requirements

### Requirement: 声明式工具形态

工具声明 SHALL 仅支持 `http` 与 `static` 两种形态。`http` 声明端点、方法与参数 schema，由宿主发起请求；`static` 返回包内静态资源。系统 MUST NOT 执行包内提供的任何工具代码。

#### Scenario: 声明一个 http 工具

- **WHEN** 包声明 `type:"http"`、端点、方法及参数 schema 且用户已授权
- **THEN** Agent 调用该工具时由宿主发起请求并返回响应，包内无代码执行

#### Scenario: 附带可执行工具被拒绝

- **WHEN** 工具声明携带 `script`、`module` 或任何代码入口字段
- **THEN** 安装校验失败并返回 `unsupported_tool`

### Requirement: 工具注册为 MCP 工具

已授权包的工具 SHALL 注册进 MCP 工具表，名称加包 id 前缀以避免冲突；Agent 经既有 MCP 通道即可调用。卸载包 MUST 同步注销其全部工具。

#### Scenario: Agent 调用包工具

- **WHEN** 包 `sales-board` 声明工具 `query` 且已安装授权
- **THEN** MCP 工具表出现 `sales-board.query`，Agent 调用得到宿主执行的结果

#### Scenario: 卸载即注销

- **WHEN** 卸载该包
- **THEN** 其工具从 MCP 工具表移除，后续调用返回工具不存在

### Requirement: http 工具的网络约束

http 工具的端点 MUST 限定于声明的源，宿主 SHALL 校验目标并阻断指向回环、链路本地与私网网段的未授权请求。响应 MUST 有大小与超时上限。

#### Scenario: SSRF 目标被阻断

- **WHEN** 工具调用使请求指向 `169.254.169.254` 或其他未授权私网地址
- **THEN** 宿主拒绝发起请求并返回 `forbidden_target`

#### Scenario: 响应超限被截断拒绝

- **WHEN** 响应超过声明的大小上限或未在超时内完成
- **THEN** 返回 `response_too_large` 或 `timeout` 错误

### Requirement: static 工具路径约束

static 工具 MUST 仅返回本包目录内的资源，路径含 `..`、绝对路径或指向他包时 SHALL 被拒绝。

#### Scenario: 越界路径被拒绝

- **WHEN** static 工具请求 `../other-package/secret.json`
- **THEN** 返回 `forbidden` 且不读取任何文件
