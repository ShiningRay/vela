# Design: vpk-agent-declarations

## Context

vpk 现行模型：manifest 六字段，包代码在 `sandbox="allow-scripts"` iframe + CSP 断网中运行，无父桌面/VFS 访问，无签名。`agent-surface-charts` 提案将引入 SurfaceRegistry 与 owner 隔离模型，本提案依赖其命名空间概念但不重复实现。

用户已确认路线：**先纯声明（C），后服务端沙箱（B），跳过 postMessage 桥（A）**。本提案即 C。

## Goals / Non-Goals

**Goals:**
- 装包即获得 Agent 可用的表面、图表、数据与工具声明。
- 权限在安装时显式授权，可持久化、可随卸载清除。
- 不破坏 iframe 沙箱与 CSP 的零信任模型。

**Non-Goals:**
- 不执行包内工具代码，不建服务端沙箱（B 另立提案）。
- 不加 postMessage 桥（A 已否决：iframe 断网下桥无收益且凿穿 CSP）。
- 不引入包签名与发布者身份（沿用 v1 限制，另行规划）。

## Decisions

### D1: manifest 增加 `agent` 段而非平铺字段

```json
{
  "id": "sales-board",
  "agent": {
    "surfaces":  [{ "id": "main", "kind": "widget", "content": { "type": "chart", "spec": "...", "dataKey": "daily" } }],
    "charts":    [{ "id": "trend", "spec": { "kind": "line", "encoding": { "x": "date", "y": "revenue" } } }],
    "datasources": [{ "key": "daily", "tool": "query_daily" }],
    "tools":     [{ "name": "query_daily", "type": "http", "endpoint": "https://api.example.com/daily", "method": "GET", "params": "tools/query_daily.schema.json" }]
  },
  "permissions": ["surface:create", "signal:publish", "net:api.example.com"]
}
```

集中一段便于整体校验与授权展示，也让旧包零感知。

### D2: 声明式工具仅 http 与 static 两种

覆盖「展示数据」的主要取数形态：调既有 API（http）与读包内种子数据（static）。SQL 声明暂缓——需要宿主管理数据库连接与凭据，复杂度和风险都高于 http，等真实需求出现再加。

- 备选：开放任意 SQL 声明。弃用——凭据管理与注入面都需新建机制。

### D3: http 工具由宿主发起请求并做 SSRF 防护

包声明 `net:<host>` 权限，宿主仅允许访问已授权源；默认拒绝回环、链路本地（169.254.0.0/16）与私网网段，除非显式声明。响应设大小与超时上限。请求从 Node 服务发出，包 iframe 的 CSP 不受影响。

### D4: 权限模型复用 owner 命名空间

包 id 即 owner，数据键加 `pkg.<id>.` 前缀，MCP 工具名加 `<id>.` 前缀。与 `agent-surface-charts` 的 `agent.<owner>.*` 并列，命名空间前缀区分来源（`pkg.` vs `agent.`）。

### D5: 授权是安装流程的一个前置步骤

校验 manifest → 展示权限清单 → 用户确认 → 写 VFS → 注册声明。拒绝即整体中止，无部分安装。授权记录存 `/Apps/<id>/grants.json`，启动回放时一并读取。

## Risks / Trade-offs

- [声明式工具表达力不足，客户要自定义加工逻辑] → 接受。加工逻辑应由 Node 服务侧的连接器或后续 B 方案承担，不在包内。
- [http 工具暴露内网接口] → SSRF 防护 + `net:` 权限显式授权 + 安装时展示目标源。
- [与 agent-surface-charts 的联调依赖] → 两提案可并行开发各自核心；本提案的注册任务排在其 SurfaceRegistry 落地之后。
- [授权 UI 增加安装摩擦] → 无 `agent` 段的旧包完全不出现该步骤，仅新能力包受影响。

## Migration Plan

纯增量。旧包行为不变。落地顺序：manifest schema 与校验 → 授权 UI 与持久化 → 工具注册与执行 → 文档与示例包。回滚仅需忽略 `agent` 段。

## Open Questions

- `datasources` 的拉模式（宿主按声明周期轮询 http 工具并发布到数据键）是否纳入本提案，待与 `agent-surface-charts` 的数据源讨论合并决定；首版可先由 Agent 显式调用工具后 publish。
