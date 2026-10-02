# tgsticker2matrix

## 介绍

将 Telegram 贴纸包转换为 Matrix 贴纸包（MSC2545 Image Packs）的 Web App。

- 支持个人包、房间包、Sable Next ZIP 和 FluffyChat ZIP，可一次选择多个输出。
- 支持 TGS、WEBM 动画转 GIF；失败时回退到 Telegram 静态缩略图。
- shortcode 使用贴纸包 ID 前缀，避免不同贴纸包冲突。
- Preact 前端和 Telegram 中继运行在同一个 Cloudflare Worker，Worker 不保存 token。
- 仅支持 Telegram `regular` 贴纸包。

## 使用方法

### 部署

```bash
npx wrangler login
pnpm deploy
```

部署完成后打开 Wrangler 输出的 `https://<name>.workers.dev`。

### 导入

1. 填写 Telegram Bot Token；只导出 ZIP 时不需要 Matrix 凭据。
2. 输入 `https://t.me/addstickers/<name>` 或贴纸包短名。
3. 选择输出方式，并决定是否将动画转换为 GIF。
4. 开始转换，按结果提示在 Matrix、Sable Next 或 FluffyChat 中使用。

自动创建的房间会通过 Matrix 账户数据跨浏览器复用；只有确认旧房间已失效时才会创建新房间。

## 开发

Node >= 20.19 可开发和构建；`preview`、`deploy` 需要 Node >= 22。

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # Vitest
pnpm typecheck  # tsc --noEmit
pnpm lint       # oxlint
pnpm build
pnpm preview
```

核心代码位于 `src/`，Worker 位于 `worker/`。Matrix 贴纸包写入策略集中在 `src/lib/matrix-pack.ts`。

## LICENSE

[MIT License](LICENSE)
