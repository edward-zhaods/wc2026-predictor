# 世界杯 AI 预测器 — 使用与部署

## 一、本地运行（Mac）

双击 `start-mac.command`（或中文名 `启动.command`），会自动启动服务器并打开浏览器。

> 第一次双击若被 macOS 拦截：右键文件 →「打开」→ 确认一次即可。

手动方式：在文件夹里终端执行 `node server.js`，然后浏览器打开 http://localhost:8765

⚠️ 不要直接双击 `index.html` 打开——那样没有代理服务器，AI 请求会因 CORS 失败。

---

## 二、部署到 Vercel

项目已是 Vercel 兼容结构：

```
index.html          ← 静态首页
api/predict.js      ← Serverless Function，自动映射到 /api/predict
server.js           ← 仅本地用，Vercel 会忽略
```

### 方式 A：Vercel CLI（最快）

```bash
npm i -g vercel        # 安装一次
cd WC2026-Predictor
vercel                 # 按提示登录 + 部署，几十秒出网址
vercel --prod          # 部署到正式域名
```

### 方式 B：GitHub + Vercel 网页

1. 把本文件夹推到一个 GitHub 仓库
2. 打开 https://vercel.com/new ，导入该仓库
3. 全部默认，直接 Deploy

部署后访问分配的网址即可使用，AI 请求由 `/api/predict` 自动处理（线上无 CORS 问题）。

---

## 三、API Key 说明

- **默认**：每个用户在页面顶部填自己的 NVIDIA Key（`nvapi-...`）。公开分享时推荐这种，别人用自己的额度，也不暴露你的 key。
- **私人免填（可选）**：在 Vercel 项目 → Settings → Environment Variables 添加
  `NVIDIA_API_KEY = nvapi-你的key`，后端会自动兜底。
  （本地同理：`NVIDIA_API_KEY=nvapi-xxx node server.js`）
  注意：这样任何访问者都会消耗你的额度，仅适合自己用。

⚠️ 切勿把 key 写进代码或提交到公开仓库。
