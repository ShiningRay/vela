# 命名

## 最终选择：Vela

- **来源**：船帆座（Vela）。短、好读、好拼写。
- **隐喻**：帆托住风，平台托住应用；不再用“再写一个框架”的叙事。
- **产品名**：Vela Desktop。
- **仓库**：`vela`。
- **npm scope**：`@vela/*`（发布前需核对 npm org 是否可用）。

## 包名

| 包 | 用途 |
|---|---|
| `@vela/core` | 窗口管理、应用注册、命令、VFS、通知、快捷键、信号工具 |
| `@vela/theme` | 设计令牌与 CSS 变量 |
| `@vela/ui` | 基础组件 + 桌面控件 |
| `@vela/desktop` | 桌面 shell 与内置应用 |
| `@vela/app-<name>` | 可运行应用 |
| `@vela/devtools` | 预留：调试面板与信号检查器 |
| `@vela/pkg` | 预留：应用包格式 |

## 代码命名

- 包名、文件名：kebab-case；
- 组件、类型：PascalCase；
- 函数、变量、props、事件：camelCase；
- CSS 变量与类：`--vela-*` / `.vela-*`；
- 桌面应用 ID：`com.vela.desktop`。

## 候选记录

| 名字 | 含义 | 落选原因 |
|---|---|---|
| Tessera | 镶嵌小块 | 拼装隐喻很好，但读音与拼写门槛略高 |
| Lattice | 晶格 | 与 Citrine 晶体意象连续，但过于常见 |
| Aster | 星 / 紫菀 | 短，但气质偏消费产品 |

三个候选都检查过上级目录与 npm 裸包：目录不存在；裸包同名（`vela` 0.22.0 等）不影响 `@vela/*` scope。npm org 的可用性需在发布前到 npm 网页确认。
