# Vela Marketplace

独立的 VPK 插件市场服务：上传 `.vpk`、搜索、下载，并提供浏览器管理页。Vela Desktop 的 Plugin Market 应用通过 HTTP API 读取和安装。

## 启动

```bash
# 仓库根目录
MARKETPLACE_ADMIN_TOKEN=change-me pnpm dev:market
```

默认地址 `http://127.0.0.1:4320`，管理页 `/`，数据在 `services/marketplace/data/`（已 gitignore）。

可选环境变量：

- `MARKETPLACE_PORT`：默认 `4320`
- `MARKETPLACE_HOST`：默认 `127.0.0.1`；部署到公网时显式设 `0.0.0.0`
- `MARKETPLACE_DATA_DIR`：元数据与 VPK 文件目录
- `MARKETPLACE_ADMIN_TOKEN`：上传令牌；未设置时上传返回 503
- `VELA_APPS_VPK_DIR`：`pnpm seed:market` 的 VPK 来源，默认 `../../../vela-apps/dist/vpk`

## 导入演示包

在启动服务之前运行，或导入后重启服务：

```bash
pnpm build # 在 ../vela-apps 仓内
pnpm seed:market
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/plugins?q=&page=&pageSize=` | 搜索/分页 |
| GET | `/api/plugins/:id` | 插件详情与版本 |
| GET | `/api/plugins/:id/download?version=latest` | 下载 VPK，返回 `X-VPK-SHA256` |
| POST | `/api/plugins` | multipart 上传；需 `Authorization: Bearer <token>` |

上传字段：`file`、`description`、`author`、`homepage`、`tags`（逗号分隔）。服务会校验 ZIP、`manifest.json`、id、semver、入口与 VPK 大小限制，并计算 SHA-256。

## 存储与安全

- 元数据：`data/plugins.json`，原子写。
- 文件：`data/files/<id>/<version>.vpk`。
- 上传限制：单包 6 MB，沿用 Vela VPK 限制；保留内置 app id。
- 上传令牌只从环境变量读取，不写入仓库。
- GET/OPTIONS CORS 开放；POST 必须携带 Bearer token。
- 这是单管理员 MVP；没有用户体系、签名校验、审核流或对象存储。

## 测试

```bash
pnpm --filter @vela/marketplace test
```
