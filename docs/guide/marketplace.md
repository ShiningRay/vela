# 插件市场

Vela 内置 Plugin Market 客户端，服务端独立在 [ShiningRay/vela-marketplace](https://github.com/ShiningRay/vela-marketplace)。

## 配置地址

打开 Settings → Marketplace URL，填入市场地址。默认是 `http://127.0.0.1:4320`。

插件市场服务默认端口 `4320`，提供：

- 发布者注册、登录、上传与“我的插件”
- 管理员审核、分类与精选
- 评分评论
- 搜索、排序与分页
- `.vpk` 下载

服务端部署与 API 说明见 [Marketplace README](https://github.com/ShiningRay/vela-marketplace#readme)。

## 从市场安装

1. 打开 Plugin Market。
2. 按分类、排序或关键词找到插件。
3. 点击 Install；下载的 VPK 会走与本地安装相同的校验与沙箱流程。
4. 已安装插件显示 Installed，可点击 Reinstall 覆盖版本。

市场默认地址仍是本机；线上实例部署后，把 Settings 中的地址改为 HTTPS 域名。
