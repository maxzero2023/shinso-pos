# SHINSO 前厅 POS + 点餐 MVP

可本地演示的餐饮前厅业务端：**开台 → 点餐（POS / 客人 QR / 员工手持）→ 厨打 → 结账 → 清台**（同一桌同一账单）。

- 仓库：https://github.com/maxzero2023/shinso-pos
- 父需求：Linear [AUT-28](https://linear.app/autoagentshinso/issue/AUT-28)
- 品牌色：`#0E8F52`
- UI：日文优先

## 技术栈

| 层 | 选型 |
|---|---|
| 语言 | TypeScript |
| Web | Next.js 15 App Router（`apps/web`） |
| Monorepo | pnpm workspaces |
| DB | Postgres 16 + Prisma（`packages/db`） |
| 共享逻辑 | `packages/api`（Zod / bcrypt / QR HMAC） |
| 本地 DB | Docker Compose |
| 鉴权 | 员工 session cookie（JWT）；客人 QR 为 HMAC 签名 token |
| 厨房实时 | 2s 轮询 |

## 包结构

```
apps/web          # /login /admin /pos /qr/[token] /staff /kitchen + /api/*
packages/db       # Prisma schema / migrate / seed
packages/api      # 校验、金额合计、QR 签名
docker-compose.yml
```

## 快速开始

```bash
# 1. Postgres
docker compose up -d

# 2. 环境变量
cp .env.example .env

# 3. 依赖
pnpm install

# 4. 迁移 + Seed（居酒屋デモ）
pnpm db:migrate
pnpm db:seed

# 5. 开发服务器
pnpm dev
```

打开 http://localhost:3000

### Demo 账号

| 角色 | Email | Password |
|------|-------|----------|
| Owner | `owner@shinso.demo` | `demo1234` |
| Floor | `floor@shinso.demo` | `demo1234` |
| Kitchen | `kitchen@shinso.demo` | `demo1234` |

Seed 内容：店舗「シンソウデモ店」、3 エリア（カウンター / テーブル / 個室）、12 卓、23 品（前菜・主食・焼鳥・酒類・デザート）、加料（大盛 / 追加ソース / 飲み放題オプション）。

## 演示路径

1. `docker compose up -d` → `pnpm db:seed` → `pnpm dev`
2. 登录 POS：`floor@shinso.demo` → 选桌 **开台** → 加点酒 / 烧鸟 → **送厨**
3. `/kitchen` 看到票 → preparing → ready
4. POS **QR发行** → 手机打开 `/qr/[token]` → 客人再点一道 → 同一 check
5. `/staff` 手持再追加一道
6. POS 结账（PayPay mock）→ 桌台 **free**

## 主要 API

- `POST /api/auth/login` / `POST /api/auth/logout`
- Admin CRUD：`/api/areas` `/api/tables` `/api/menu/*` `/api/staff`
- Floor：`POST /api/tables/:id/open`、`POST /api/checks/:id/items|fire|pay|split`、`GET /api/tables/:id/qr-token`
- Guest QR：`/api/qr/:token/menu|check|items`（无 open check → **409**）
- Kitchen：`GET /api/kitchen/tickets`、`PATCH /api/kitchen/tickets/:id`

## 测试

```bash
# 需先 pnpm dev（或把 TEST_BASE_URL 指到已启动服务）
pnpm test
```

覆盖：

- 开台 → 加菜 → fire → pay → 桌台 free
- QR 追加到同一 open check
- 关单后再下单 → 409/400
- QR HMAC 校验

## 领域不变量

- 一张桌同时最多一张 `open` Check
- QR / Staff / POS 只能往 `open` Check 追加
- `fire` 后生成厨房票；已结账不可再 fire / 加菜

## 子任务对照

| Ticket | 内容 |
|--------|------|
| AUT-47 | pnpm monorepo + Next.js + Docker Postgres + Prisma schema |
| AUT-48 | 员工 login/logout（owner/floor/kitchen） |
| AUT-49 | Admin 门店/区域/桌台/菜单/员工只读管理页 + CRUD API |
| AUT-50 | Seed デモ店 |
| AUT-51 | Check 开台/加菜/送厨/支付生命周期 |
| AUT-52 | POS 楼面/点餐/送厨/结账/QR |
| AUT-53 | Staff 手持点餐 |
| AUT-54 | Guest QR |
| AUT-55 | Kitchen 出餐板 |
| AUT-56 | 集成测试 + README |

## 明确不做（本 MVP）

真实支付网关、库存、CRM/LINE、排班、BI、原生 App、硬件驱动、营销官网。
