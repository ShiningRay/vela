# Tasks: agent-surface-charts

## 1. Core 模型

- [x] 1.1 在 `@vela/core` 新增 `surface.ts`（SurfaceRecord/SurfaceContent/SurfaceRegistry，owner 隔离、TTL），Vitest 覆盖创建/patch/删除/跨 owner 拒绝/过期
- [x] 1.2 在 `@vela/core` 新增 `chart-spec.ts`（ChartSpec 类型 + JSON Schema + 四条语义校验），Vitest 覆盖每种 kind 正反例与 `available` 字段回执
- [x] 1.3 `WindowRecord` 增加 `kind`/`decorations` 字段，确认既有 34 项 core 测试全绿

## 2. 渲染

- [x] 2.1 引入 `echarts` 按需注册，新增 `mapSpecToOption` 纯函数，Vitest 覆盖 5 种 ECharts 图型的映射规则
- [x] 2.2 `@vela/ui` 新增 `<Chart>` 组件（kpi/table 走 UI 组件，含等待数据占位、onCleanup dispose），happy-dom 测试通过
- [x] 2.3 DesktopShell 增加 surface 渲染层，widget 无装饰、不进任务栏，Playwright 验证创建/移动/关闭

## 3. 持久化

- [x] 3.1 surface 记录写 `/Surfaces/<id>.json`，shell 启动回放，Playwright 验证 reload 后 widget 复活且显示等待数据占位
- [x] 3.2 TTL 到期清理与 VFS 记录清除，Vitest 用 fake timers 验证

## 4. MCP 服务

- [x] 4.1 在 Node 服务内挂 `@modelcontextprotocol/sdk`，实现 `surface.*` 四工具，本地 MCP client 跑通 create/patch/remove/list
- [x] 4.2 实现 `chart.create/patch/pushData` 与 `signal.publish`，端到端验证 Agent 建图→推数→改图型
- [x] 4.3 实现 `notify.push` 与 `vfs.read/write` 白名单，测试越界路径返回 forbidden
- [x] 4.4 验证强杀 Node 进程后 MCP 工具随 supervisor 重启恢复

## 5. Dashboard

- [x] 5.1 实现 `dashboard.apply`，将一组 surface 变更合并至同一 batch_id 并经 barrier 提交，Playwright 验证整屏同帧切换

## 6. Skill 文档

- [x] 6.1 编写图表选型决策表 + ChartSpec JSON Schema + 5000 行上限说明，随包分发并用示例 prompt 实测 Agent 首次出图正确

## 7. 整体验证

- [x] 7.1 `pnpm typecheck && pnpm test && pnpm build && pnpm e2e` 全绿，`build:desktop` 产出可用 Vela.app
