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

`AppRegistry` 保存 `{ id, title, icon, component, singleton, defaultGeometry }`。桌面图标网格与启动器都读同一份 signal；安装/卸载应用只更新注册表。

`WindowRecord` 带独立的 `appId`，窗口 id 由 shell 生成（首个为 app id，后续为 `appId-N`）。窗口层按 **窗口 id** 做 keyed 渲染，几何或最小化状态变化只更新该窗口的 props；同一应用可开多窗，`singleton` 为 true 的应用仍只保留一个窗口。

### 3.3 VFS 接口

`Vfs` 是同步接口，当前有两个实现：

- `MemoryVfs`：测试与无 IndexedDB 环境；
- `IndexedDbVfs`：启动时加载 IndexedDB 快照到内存，读操作保持同步，写操作先更新内存再排队事务；`flush()` 提供持久化屏障。

`openPersistentVfs()` 优先 IndexedDB，失败时回退内存实现。路径规则：

- 归一化为以 `/` 开头的绝对路径；
- 写入自动创建父目录；
- 删除目录递归删除子项；
- 根目录不可写、不可删。

应用包、设置与文件共享同一套持久化；编辑器和终端只依赖 `Vfs` 接口。

### 3.4 命令、快捷键、通知

- `CommandRegistry`：命令 id + 标题 + 执行函数，供启动器/菜单/快捷键复用；
- `HotkeyRegistry`：显式 `attach(window)`，不在构造时碰全局对象，便于 Node 测试；桌面从 `SettingsStore` 读取并热替换快捷键；
- `NotificationCenter`：通知列表是 signal，桌面角落渲染，点击关闭；`onPush` 宿主桥把通知镜像到 Tauri 系统通知。

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

### 3.6 组件库

`@vela/ui` 提供 P2 的 32 个组件，按职责分为五组：

- 表单：Input / Textarea / Checkbox / Switch / Select / Slider / NumberInput；
- 反馈：Dialog / Confirm / Toast / Alert / Progress / Spinner / EmptyState；
- 布局：Tabs / Accordion / Divider / Breadcrumb / Pagination / Toolbar / StatusBar；
- 数据：List / Table / Tree / KV / Tag / Badge；
- 桌面浮层：Popover / Tooltip / ContextMenu / ColorPicker / DatePicker。

组件只读声明的 props，不依赖 `@vela/desktop`；交互组件使用原生按钮语义或显式 ARIA role，键盘路径以 Tab / Enter / Escape 为底线。测试使用 Vitest + happy-dom，`apps/components` 提供全部组件的 Vite 示例页。

### 3.7 应用包

`.vpk` 是 ZIP 包，根目录必须有 `manifest.json` 与 HTML 入口。安装器在 [packages.tsx](../packages/desktop/src/packages.tsx) 中：

1. `fflate` 解包，限制 64 个文件 / 单文件 5 MB / 总计 6 MB，拒绝绝对路径与 `..`；
2. 校验 manifest id、版本、入口与保留 id；
3. 写入 VFS 的 `/Apps/<id>/`，注册到 `AppRegistry`；
4. 启动时扫描 `/Apps`，恢复已安装应用。

应用入口运行在 `sandbox="allow-scripts"` iframe 中，注入的 CSP 阻断网络；CSS/JS 资源内联，其他资源通过 blob URL 暴露。模块脚本的 `type="module"` 等属性会保留，保证 Vite 构建入口按 defer 语义执行。具体格式见 [VPK.md](VPK.md)。

