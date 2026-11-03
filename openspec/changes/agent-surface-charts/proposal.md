# Proposal: agent-surface-charts

## Why

Vela 目前没有任何让 Agent 在运行时改变桌面展示内容的能力：窗口只能由用户在 shell 里手动打开，通知只是瞬时消息。客户的典型场景是数据大屏与实时业务展示——需要 Agent 根据对话或数据流，在桌面上创建、调整、持久化图表与小组件。当前缺失三层东西：可编程的桌面表面（surface）、声明式图表 DSL、以及给 Agent 调用的 MCP 外观层。

## What Changes

- **`@vela/core` 新增 SurfaceRegistry**：统一描述 window / widget / panel 三类桌面表面。widget 复用 WindowRecord 的几何、z 序、吸附逻辑，但无窗口装饰、不进任务栏。surface 记录按 owner 命名空间隔离，可选持久化到 VFS（`/Surfaces/<id>.json`），支持 `ttlSeconds` 自动过期。
- **`@vela/core` 新增 ChartSpec**：7 种图表（line/bar/pie/gauge/kpi/table/scatter）的声明式 DSL，`encoding` 描述数据到视觉通道的映射。刻意不透传 ECharts option，以便 JSON Schema 强校验与主题一致性。
- **`@vela/ui` 新增 `<Chart>` 组件**：`mapSpecToOption(spec, rows, theme)` 纯函数 + 渲染。kpi/table 两种走既有 UI 组件而非 ECharts。ECharts 按需注册（`echarts/core`），bundle 增量约 350KB。
- **shell 渲染分支**：DesktopShell 增加 surface 层，启动时从 VFS 回放持久化 surface。
- **Node 服务新增 MCP server**：`@vela/agent-mcp`，复用 P1 的 supervisor/健康检查/日志面板。工具集：`surface.create/patch/remove/list`、`chart.create/patch/pushData`、`dashboard.apply`、`signal.publish`、`notify.push`、`vfs.read/write`（白名单路径）。
- **Dashboard 原子整屏**：一组 surface 借 `@vela/remote` 的 barrier/batch_id 机制同帧切换，避免大屏逐图闪烁。
- **Agent skill 文档**：图表选型决策表 + ChartSpec JSON Schema + 数据量上限（5000 行），随包分发。

## Capabilities

### New Capabilities
- `agent-surface`: SurfaceRegistry、owner 权限模型、widget/panel 渲染、VFS 持久化与回放、TTL 过期。
- `chart-spec`: ChartSpec 类型与 JSON Schema、四条语义校验规则、spec→ECharts option 映射、数据契约（行数组）。
- `agent-mcp`: MCP server 工具集、owner 命名空间隔离、dashboard barrier 原子更新。

### Modified Capabilities
- 无（Vela 尚无已归档的主 spec，本提案全部为新增能力）。

## Impact

- **代码**：`packages/core`（surface.ts、chart-spec.ts）、`packages/ui`（Chart 组件）、`packages/desktop`（shell surface 层）、`services/`（新增 agent-mcp 服务或并入既有 Node 服务）。
- **依赖**：新增 `echarts`（按需注册）、`@modelcontextprotocol/sdk`。
- **协议**：`@vela/remote` 的 barrier 机制首次承担整屏原子更新职责，协议本身不变。
- **安全**：surface content 仅支持 static/remote/component/chart 四种白名单类型，不支持 html/url/脚本注入；vfs 工具限制 `/AgentData/<owner>/**`。
- **未决默认**（已在 design 中标注）：ECharts 按需注册、`xType:"time"` 严格 ISO 8601、空数据显示「等待数据」占位。
