# 发布与签名

## 版本

Vela 使用 Changesets 管理私有包版本与 CHANGELOG：

```bash
pnpm changeset       # 为本次改动选择 bump 级别
pnpm version         # 更新版本、CHANGELOG，并同步 Tauri/Cargo 版本
pnpm release         # 生成 v<version> tag
```

桌面版本以 `apps/desktop/package.json` 为准，`scripts/sync-version.mjs` 会同步到：

- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock`

## Tag 发布

当前 `v0.1.0` 为未签名版本，提供 macOS arm64/x64 DMG、Linux x64 deb/rpm/AppImage、Windows x64 NSIS/MSI 与 SHA256SUMS。

推送 `v*` tag 会触发 `.github/workflows/release.yml`，构建 macOS arm64/x64、Linux x64 与 Windows x64 产物，并创建 GitHub Release。

```bash
git push origin main --follow-tags
```

首次发布前可在 Actions 里手动运行 `release` workflow，只构建并上传 workflow artifact，不创建 Release。

## macOS 签名与公证

未配置证书时 workflow 产出未签名包，Gatekeeper 会提示。配置以下 repository secrets 后再启用签名：

- `APPLE_CERTIFICATE`：Developer ID Application 证书（base64 P12）
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`：App-specific password
- `APPLE_TEAM_ID`

签名与公证需要 Apple Developer Program 账号。证书未配置前，发布说明必须明确标注“未签名”。

## Windows 签名

Windows 代码签名需要 Authenticode 证书与时间戳服务。证书与密码只放 GitHub Actions secrets，不进入仓库；未配置时产物为未签名安装包。

## 自动更新

Tauri updater 需要：

1. 更新签名密钥对，公钥写入 Tauri 配置；
2. 每个平台生成签名更新包；
3. 稳定可访问的 `latest.json` endpoint；
4. 已签名的安装包，否则 Gatekeeper/SmartScreen 会阻断更新。

在 macOS 签名与 Windows 签名就绪前不启用 updater，避免发布不可验证的更新。
