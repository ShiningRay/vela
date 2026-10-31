---
layout: home

hero:
  name: Vela
  text: Solid + Tauri 桌面平台
  tagline: 窗口管理、持久化 VFS、沙箱应用包与可独立部署的插件市场。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 查看架构
      link: /ARCHITECTURE
    - theme: alt
      text: GitHub
      link: https://github.com/ShiningRay/vela

features:
  - title: 桌面壳
    details: 多实例窗口、吸附、最小化、任务栏、启动器、菜单栏与快捷键。
  - title: 持久化 VFS
    details: IndexedDB 文件系统，Files、Editor、Terminal 共用；刷新与重启后保留。
  - title: VPK 应用包
    details: ZIP 包在沙箱 iframe 中运行，安装后即时出现在桌面与启动器。
  - title: 插件市场
    details: 发布者账号、审核上架、分类精选、评分评论与独立部署。
  - title: 组件库
    details: 32 个 Solid 组件，含窗口框、任务栏、菜单栏与桌面浮层。
  - title: 单向依赖
    details: core ← theme / ui ← desktop ← apps；远程信号层独立于 Solid。
