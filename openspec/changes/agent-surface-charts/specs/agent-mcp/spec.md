## Purpose

通过 MCP 工具向 Agent 暴露桌面表面、图表与通知能力，并提供整屏原子更新与白名单文件访问。

## ADDED Requirements

### Requirement: MCP 工具集

系统 SHALL 在随应用启停的 Node 服务中提供 MCP server，暴露 `surface.create/patch/remove/list`、`chart.create/patch/pushData`、`dashboard.apply`、`signal.publish`、`notify.push`、`vfs.read/write` 工具。所有工具调用 MUST 携带调用方 owner 身份。

#### Scenario: Agent 端到端建图

- **WHEN** Agent 依次调用 `chart.create`（含 spec 与 dataKey）与 `chart.pushData`
- **THEN** 桌面出现对应图表 widget，且该 widget 归属该 Agent 的 owner

### Requirement: 整屏原子更新

`dashboard.apply` SHALL 将一组表面变更合并为同一批次，利用同步协议的 barrier 机制，使整屏在同一帧内完成切换，不得逐图闪烁。

#### Scenario: 大屏整屏切换

- **WHEN** 对包含多个图表的 dashboard 调用 `dashboard.apply`
- **THEN** 所有变更在同一批次提交，观察者看到整屏一次性更新

### Requirement: 文件访问白名单

`vfs.read/write` MUST 仅允许访问 `/AgentData/<owner>/**` 路径，越界访问 SHALL 返回 `forbidden`。

#### Scenario: 越界写入被拒绝

- **WHEN** owner 为 `agent-a` 的调用方写 `/Surfaces/x.json`
- **THEN** 返回 `forbidden` 且文件系统不变

### Requirement: 服务治理复用

MCP server MUST 运行于既有 Node 服务进程内，复用其健康检查、崩溃重启与日志面板，不得引入独立生命周期。

#### Scenario: 服务崩溃后自动恢复

- **WHEN** Node 服务进程被强杀
- **THEN** 监督进程自动重启服务，MCP 工具随服务恢复可用