P4 的 Calculator、Citrine Sheets、Market Terminal 已移到独立仓 [ShiningRay/vela-apps](https://github.com/ShiningRay/vela-apps)：该仓负责源码、打包与 GitHub Release，Vela 主仓只保留 `.vpk` 安装器与沙箱。

### 3.8 插件市场

插件市场服务独立在 [vela-marketplace](https://github.com/ShiningRay/vela-marketplace) 仓，以 HTTP 与桌面解耦：

- `GET /api/plugins` 搜索/分类/精选/排序/分页，`GET /api/plugins/:id/download` 下载已上架 VPK；
- `POST /api/auth/register|login` 发布者账号，scrypt 密码哈希与 7 天会话；`publisher` 上传进入 `pending`，`admin` 可审核；
- `POST /api/plugins` 接收 multipart `.vpk`，校验 ZIP、manifest、semver、入口与 5 MB/6 MB 限制，计算 SHA-256；
- 管理员 API 支持批准/拒绝/暂停、分类与精选；登录用户可评分评论；
- 元数据/账号原子写入 JSON，文件按 `<id>/<version>.vpk` 存储；
- 自带发布者/管理员 Web 管理页、Dockerfile 与 `/data` 持久卷。

Vela 内置的 Plugin Market 读取 `DesktopSettings.marketplaceUrl`（默认 `http://127.0.0.1:4320`），列出插件后把下载的 VPK 交给现有 `parseVpk → installPackage → registerPackageApp` 流程，安装后立即出现在桌面。

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
- `@vela/ui` 组件用 Vitest + happy-dom + `@solidjs/testing-library`，覆盖渲染、事件与键盘路径；
- 桌面行为（拖拽、缩放、吸附、启动器、通知、快捷键）用 Playwright 在浏览器里验证；
- `apps/components` 提供全部组件的 Vite 示例页，并有 Playwright smoke；
- Tauri 壳单独冒烟：`tauri dev` 能开窗、`tauri build` 能出包。

## 7. 与 Citrine 的差异清单（刻意保留）

- 没有 Ruby 的 `prop` 类型校验宏：用 TypeScript 类型 + 运行时校验函数（后续）；
- 没有 `keyed_signal` 表：用 `Map` + signal；
- 没有 SSR/Cavas 渲染器：DOM 唯一；
- 没有 Opal 的跨平台数值差异：不需要 `Num`；
- 没有 `Citrine.dev_mode` 的布局提醒：Vite/浏览器 DevTools 足够。

## 8. 后台服务与远程信号

### 8.1 拓扑

```
Tauri main (Rust)
├─ ServiceState: child + status + desired_running + logs + ready/start timestamps
├─ setup(): spawn bundled Node runtime + services/demo/server.cjs
├─ watchdog: 子进程存活、READY 超时、TCP 健康检查，失败自动重启
├─ commands: service_status / start / stop / restart / health / logs
└─ Exit: kill child；stdin 管道关闭兜底

Node service (127.0.0.1:随机端口)
├─ createSource(...) 权威状态
├─ RemoteHub: snapshot + patch / release / barrier
└─ propose 处理：校验收到的值，写回权威 source

Solid renderer
├─ ServiceWire: 可替换 WsWire，URL 来自 supervisor 状态事件
├─ RemoteSession: key → RemoteSignal 注册表；换线后注册表保留
└─ 视图只读 signal；本地写入先行，服务端 patch 回滚/确认
```

### 8.2 为什么服务端不用 Solid

Node 下 `solid-js` 会解析到 server 构建，`createComputed` 只跑一次、不追踪依赖；权威侧若照搬 Solid effect，更新不会广播。Vela 的做法：

- `@vela/remote/hub` 提供平台无关的 `createSource`（`get` / `set` / `subscribe`），不依赖 Solid；
- `RemoteHub` 只订阅 source，首跑发快照，之后每次变更发 patch；
- `RemoteSession` 才是 Solid 侧，负责把 patch 写进 `createSignal`。

这样服务端可在 Node、Bun、Deno 或任何 JS 运行时直接跑，不引入 DOM 依赖。

### 8.3 生命周期

- 开发/生产启动：Tauri `setup` 中 `start_service`；`VELA_NODE` 可覆盖解释器路径。
- Node 运行时：构建前 `scripts/prepare-node-runtime.mjs` 把当前平台的 Node 二进制暂存到 `src-tauri/runtime/` 并随 bundle 打包；运行期优先用 bundle 内运行时，缺失时才回退系统 `node`。
- 端口：supervisor 以 `VELA_SERVICE_PORT=0` 启动服务，Node 绑定随机空闲端口并在 `READY` 行报告实际 URL；前端通过 `service://status` 事件切换 WS 地址，`RemoteSession` 注册表跨重连保留。
- 正常退出：`RunEvent::Exit` 调用 `stop_service`，kill + wait。
- 异常退出：Rust 为子进程保留 stdin 管道；Node 监听 `stdin` 的 `end` / `close`，父进程消失即自行 shutdown，避免孤儿进程占用端口。
- 崩溃恢复：watchdog 每 2s 检查子进程；进程退出、10s 内未 READY、或 READY 后 TCP 健康检查失败，都会重启服务。
- 日志：stdout/stderr 进入 200 行环形缓冲，同时以 `service://log` 事件推送；Service 应用内可查看。

### 8.4 协议

```json
{"kind":"patch","key":"tasks:list","value":[...],"batch_id":"frame-1"}
{"kind":"barrier","batch_id":"frame-1"}
{"kind":"propose","key":"tasks:list","value":[...]}
{"kind":"release","key":"tasks:list"}
```

- `patch` / `release` 带 `batch_id` 时，客户端先暂存；收到 `barrier` 后在一个 Solid `batch` 中提交，避免跨 key 半帧。
- 客户端 `RemoteSignal.set` 先本地生效，再发 `propose`；服务端确认后广播 `patch`，深相等短路让重复值不再渲染。
- `release` 先把信号置 `undefined` 通知视图清理，再驱逐注册表；后续同 key 的 patch 会以新信号重建。

### 8.5 安全与边界

- 服务只监听 `127.0.0.1`，不暴露到局域网；
- 校验 `Origin`：允许 `localhost` / `127.0.0.1` / Tauri 的 `tauri://localhost` 与 `http://tauri.localhost`；
- `@vela/desktop` 不直接 import Tauri；`apps/desktop` 在入口层把 `service_status` / `service_health` / 日志事件注入 `@vela/desktop` 的稳定信号，浏览器预览可独立运行。

### 8.6 已知限制

- Node 运行时按当前构建平台暂存；跨平台构建需在目标平台执行打包脚本（尚未接 CI 三平台构建）；
- 健康检查是 TCP 可达性 + 子进程存活，不是业务级探针；
- 崩溃重启为固定 2s 轮询，未做指数退避；
- 日志面板与 supervisor 日志共用环形缓冲，尚无级别过滤或导出。

## 9. 风险

| 风险 | 说明 | 对策 |
|---|---|---|
| Solid 生态较小 | 组件库、招聘不如 React | 组件库自研但接口保持通用；必要时可替换 UI 层 |
| 深相等开销 | 大对象状态频繁写 | 不可变更新 + 局部 signal + 自定义 equals |
| 跨平台 Node 运行时 | 暂存脚本只复制当前平台二进制 | P5 CI 在各自 runner 上打包 |
| VFS 不持久 | 刷新丢失 | P3 接 IndexedDB / OPFS |
| Tauri 壳层 Rust | 团队需装 Rust 工具链 | 业务代码零 Rust；不接受则换 Electron |
