# 部署自己的象棋

本示例没有绑定任何现有服务器。请替换下面的路径和域名，并使用自己的账号与数据库。

1. 安装 Node.js 24、pnpm 10.34.9，执行 `pnpm install --frozen-lockfile` 和 `pnpm build`。
2. 将 `.env.example` 复制为 `.env`，设置 `NODE_ENV=production`、`WEB_ORIGIN=https://chess.example.com`，并把 `DATABASE_PATH` 指向持久目录的绝对路径。数据库目录应只对服务用户可写。
3. 执行 `pnpm db:migrate`。迁移通过后执行 `pnpm start`，或用进程管理器长期运行后端。后端默认只监听 127.0.0.1:3006。
4. 用 Caddy 等反向代理提供 HTTPS，静态根目录指向 apps/web/dist，并将 /api/* 转发给后端。示例配置见 Caddyfile.example。将域名解析到自己的服务器，并放通公开 HTTP/HTTPS 端口。
5. 验证 /api/health、注册登录退出、两账号建房与加入、轮流走子和刷新恢复。生产 HTTP 会关闭账号写入及好友接口；不要绕过此限制。

升级前用 SQLite 在线备份功能备份数据库，并保留旧程序。不要上传数据库、.env 或会话 Cookie 到 GitHub；不要用别人的平台数据库覆盖此独立项目的数据库。

页面采用 HTTP 定时同步，不依赖 Socket.IO。部署环境需把 Cookie、Origin 请求头正常转发，WEB_ORIGIN 必须与浏览器访问地址一致。
