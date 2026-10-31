# 架构

> 状态：P0 骨架。本文记录“为什么这样分层”，以及哪些决定是刻意不做。

## 1. 目标与取舍

Vela 的目标是**桌面平台**，不是新的 UI 框架。客户不接受 Ruby 技术栈，但认可 Citrine 在桌面交互与组件组织上的经验。因此：

- 响应式内核交给 Solid，不再自研；
- 编译器与开发服务器交给 Vite；
- 桌面壳交给 Tauri 2；
- 只保留 Citrine 中**与语言无关**的架构资产：窗口管理、应用注册、VFS、命令总线、键盘优先、桌面 OS 隐喻、测试策略。

## 2. 从 Citrine 到 Solid

| Citrine（Ruby） | Vela（Solid + TS） | 说明 |
|---|---|---|
| `Signal#get/#set` | `createSignal()` | Solid 的读写分离返回 `[get, set]` |
| `computed` | `createMemo()` | 派生值，自动追踪依赖 |
| `Effect` + 依赖栈 | `createEffect()` | Solid 编译器/运行时负责依赖收集 |
| `watch` / `effect` 宏 | `createEffect()` + `onCleanup()` | 清理函数显式返回或注册 |
| `view` 只执行一次 | Solid 组件函数只执行一次 | 语义一致 |
| block 级更新 | JSX 细粒度绑定 | Solid 编译后只更新表达式的 DOM 节点 |
| `state` / `prop` 三宏 | 闭包 + `createSignal` + props | 不做类组件与装饰器 |
| `keyed` 复用（ReusePool） | `<For>` / `<Index>` | `For` 按引用复用，`Index` 按位置 |
| `on_mount` / `on_unmount` | `onMount` / `onCleanup` | 生命周期由 Solid 管理 |
| `error_fallback` | `<ErrorBoundary>` | 组件级兜底 |
| `context` / `use_context` | `createContext` / `useContext` | 祖先解析 |
| `window_key` | `window.addEventListener` 封装 | `@vela/core` 的 HotkeyRegistry |
| 四渲染器（DOM/SSR/Canvas/Memory） | DOM 唯一 | 桌面交付不需要多后端；Canvas 后置 |
| `Signal#set` 深相等短路 | `createDeepSignal` | 对象/数组状态用结构比较 |
| `Scheduler.batch` | `batch()` | Solid 自带批处理 |
| `Num` 跨平台数值工具 | 删除 | JS 数值语义即目标语义 |
| Opal + `Native` | 删除 | 浏览器原生 API 直接可用 |
| `dev_server.rb` / `packager.rb` | Vite / Tauri CLI | 工具链不再自研 |

### 2.1 为什么不用类组件

Citrine 的类组件依赖 Ruby 的 `instance_exec`、动态访问器与 `superclass` 声明合并。TS 里复刻这些需要装饰器、`defineProperty` 和复杂类型体操，收益低于成本。Solid 的函数组件 + 闭包已经能表达同样的“实例状态”与“view 只跑一次”。

### 2.2 深相等

Solid 的 `createSignal` 默认用 `Object.is` 比较。Citrine 的 `Signal#set` 用 Ruby 的 `==`，对 Hash/Array 是深比较。Vela 提供 `createDeepSignal`，用于对象/集合状态；标量状态继续用 `createSignal`。

代价：深比较有开销。约定对象状态保持不可变更新，必要时用 `{ equals: false }` 或自定义比较器。

### 2.3 块级更新

Citrine 的“每个带 block 的节点一个 Effect”在 Solid 中由编译器完成：JSX 里的表达式被编译成独立的响应式绑定，读取哪个信号就只更新那个节点。因此不需要手写 `runBlock` / `ReusePool`。这是本次重写最大的代码删减项。

## 3. 保留的架构资产

### 3.1 窗口管理器是服务

`@vela/core` 的 `WindowManager` 不继承任何 UI 基类：

- 状态是 Solid signal（窗口记录、z 序）；
- 几何操作用纯函数 `clampGeometry` / `halfGeometry`；
- 视图只读 `windows()`，写操作走方法；
- 任何变更都是一次 signal 写，窗口框组件自动更新。

这与 Beryl 的 `WindowManager` 同构，但去掉了 Ruby 的 `assert_outside_effect!` 重入保护：Solid 的 signal 写入是同步的，窗口操作只从事件回调进入，不在渲染期间调用。

