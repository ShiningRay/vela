import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Vela",
  description: "Solid + Tauri 桌面平台：窗口、VFS、应用包与插件市场",
  base: process.env.VITEPRESS_BASE ?? "/",
  cleanUrls: true,
  lastUpdated: true,
  head: [["meta", { name: "theme-color", content: "#0f172a" }]],
  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/getting-started" },
      { text: "架构", link: "/ARCHITECTURE" },
      { text: "VPK", link: "/VPK" },
      { text: "组件", link: "/components/" },
      { text: "GitHub", link: "https://github.com/ShiningRay/vela" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "指南",
          items: [
            { text: "开始使用", link: "/guide/getting-started" },
            { text: "插件市场", link: "/guide/marketplace" },
            { text: "发布与签名", link: "/RELEASING" },
          ],
        },
      ],
      "/": [
        {
          text: "平台",
          items: [
            { text: "架构", link: "/ARCHITECTURE" },
            { text: "VPK 应用包", link: "/VPK" },
            { text: "Roadmap", link: "/ROADMAP" },
          ],
        },
        {
          text: "资源",
          items: [
            { text: "组件示例", link: "/components/" },
            { text: "Vela Apps", link: "https://github.com/ShiningRay/vela-apps" },
            { text: "Marketplace", link: "https://github.com/ShiningRay/vela-marketplace" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/ShiningRay/vela" }],
    footer: {
      message: "Vela Desktop · MIT",
      copyright: "Copyright © 2026 ShiningRay",
    },
    outline: { level: [2, 3] },
  },
});
