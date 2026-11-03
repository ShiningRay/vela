# Tasks: vpk-agent-declarations

## 1. Manifest schema 与校验

- [x] 1.1 定义 `agent`/`permissions` 段 schema（surfaces/charts/datasources/tools）与未知字段拒绝，Vitest 覆盖正反例
- [x] 1.2 校验工具声明仅 http/static，含代码入口字段即返回 `unsupported_tool`
- [x] 1.3 校验包 id 命名空间与 `pkg.<id>.` 数据键前缀，跨包引用返回 forbidden
- [x] 1.4 确认旧包（无 agent 段）安装与运行行为不变，既有 vpk e2e 全绿

## 2. 安装授权

- [x] 2.1 安装流程在写 VFS 前插入权限清单界面，Playwright 验证确认后安装成功、拒绝后零写入
- [x] 2.2 授权记录写 `/Apps/<id>/grants.json` 并随启动回放，Playwright 验证 reload 后授权与声明能力恢复
- [x] 2.3 卸载清除授权记录，Vitest/Playwright 验证

## 3. 声明注册与工具执行

- [x] 3.1 安装后将 surfaces/charts 注册进 SurfaceRegistry（依赖 agent-surface-charts 落地后联调）
- [x] 3.2 http 工具由 Node 服务执行，含 `net:` 源白名单、SSRF 网段阻断、大小与超时上限，Vitest 覆盖各拒绝路径
- [x] 3.3 static 工具限定本包目录，越界路径返回 forbidden
- [x] 3.4 工具注册进 MCP 工具表并加 `<id>.` 前缀，卸载同步注销，MCP client 实测调用与卸载后不存在

## 4. 文档与示例

- [x] 4.1 更新 `docs/VPK.md`：agent 段、permissions、两种工具形态与示例
- [x] 4.2 在 vela-apps 仓新增一个声明式示例包（chart + http 工具），端到端验证安装→授权→Agent 调用→出图

## 5. 整体验证

- [x] 5.1 `pnpm typecheck && pnpm test && pnpm build && pnpm e2e` 全绿
