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
