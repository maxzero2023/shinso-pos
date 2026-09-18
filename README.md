# SHINSO 前厅 POS + 点餐 MVP

可本地演示的餐饮前厅业务端：**开台 → 点餐（POS / 客人 QR / 员工手持）→ 厨打 → 结账 → 清台**（同一桌同一账单），以及 **自社预约 + 候位叫号**（AUT-46）。

- 仓库：https://github.com/maxzero2023/shinso-pos
- 父需求：Linear [AUT-28](https://linear.app/autoagentshinso/issue/AUT-28) / [AUT-46](https://linear.app/autoagentshinso/issue/AUT-46)
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
apps/web          # /login /admin /pos /reservations /waitlist /qr/[token] /staff /kitchen + /api/*
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


## 预约・候位演示路径（AUT-46）

不变量：**hold / 预约预占 ≠ open Check**；只有「到店开台 / 着席开台」才创建 open Check；一桌最多一张 open Check。时区：**Asia/Tokyo**。LINE 为 stub（`console.log` + `POST /api/notify`）。

### Seed

`pnpm db:seed` 会预置今晚（东京日）若干预约（T1/T2/T4/P1）+ 候位队列（待ち 2 + 呼出中 1）。

### 步骤

1. `pnpm db:seed` → `pnpm dev` → 登录 `floor@shinso.demo` / `demo1234`
2. 打开 **/reservations**（侧栏「予約・候位」）
3. **预约日历**：确认今晚预约列表；新建「今晚 19:00 / 4 名 / 指定卓」→ 桌显示预占（**此时无 open Check**）
4. 点 **到店开台** → 创建 open Check → 桌变 seated → 去 **/pos** 继续 AUT-28 点餐闭环
5. **候位ボード**：取号，或客人打开 **/waitlist** QR 取号 → 店员 **呼出** → 选空卓 **着席开台**
6. （可选）`POST /api/notify` 或看服务端 `[notify:stub]` 日志

### 相关 API

- `GET/POST /api/reservations` · `PATCH /api/reservations/:id` · `POST .../cancel` · `POST .../seat`
- `GET/POST /api/waitlist` · `POST /api/waitlist/:id/call|seat|cancel`
- `POST /api/notify`（LINE stub）

## 主要 API

- `POST /api/auth/login` / `POST /api/auth/logout`
- Admin CRUD：`/api/areas` `/api/tables` `/api/menu/*` `/api/staff`
- Floor：`POST /api/tables/:id/open`、`POST /api/checks/:id/items|fire|pay|split`、`GET /api/tables/:id/qr-token`
- Guest QR：`/api/qr/:token/menu|check|items`（无 open check → **409**）
- Kitchen：`GET /api/kitchen/tickets`、`PATCH /api/kitchen/tickets/:id`
- 预约/候位：见上方 AUT-46 小节

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
- 预约 CRUD/cancel；seat → open Check；hold ≠ open Check
- 候位 join/call/seat；一桌最多一张 open Check
- LINE notify stub

## 领域不变量

- 一张桌同时最多一张 `open` Check
- QR / Staff / POS 只能往 `open` Check 追加
- `fire` 后生成厨房票；已结账不可再 fire / 加菜
- 预约 `hold`/`confirmed` 预占 ≠ `open` Check；仅 seat 创建 Check
- 已 `cancelled`/`noshow` 预约不可开台；候位叫号超时可过号（默认 10 分）

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
| AUT-57 | Prisma Reservation / WaitlistTicket + migrate |
| AUT-58 | 预约 API CRUD/cancel/seat→open Check |
| AUT-59 | 候位 API join/call/seat |
| AUT-60 | LINE notify stub 触发点 |
| AUT-61 | Floor UI：预约日历 + 候位板 + 到店开台 |
| AUT-62 | Seed + 测试 + README 演示路径 |

## 明确不做（本 MVP）

真实支付网关、库存、完整 CRM、Hot Pepper/食べログ 生产对接、排班、BI、原生 App、硬件驱动、营销官网。LINE 本单仅为 stub。
