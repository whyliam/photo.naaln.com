# 构建与又拍云部署

使用 Node.js 22 或更高版本。主题由 `themes/WhyL` 子模块固定到已验证的提交，更新主题后需要提交子模块引用。

```sh
git submodule update --init --recursive
npm ci
npm run clean
npm run build
npm run deploy
```

部署使用 `_config.yml` 中的又拍云空间，通过 `UPYUN_OPERATOR`、`UPYUN_PASSWORD` 环境变量提供凭据；不要把凭据写入仓库。

`npm run deploy` 先执行 Hexo 的增量部署，再运行 `tools/finalize-upyun.cjs`：为 `.mjs` 文件显式设置 `application/javascript; charset=utf-8`，并刷新这些模块的 CDN 缓存。又拍云默认将 `.mjs` 当作二进制文件，缺少此步骤时浏览器会拒绝加载 ES 模块。最终步骤失败会返回非零退出码。

部署后检查首页和模块的 HTTP 状态、内容与 MIME；仅看到上传成功不代表浏览器能加载模块。
