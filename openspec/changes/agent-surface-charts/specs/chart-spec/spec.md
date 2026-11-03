## Purpose

提供一套声明式图表规格（ChartSpec），让 Agent 用受校验的有限字段描述图表，并将规格与数据解耦以支持独立更新。

## ADDED Requirements

### Requirement: 声明式图表规格

系统 SHALL 接受 ChartSpec 描述图表，支持 `line`、`bar`、`pie`、`gauge`、`kpi`、`table`、`scatter` 七种。数据契约 MUST 为行数组（`Record<string, unknown>[]`），规格通过 `encoding` 引用行字段名。系统 MUST NOT 接受任意底层图表库配置。

#### Scenario: 创建一个折线图

- **WHEN** 提交 `kind:"line"`、`encoding:{x:"date", y:"revenue"}` 及匹配的行数据
- **THEN** 桌面渲染以 date 为横轴、revenue 为纵轴的折线图

### Requirement: 规格语义校验

除结构校验外，系统 MUST 执行以下语义校验：kind 与 encoding 形态匹配；encoding 引用字段在数据中存在；`series` 与多元素 `y` 互斥；`gauge` 必须提供 `max`；数值字段可解析。任一失败 MUST 返回含 `path`、`message` 的结构化错误，字段缺失时 MUST 附 `available` 字段列表。

#### Scenario: 字段名拼错可自纠

- **WHEN** 规格引用不存在的字段 `revnue`
- **THEN** 返回 `unknown_field` 错误，`path` 为 `encoding.y`，`available` 含 `revenue`

#### Scenario: gauge 缺 max 被拒绝

- **WHEN** 提交 `kind:"gauge"` 但 encoding 无 `max`
- **THEN** 返回 `invalid_spec` 错误且不渲染

### Requirement: 规格与数据解耦

图表表面 SHALL 通过 `dataKey` 引用数据。更新规格 MUST NOT 影响数据流；发布新数据 MUST NOT 改变规格或几何。多个图表 MAY 绑定同一 dataKey，一次数据发布 SHALL 更新所有绑定图表。

#### Scenario: 改图型不断数据

- **WHEN** 将某图表的 `kind` 从 `bar` 改为 `line`
- **THEN** 仅图表形态变化，已绑定数据继续生效，无需重新发布

#### Scenario: 一次发布多图更新

- **WHEN** 三个图表绑定同一 dataKey 且该键发布新数据
- **THEN** 三个图表在同一批更新中刷新

### Requirement: 数据量与空态约束

单次发布行数据超过 5000 行时系统 SHALL 拒绝并提示在数据侧聚合或降采样。图表已创建但数据尚未到达时 MUST 显示「等待数据」占位而非空坐标轴。

#### Scenario: 空数据占位

- **WHEN** 图表表面已创建而 dataKey 尚无数据
- **THEN** 显示等待数据占位，数据到达后替换为图表

### Requirement: 时间与数值格式约束

`xType:"time"` 时时间字段 MUST 为严格 ISO 8601 字符串，解析失败 MUST 返回错误。数值格式化 SHALL 支持 `decimals` 与 `yUnit`，且 MUST NOT 接受函数形式的格式化器。

#### Scenario: 非 ISO 时间被拒绝

- **WHEN** `xType:"time"` 而时间字段为 `2026/11/04`
- **THEN** 返回 `invalid_time` 错误
