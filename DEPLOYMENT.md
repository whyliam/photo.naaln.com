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

`npm run deploy` 先执行 Hexo 的增量部署，再运行 `tools/finalize-upyun.cjs`：为 `.mjs` 文件显式设置 `application/javascript; charset=utf-8`，并分批刷新所有页面规范地址及可变 CSS/JavaScript 资源的 CDN 缓存。又拍云默认将 `.mjs` 当作二进制文件，缺少 MIME 修正时浏览器会拒绝加载 ES 模块；缺少页面和资源刷新时，则可能在上传成功后继续命中旧版本。最终步骤会重试临时的 CDN 刷新失败，持续失败时返回非零退出码。

部署后检查首页和模块的 HTTP 状态、内容与 MIME；仅看到上传成功不代表浏览器能加载模块。
