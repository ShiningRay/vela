# `.vpk` application packages

Vela packages are ZIP archives with a root `manifest.json`, an HTML entry and
optional resources. They are installed into the persistent VFS under
`/Apps/<id>/` and launched inside a sandboxed iframe.

## Layout

```
hello.vpk
├── manifest.json
├── index.html
└── assets/
    ├── app.js
    └── style.css
```

`manifest.json`:

```json
{
  "id": "hello-package",
  "name": "Hello Package",
  "version": "1.0.0",
  "entry": "index.html",
  "icon": "H",
  "window": { "width": 640, "height": 460 }
}
```

- `id`: `^[a-z0-9][a-z0-9-]{1,31}$`; built-in ids (`about`, `files`, `editor`,
  `terminal`, `marketplace`, `service`, `settings`) are reserved.
- `entry`: an HTML file at the package root.
- `icon`: optional text glyph shown on the desktop (max 4 characters).
- `window`: optional initial window size; width >= 240, height >= 180.

## Agent capability declarations (optional)

A package may declare what it offers to the desktop Agent in an optional
`agent` section plus a `permissions` array. Packages without the section keep
the exact install and runtime behaviour described above — no consent step
appears for them.

```json
{
  "id": "sales-board",
  "agent": {
    "surfaces": [
      { "id": "kpi", "kind": "widget", "title": "Sales today",
        "geometry": { "x": 40, "y": 60, "width": 220, "height": 120 },
        "content": { "type": "chart", "spec": { "kind": "kpi", "encoding": { "value": "revenue" } }, "dataKey": "daily" } }
    ],
    "charts": [
      { "id": "trend", "spec": { "kind": "line", "encoding": { "x": "date", "y": "revenue" } }, "dataKey": "daily" }
    ],
    "datasources": [{ "key": "daily", "tool": "query_daily" }],
    "tools": [
      { "name": "query_daily", "type": "http", "endpoint": "https://api.example.com/daily",
        "method": "GET", "params": { "from": "string" } },
      { "name": "seed_rows", "type": "static", "path": "data/seed.json" }
    ]
  },
  "permissions": ["surface:create", "signal:publish", "net:api.example.com"]
}
```

- `surfaces` / `charts`: declared desktop surfaces. The package `id` is the
  owner namespace (`pkg.<id>`); declared surface/chart ids are prefixed
  (`<id>.<decl>.`), chart data flows through the `pkg.<id>.data.<key>` signal.
- `datasources`: maps a data key to one of the package's own tools. Referencing
  an undeclared tool is rejected as `forbidden`.
- `tools`: declarative only — packages cannot ship tool code. Two forms:
  - `http`: the host performs the request against the declared endpoint.
    Responses must be row arrays; successful responses for a tool linked to a
    datasource are published to that data key automatically. Requests are
    limited to the granted `net:<host>` sources; loopback, link-local and
    private addresses stay blocked unless the exact host was granted, and
    responses are capped in size and time.
  - `static`: returns a bundled file. Paths must stay inside the package.
  - Any code-entry field (`script`, `module`, `code`, …) fails validation with
    `unsupported_tool`.
- `permissions`: `surface:create`, `signal:publish`, `net:<host>`. Unknown
  permission strings fail validation.

### Install consent

When a package declares an `agent` section, the install flow shows the full
permission list **before anything is written to the VFS**. Denying aborts the
whole install. Granting writes `/Apps/<id>/grants.json`; the grants (and the
declared capabilities) are restored on shell start-up and removed on uninstall.
Installed agent tools appear in the MCP tool table as `<id>.<tool>` and are
unregistered when the package is removed.

## Demo packages

The P4 demo apps live in the separate [ShiningRay/vela-apps](https://github.com/ShiningRay/vela-apps)
repository; their release assets are at
[releases/tag/v0.1.0](https://github.com/ShiningRay/vela-apps/releases/tag/v0.1.0).
Install the published `.vpk` files from Settings → App packages → Install `.vpk`:

- `scientific-calculator.vpk`: the Solid/TypeScript calculator;
- `citrine-sheets.vpk`: the Citrine Sheets Ruby/Opal demo;
- `citrine-market-terminal.vpk`: the Citrine market-terminal demo.

Vela 的内置 Plugin Market 会从独立部署的 `vela-marketplace` 服务搜索并下载 `.vpk`，然后复用同一套安装校验；平台地址在 Settings → Marketplace URL 配置。

## Install flow

1. Settings → App packages → **Install .vpk**.
2. The archive is parsed with `fflate` and validated:
   - max 64 files, 5 MB per file, 6 MB total;
   - no absolute paths, `..`, backslashes or empty segments;
   - `manifest.json` must be at the root and the entry must exist.
3. Files are written to `/Apps/<id>/` in the persistent VFS.
4. The app is registered with `AppRegistry`; it appears on the desktop and in
   the launcher immediately.
5. On the next launch, `DesktopShell` scans `/Apps` and re-registers packages.

## Runtime sandbox

The entry is rendered in an iframe with `sandbox="allow-scripts"` and a
`Content-Security-Policy` that blocks network requests. CSS and JS resources
referenced by `<link>` / `<script src>` are inlined into the entry document;
other resources are exposed through `blob:` URLs. Script attributes, including
`type="module"`, are preserved so bundled module entries remain deferred. There
is no access to the parent desktop, its DOM, local storage or the VFS from
package code.

## Limits of v1

- One HTML entry; no server-side rendering or native modules.
- CSS/JS inlining is string-based, not a full bundler.
- No signing or publisher identity yet; the sandbox is the security boundary.
- Packages are re-read on startup; a window already open keeps its current
  document until reopened.
