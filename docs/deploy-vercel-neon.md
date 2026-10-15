# 部署到 Vercel (Hobby) + Neon (Free) — DEMO 用

仅用于演示：`PAYMENT_MODE=mock`、`HARDWARE_MODE=simulator`、`LINE_MODE=simulator`。不需要任何真实 Stripe / PayPay / LINE / 硬件凭证。

## 1. 创建 Neon 数据库

1. 在 https://neon.tech 新建 Project（Region 建议 `Asia Pacific (Tokyo)` 或 `Singapore`，与 Vercel Function 区域接近）。
2. 在 Connection Details 里拿两条连接串：
   - **Pooled**（host 含 `-pooler`）→ 用作 `DATABASE_URL`（运行时，Vercel Serverless）。
     末尾加参数：`?sslmode=require&pgbouncer=true&connect_timeout=15`
   - **Direct**（host 不含 `-pooler`）→ 用作 `DIRECT_URL`（仅用于 migrate / seed）。
     末尾：`?sslmode=require`

> Prisma Schema 里**没有**配置 `directUrl`（避免本地开发还要多设一个变量）。
> 迁移 / seed 时用 `DATABASE_URL="$DIRECT_URL" ...` 临时覆盖即可（见第 4 步）。

## 2. Vercel 项目设置

Import GitHub 仓库 `maxzero2023/shinso-pos`，设置：

| 项 | 值 |
|----|----|
| Framework Preset | Next.js |
| Root Directory | `apps/web`（勾选 *Include source files outside of the Root Directory*，默认开启） |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile`（已写在 `apps/web/vercel.json`） |
| Build Command | `cd ../.. && pnpm build`（= `prisma generate` → `next build`，已写在 `apps/web/vercel.json`） |
| Output Directory | 默认（`.next`），不要改 |
| Node.js Version | 20.x（根 `package.json` `engines.node = 20.x`，`.nvmrc` = 20） |
| pnpm | 由根 `package.json` 的 `packageManager: pnpm@9.15.0` 决定 |

`packages/db/prisma/schema.prisma` 的 `binaryTargets = ["native", "rhel-openssl-3.0.x"]`，保证 Vercel 运行环境能找到 Prisma 引擎。

## 3. 环境变量（Vercel → Settings → Environment Variables）

| 变量 | 必填 | 值 / 说明 |
|------|------|-----------|
| `DATABASE_URL` | ✅ | Neon **pooled** 连接串（`...-pooler...?sslmode=require&pgbouncer=true&connect_timeout=15`） |
| `DIRECT_URL` | 本地用 | Neon **direct** 连接串；仅在本机跑 migrate/seed 时使用，Vercel 运行时不读取（可不设） |
| `SESSION_SECRET` | ✅ | 随机 ≥32 字符（`openssl rand -base64 32`）。不设会退回代码里的公开默认值，**不安全** |
| `QR_HMAC_SECRET` | ✅ | 随机 ≥32 字符。同上 |
| `NEXT_PUBLIC_APP_URL` | ✅ | 部署后的完整域名，如 `https://shinso-pos.vercel.app`（无结尾 `/`）。用于生成桌台 QR 链接；不设会指向 `http://localhost:3000` |
| `PAYMENT_MODE` | ✅ | `mock` |
| `HARDWARE_MODE` | ✅ | `simulator` |
| `LINE_MODE` | ✅ | `simulator` |

可选（demo 不需要，代码里都有默认值）：`NEXT_PUBLIC_ENABLE_WECHAT_ALIPAY`（默认开）、`PAYPAY_WEBHOOK_SECRET` / `WECHAT_WEBHOOK_SECRET` / `ALIPAY_WEBHOOK_SECRET`（simulator 默认值）、`STRIPE_*`、`PAYPAY_*`、`WECHAT_*`、`ALIPAY_*`、`LINE_CHANNEL_*`（仅 sandbox/live 才需要）。

> 先部署一次拿到域名 → 设置 `NEXT_PUBLIC_APP_URL` → Redeploy。

## 4. 迁移 + Seed（在本机执行一次，连 Neon direct）

```bash
pnpm install --frozen-lockfile
export DIRECT_URL="postgresql://USER:PASS@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"

DATABASE_URL="$DIRECT_URL" pnpm db:migrate:deploy   # prisma migrate deploy
DATABASE_URL="$DIRECT_URL" pnpm db:seed             # 居酒屋 demo 数据
```

⚠️ `db:seed` 会先 `deleteMany` 清空业务表再重建（可重复执行，用于重置 demo），**不要对有真实数据的库执行**。
迁移不在 Vercel build 中自动执行（避免 pooled 连接做 DDL、也避免每次部署重置）；Schema 变更后需手动再跑 `db:migrate:deploy`。

## 5. Demo 账号

密码均为 `demo1234`：

| 账号 | 角色 |
|------|------|
| `owner@shinso.demo` | Owner（店舗 A） |
| `floor@shinso.demo` | Floor / POS |
| `brandadmin@shinso.demo` | Brand admin（跨店） |
| `manager@` / `kitchen@` / `manager-b@` / `floor-b@` `shinso.demo` | 其他角色 |

登录页：`https://<你的域名>/login`。

## 6. Vercel Serverless / Hobby 注意事项

- 代码无文件系统写入、无常驻进程、无 WebSocket / SSE；厨房屏 / POS / 设备页等均为浏览器 `setInterval` 轮询（2–5 秒）→ 可在 Serverless 运行。多开页面会消耗较多函数调用（Hobby 有月度额度），演示结束可暂停。
- 硬件为 simulator（打印任务等仅写数据库），不连接真实 T1 / 打印机。
- Neon Free 计算节点空闲约 5 分钟自动休眠，首个请求会有 ~1 秒冷启动；存储上限 0.5 GB。
- Hobby 函数默认超时 10 秒；演示用 API 均为短查询，通常足够。
- 会话 Cookie 为 `secure`，必须通过 https 访问（Vercel 默认 https）。
- 本地验证 Neon 同类环境：`docker compose up -d && cp .env.example .env && pnpm db:migrate:deploy && pnpm db:seed`。
