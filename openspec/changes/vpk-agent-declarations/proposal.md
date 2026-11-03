# Proposal: vpk-agent-declarations

## Why

`.vpk` 包目前只有 `id/name/version/entry/icon/window` 六个字段，包代码运行在断网沙箱 iframe 中，无法声明或提供任何 Agent 可调用的能力。客户的数据展示场景要求「装一个包，Agent 就能用它的图表与数据」，因此需要在 vpk 中引入声明式的 Agent 能力描述，并在安装时获得用户明确授权。

本提案刻意只覆盖**纯声明**形态：包不附带可执行工具代码，工具由宿主内置实现。服务端沙箱执行包内代码属另一独立工程，不在此范围。

## What Changes

- **manifest 扩展**：新增可选 `agent` 段，声明该包向 Agent 暴露的 `surfaces`（表面）、`charts`（图表）、`datasources`（数据键）与 `tools`（纯声明式工具，由宿主内置实现执行）。新增 `permissions` 数组声明所需权限。
- **安装时授权**：安装流程在写入 VFS 前展示权限清单，用户确认后方完成安装；权限记录随包持久化，卸载时一并清除。
- **owner 对齐**：vpk 的 `id` 即 Agent 能力命名空间的 owner，包声明的表面与数据键自动落在该命名空间下，复用 `agent-surface-charts` 的隔离模型。
- **声明注册**：安装后把声明注册进 SurfaceRegistry 与 MCP 工具表，Agent 经既有 MCP 工具即可引用；卸载时注销。
- **声明式工具两种形态**：`http`（声明端点、方法、参数 schema，由宿主发起请求）与 `static`（返回包内静态资源）。二者均无包内代码执行。
- **文档**：`docs/VPK.md` 增补 `agent` 段说明与示例。

## Capabilities

### New Capabilities
- `vpk-agent-manifest`: manifest `agent`/`permissions` 段的 schema、校验规则与安装时授权行为。
- `vpk-declarative-tools`: 声明式工具（http/static）的注册、执行与生命周期，及与 MCP 工具表的对接。

### Modified Capabilities
- 无。Vela 尚无已归档主 spec；vpk 现有安装行为保持不变，仅新增可选段。

## Impact

- **代码**：vpk 安装器（manifest 校验、授权 UI、声明注册）、`@vela/core`（权限记录）、MCP 服务（工具表对接）。
- **依赖**：`agent-surface-charts` 提案的 SurfaceRegistry 与 owner 模型；两份提案可并行开发，但本提案的注册部分须在其落地后联调。
- **安全**：保持 iframe 沙箱与 CSP 不变；http 工具由宿主发起请求，须做端点白名单与 SSRF 防护；权限清单是新增的唯一用户授权闸。
- **明确排除**：包内可执行工具代码、服务端沙箱、postMessage 桥。
