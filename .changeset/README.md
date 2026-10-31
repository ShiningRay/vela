# Changesets

Vela 的 npm 包目前全部为 private，Changesets 只负责版本号、CHANGELOG 与本地 tag，不发布 npm。

流程：

1. 改动合并前运行 `pnpm changeset`，选择受影响包和 bump 级别。
2. 发版时运行 `pnpm version`，再提交版本与 CHANGELOG 改动。
3. 运行 `pnpm release` 生成 `v<version>` tag，推送 tag 触发 `.github/workflows/release.yml`。
4. 桌面应用版本同步到 `tauri.conf.json`、`Cargo.toml` 与 `Cargo.lock` 由 `scripts/sync-version.mjs` 完成。