### 3.2 应用注册表

`AppRegistry` 保存 `{ id, title, icon, component, singleton }`。桌面图标网格与启动器都读同一份 signal；安装/卸载应用只更新注册表。

窗口与应用通过 **app id = window id** 关联（P0 只支持单例）。多实例窗口需要在 `WindowRecord` 上增加 `appId`，窗口内容按 `appId` 查组件；已列入 P2。

### 3.3 VFS 接口

`Vfs` 是接口，`MemoryVfs` 是当前实现。未来接入 IndexedDB / OPFS 时只换实现，不改应用。路径规则：

- 归一化为以 `/` 开头的绝对路径；
- 写入自动创建父目录；
- 删除目录递归删除子项；
- 根目录不可写、不可删。

### 3.4 命令、快捷键、通知

- `CommandRegistry`：命令 id + 标题 + 执行函数，供启动器/菜单/快捷键复用；
- `HotkeyRegistry`：显式 `attach(window)`，不在构造时碰全局对象，便于 Node 测试；
- `NotificationCenter`：通知列表是 signal，桌面角落渲染，点击关闭。

### 3.5 桌面 OS 隐喻

Emerald 的层次在 Vela 中保留：

```
DesktopShell
├── MenuBar           顶部品牌 / 当前应用 / 状态
├── DesktopIcon grid  注册表应用
├── Window layer      WindowFrame × N
├── Launcher panel    应用启动器（⌘ Space）
├── Notifications     右下角
└── Taskbar           底部窗口列表 / 时钟
```

它不是真正的操作系统：单用户、单会话、没有进程/权限/网络栈。窗口是页面内的 DOM，不是原生窗口。

## 4. 包边界

| 包 | 可以依赖 | 禁止依赖 |
|---|---|---|
| `@vela/core` | `solid-js` | DOM 组件、Tauri |
| `@vela/theme` | 无 | `core`、DOM 组件 |
| `@vela/ui` | `core`（仅类型）、`theme`、`solid-js` | `desktop` |
| `@vela/desktop` | `core`、`ui`、`theme`、`solid-js` | Tauri API |
| `apps/desktop` | 以上 + `@tauri-apps/api` | 框架内部实现 |

`@vela/desktop` 不直接 import Tauri，保证它能在普通浏览器里运行；需要本地文件、通知、系统集成时，由 app 层注入适配器。

## 5. 窗口几何

- `clampGeometry`：宽高不小于最小值、不大于视口；位置限制在视口内；
- 最大化：保存 `restore` 几何，设置全屏矩形；
- 还原：优先恢复 `restore`，再 clamp；
- 吸附：左/右半屏；顶部最大化；
- 视口变化：所有窗口重新 clamp，最大化窗口跟随视口。

这些函数是纯函数，单测覆盖；视图不参与几何计算。

## 6. 测试策略

- `@vela/core` 的纯逻辑（几何、VFS、深相等、注册表）用 Vitest，Node 环境；
- UI 组件后续加 happy-dom / `@solidjs/testing-library`；
- 桌面行为（拖拽、缩放、吸附、启动器）用 Playwright 在浏览器里验证；
- Tauri 壳单独冒烟：`tauri dev` 能开窗、`tauri build` 能出包。

## 7. 与 Citrine 的差异清单（刻意保留）

- 没有 Ruby 的 `prop` 类型校验宏：用 TypeScript 类型 + 运行时校验函数（后续）；
- 没有 `keyed_signal` 表：用 `Map` + signal；
- 没有 SSR/Cavas 渲染器：DOM 唯一；
- 没有 Opal 的跨平台数值差异：不需要 `Num`；
- 没有 `Citrine.dev_mode` 的布局提醒：Vite/浏览器 DevTools 足够。

## 8. 风险

| 风险 | 说明 | 对策 |
|---|---|---|
| Solid 生态较小 | 组件库、招聘不如 React | 组件库自研但接口保持通用；必要时可替换 UI 层 |
| 深相等开销 | 大对象状态频繁写 | 不可变更新 + 局部 signal + 自定义 equals |
| 多实例窗口缺失 | 同一应用只能开一个窗 | P2 在 WindowRecord 上增加 appId |
| VFS 不持久 | 刷新丢失 | P3 接 IndexedDB / OPFS |
| Tauri 壳层 Rust | 团队需装 Rust 工具链 | 业务代码零 Rust；不接受则换 Electron |
