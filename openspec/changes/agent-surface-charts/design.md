# Design: agent-surface-charts

## Context

Vela 现有资产（P0–P1 已落地）恰好覆盖本需求的大部分支点：`@vela/core` 的 WindowManager/AppRegistry/VFS/NotificationCenter；`@vela/remote` 的 Hub/Session/propose·patch·release·barrier；Tauri 2 壳内的 Node 服务 supervisor（健康检查、崩溃重启、日志面板）；IndexedDbVfs 持久化。本设计只新增 Surface 注册表与 MCP 外观层两个薄模块，其余全部复用。

## Goals / Non-Goals

**Goals:**
- Agent 在运行时创建/修改/持久化桌面表面，且状态全部经由 remote 信号同步。
- 图表以声明式 spec 描述，spec 与数据解耦，可独立更新。
- 多 Agent 共存时按 owner 隔离，互不覆盖。

**Non-Goals:**
- 不支持 Agent 提交 HTML/URL/JSX/脚本作为表面内容。
- 不做大数据渲染：>5000 行一律在数据侧聚合。
- 不引入独立 MCP 进程或新 IPC 通道。
- kpi/table 不使用图表库渲染。

## Decisions

### D1: widget 是 WindowRecord 的扩展，而非新概念

`WindowRecord` 增加 `kind` 与 `decorations` 字段。widget 复用几何、z 序、吸附、最小化逻辑，仅 `decorations:false`、不进任务栏、可 `alwaysOnTop`。

- 备选：独立 WidgetManager。弃用——会复制 P1 全部窗口行为，且两套 z 序需额外协调。

### D2: Surface 内容四选一白名单

```ts
type SurfaceContent =
  | { type: "static"; title: string; body: string }
  | { type: "remote"; sourceKey: string }
  | { type: "component"; appId: string; props?: unknown }
  | { type: "chart"; spec: ChartSpec; dataKey?: string };
```

富内容走 `component` 并引用已安装 VPK 应用——安装动作有用户授权闸，这是既有的安全边界。

### D3: ChartSpec 收窄为 7 种 kind + encoding，不透传 ECharts option

option 字段过多且无法校验，Agent 生成易错。收窄后可 JSON Schema 强校验 + 四条语义闸，错误含 `path` 与 `available`，Agent 一次 patch 即可自纠。底层用 ECharts **按需注册**（`echarts/core` + 仅所需图型与组件），bundle 增量约 350KB。

- 备选 A：透传 ECharts option。弃用——无法校验、主题不一致。
- 备选 B：自研 SVG 渲染。弃用——工作量与边界情况（坐标轴、提示、大数据）远超收益。
- 备选 C：全量 echarts 包。弃用——约 1MB，按需可压至三分之一。

### D4: kpi 与 table 走 UI 组件而非 ECharts

这两类本质是排版不是图形。复用 `@vela/ui` 的 Label/Table/Tag，保持字体、对齐、暗色主题一致，且零图表开销。

### D5: 数据与 spec 分离，数据格式为行数组

表面持有 `spec + dataKey`，数据经 remote 信号独立发布。行数组直接对应 SQL 结果/JSON API 响应，对 Agent 最友好。多图共享 dataKey 时一次发布多图更新。

### D6: 持久化只存表面，不存数据

`/Surfaces/<id>.json` 存几何与内容引用。数据由提供方重启后重新发布，widget 自动回填；数据未达时显示「等待数据」占位（默认决策，避免大屏闪空轴）。

### D7: MCP server 并入既有 Node 服务

复用 supervisor 的健康检查、崩溃重启、日志面板。owner 由 MCP 会话身份决定，约束 surface 归属与信号 key 前缀（`agent.<owner>.*`）。

### D8: 整屏原子更新复用 barrier

`dashboard.apply` 把一组 patch 合并到同一 `batch_id`，借 remote 已有的 barrier 提交语义实现同帧切换。协议不变，仅首次真正使用 barrier。

### D9: 时间格式严格 ISO 8601（默认决策）

宽松 `Date.parse` 跨浏览器不一致。`xType:"time"` 仅接受 ISO 8601，失败即报错。

## Risks / Trade-offs

- [ChartSpec 表达力不足以覆盖客户全部图型] → 白名单可扩展，新增 kind 需走 spec 变更；更复杂需求引导至 VPK 应用。
- [行数组全量 patch 在频繁刷新下带宽浪费] → 首版接受；后续可在 remote 增加增量行 patch，属协议演进不阻塞本提案。
- [owner 身份若仅由 Agent 自报则可伪造] → 首版面向本地可信 Agent；接入远端 Agent 时需先在 MCP 握手加认证，届时单独立项。
- [ECharts 与 Solid 细粒度更新冲突导致泄漏] → Chart 组件在 `onCleanup` 中 dispose 实例，spec/data 变化仅调 `setOption`。

## Migration Plan

纯新增能力，无存量迁移。落地顺序见 tasks.md：core 模型 → 渲染 → 持久化回放 → MCP 工具 → dashboard → skill 文档。任一步可独立回滚，不影响既有桌面行为。

## Open Questions

- 大屏数据的拉模式（服务轮询数据库/接客户既有 API）是否需要在 `signal.publish` 之外补充，留待数据源方案明确后另行提案。
