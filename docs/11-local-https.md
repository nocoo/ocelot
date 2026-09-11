# 11 · 本地 HTTPS 与端口登记

状态：**配置已完成，可信 HTTPS 与真实浏览器操作已验证** · 2026-09-12

## 用户要求与已接受的配置

本机通过 Caddy 使用 <https://ocelot.dev.hexly.ai/>，先查询 nmem 再分配端口。
查询基础设施总表及最近的 hexly.ai、Giraffe、Poké Pocket 登记后，最近分配到
7048；没有查到 7049 的登记，实际监听列表也没有以下端口。

| 用途 | 端口 | 状态目录 |
| --- | --- | --- |
| 日常 Vite，Caddy 的上游 | 7049 | — |
| 日常 Worker | 37049 | `.wrangler/state` |
| 日常 Worker inspector | 38049 | — |
| 浏览器验收 Vite preview | 27049 | — |
| 验收 Worker / HTTP API | 17049 | `.wrangler/e2e` |
| 验收 Worker inspector | 18049 | — |

沿用主端口、API 测试 +10000、浏览器测试 +20000、开发辅助 +30000 的分配规则；
inspector 在对应 Worker 端口上加 1000。同步登记 nmem，避免后续项目占用。
开发与测试分别使用自己的 D1/R2，只有测试启动会重建测试状态目录。

## 实施约定

- Caddy 活跃配置是 `/opt/homebrew/etc/Caddyfile`，本机不是符号链接。
  仅添加 Ocelot 的 HTTP → HTTPS 跳转和到 `127.0.0.1:7049` 的反向代理，
  同步 workflow 仓库的 Caddy 配置副本，不修改其他站点。
- 复用本机 mkcert 证书；已经检查其 SAN 包含 `*.dev.hexly.ai`，证书未过期。
  不生成、复制或提交证书私钥。通配符 DNS 应解析到 `127.0.0.1`。
- Vite 仅监听 loopback，允许准确的 Ocelot 开发域名；API 代理将 Host 改为
  loopback 上游，保留浏览器 Origin。local Worker 只恢复明确允许的本地
  Origin 后执行共享 CSRF 检查；生产身份和同源校验保持原有边界。
- 更新启动、独立 Worker、Playwright 及双语运行说明；不要占用其他项目的
  5173 或默认 8787。启动脚本显示 HTTPS 入口。
- Caddy 先验证完整配置，再平滑 reload。日常开发不依赖测试服务器，
  CI 的浏览器验收不依赖本机 Caddy 或证书。

## 验收计划与证据

- nmem `ocelot-local-ports` 已登记上述六个端口；启动前分别绑定确认空闲。
  日常服务实测只监听 `127.0.0.1:7049 / 37049 / 38049`，浏览器测试结束后
  测试服务退出，日常阅读不受影响。
- Caddy 完整配置验证成功并平滑 reload；HTTP 返回 `301` 到准确的 HTTPS
  域名，HTTPS 返回 `200`。系统 curl 与 Chromium 均通过证书验证，没有关闭
  TLS 校验。现有通配符证书有效期至 2028-11-14，无需重新签发。
- Chromium 通过真实 HTTPS 入口收到 Vite WebSocket `connected`；本地
  场景切换与连接检查返回 `200`，合成知识库添加 `201`、移除 `200`。
  长文的 144 个目录项与 Raw 原文均能读取，页面无 JavaScript 异常。
- Worker UT 覆盖正确 HTTPS Origin、登记的 loopback 端口、不支持的域名、
  相似域名、错误协议、旧端口及跨站请求；共享生产 CSRF 校验没有放宽。
- 独立端口的完整阅读器流程与最新视觉结果见 [10](10-reader-interactions.md)。

## 其他机器的 Caddy 配置

先在当前机器安装并信任 mkcert CA，生成覆盖 `*.dev.hexly.ai` 的证书，再向
已有 Caddyfile 添加下列站点。证书路径改成当前机器上的实际路径，不复用或提交
另一台机器的私钥。

```caddyfile
http://ocelot.dev.hexly.ai {
    redir https://ocelot.dev.hexly.ai{uri} permanent
}

ocelot.dev.hexly.ai {
    tls /path/to/cert.pem /path/to/key.pem
    reverse_proxy 127.0.0.1:7049
}
```

```sh
caddy validate --config /opt/homebrew/etc/Caddyfile --adapter caddyfile
caddy reload --config /opt/homebrew/etc/Caddyfile --adapter caddyfile
bun run dev
```

本机已保存活跃配置及 workflow 的版本化副本。生产部署流程不依赖这些本机文件。
