# SHINSO 前厅 POS + 点餐 MVP

可本地演示的餐饮前厅业务端：**开台 → 点餐（POS / 客人 QR / 员工手持）→ 厨打 → 结账 → 清台**（同一桌同一账单），以及 **自社预约 + 候位叫号**（AUT-46）、**信用卡 + PayPay**（AUT-29）、**硬件シミュレータ**（AUT-30）、**注文運営**（AUT-31）。

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
apps/web          # /login /admin /pos /ops /reservations /waitlist /qr/[token] /staff /kitchen /devices + /api/*
packages/db       # Prisma schema / migrate / seed
packages/api      # 校验、金额合计、QR 签名、支付网关抽象
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
6. POS 结账（默认 PayPay mock；`PAYMENT_MODE=sandbox` 见下方支付小节）→ 桌台 **free**


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


## 支付（信用卡 + PayPay / AUT-29）

`PAYMENT_MODE=mock|sandbox|live`（默认 **mock**，保留 AUT-28 即时 mock 结账）。

| 模式 | 行为 |
|------|------|
| `mock` | 所有 method 即时成功关单（与 FOH MVP 相同） |
| `sandbox` | card → Stripe PaymentIntent（无密钥则 **STRIPE SANDBOX SIMULATOR**）；paypay → **PAYPAY SANDBOX SIMULATOR**；cash 仍即时 |
| `live` | 需真实商户密钥；失败/取消 **不** 关 Check |

### 环境变量

见 `.env.example`：`STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`、`PAYPAY_*`。

### Stripe テストキー演示（sandbox）

1. Stripe Dashboard → Developers → API keys → 复制 **Test** `sk_test_…` / `pk_test_…`
2. `.env` 设置 `PAYMENT_MODE=sandbox` 与上述密钥
3. （可选）Webhook：`stripe listen --forward-to localhost:3000/api/webhooks/stripe` → 把 `whsec_…` 写入 `STRIPE_WEBHOOK_SECRET`
4. `pnpm dev` → POS 登录 → 开台加点 → 选 **カード** → 「カード決済を開始」
5. Elements でテストカード `4242 4242 4242 4242` / 任意期限・CVC → 確定 → Check `paid`、卓 `free`
6. 失敗デモ：取消ボタン → Payment `canceled`、**伝票は open のまま**（再試行可）

キーが無い場合でも sandbox でカード開始可能：UI に **STRIPE SANDBOX SIMULATOR** が出て「確定」で成功回写。

### PayPay シミュレータ演示（無商戶キー）

1. `PAYMENT_MODE=sandbox`（PayPay キー未設定で可）
2. POS で **PayPay** → 開始 → **PAYPAY SANDBOX SIMULATOR** パネル
3. 「成功」→ Check paid；「失敗」「取消」→ Payment failed/canceled、**伝票 open**
4. またはシミュレータ URL / `POST /api/payments/paypay/simulate`（署名付き webhook → `/api/webhooks/paypay`）

### API

- `POST /api/checks/:id/pay` — `{ method, amountYen, idempotencyKey? }`；pending 時は `clientSecret` / `redirectUrl` を返す
- `POST /api/checks/:id/payments/:paymentId/confirm|cancel`
- `POST /api/webhooks/stripe` · `POST /api/webhooks/paypay`（验签 + 幂等）
- `GET /api/payments/config` · `GET|POST /api/payments/paypay/simulate`

### 不变量

- Payment `status ∈ pending|succeeded|failed|canceled`；仅 `succeeded` 时关 Check / free table
- 同一 `idempotencyKey` 重放不二次扣款；同 Check 同时最多一条 pending 网关支付
- wechat / alipay 仅 mock；sandbox/live 拒绝（Q2）


## 支払い（クレジットカード + PayPay / AUT-29）

`PAYMENT_MODE=mock|sandbox|live`（デフォルト **mock**。AUT-28 の即時 mock 精算を維持）。

| モード | 挙動 |
|--------|------|
| `mock` | 全 method が即時成功して伝票クローズ（FOH MVP と同じ） |
| `sandbox` | card → Stripe PaymentIntent（キー無しは **STRIPE SANDBOX SIMULATOR**）；paypay → **PAYPAY SANDBOX SIMULATOR**；cash は即時 |
| `live` | 実商戶キー必須；失敗/取消は Check を閉じない |

### 環境変数

`.env.example` を参照：`STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`、`PAYPAY_*`。

### Stripe テストキーデモ（sandbox）

1. Stripe Dashboard → Developers → API keys → **Test** `sk_test_…` / `pk_test_…` をコピー
2. `.env` に `PAYMENT_MODE=sandbox` と上記キーを設定
3. （任意）Webhook：`stripe listen --forward-to localhost:3000/api/webhooks/stripe` → `whsec_…` を `STRIPE_WEBHOOK_SECRET` に
4. `pnpm dev` → POS ログイン → 開台・加点 → **カード** → 決済開始
5. Elements でテストカード `4242 4242 4242 4242` / 任意期限・CVC → 確定 → Check `paid`、卓 `free`
6. 失敗デモ：取消 → Payment `canceled`、**伝票は open のまま**（再試行可）

キーが無い場合でも sandbox でカード開始可：UI に **STRIPE SANDBOX SIMULATOR** が出て「確定」で成功回写。

### PayPay シミュレータデモ（商戶キー無し）

1. `PAYMENT_MODE=sandbox`（PayPay キー未設定で可）
2. POS で **PayPay** → 開始 → **PAYPAY SANDBOX SIMULATOR** パネル
3. 「成功」→ Check paid；「失敗」「取消」→ Payment failed/canceled、**伝票 open**
4. またはシミュレータ URL / `POST /api/payments/paypay/simulate`（署名付き webhook → `/api/webhooks/paypay`）

### API

- `POST /api/checks/:id/pay` — `{ method, amountYen, idempotencyKey? }`；pending 時は `clientSecret` / `redirectUrl`
- `POST /api/checks/:id/payments/:paymentId/confirm|cancel`
- `POST /api/webhooks/stripe` · `POST /api/webhooks/paypay`（验签 + 幂等）
- `GET /api/payments/config` · `GET|POST /api/payments/paypay/simulate`

### 不变量

- Payment `status ∈ pending|succeeded|failed|canceled`；`succeeded` のときのみ Check クローズ / 卓 free
- 同一 `idempotencyKey` 再送は二重課金しない；同 Check 同時に pending ゲートウェイ支払いは最大 1
- wechat / alipay は mock のみ；sandbox/live では拒否（Q2）

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



## 注文運営（退改権限・営業日/班次・異常単 / AUT-31）

営業日タイムゾーンは **Asia/Tokyo**。店長（owner）は送厨済・精算済の取消/改単が可能で、すべて `CheckAuditLog` に残ります。フロアは下書き（draft）のみ取消可。

| ルール | 内容 |
|--------|------|
| 退菜 | floor → draft のみ；owner → fired / paid も可（監査必須） |
| 閉店 | 未結（open）Check が 1 件でもあると **409** |
| 異常 | `flag-exception` → owner が `resolve-exception` |
| 帰集 | 開台時にオープン中 Shift / BusinessDay を Check に付与 |

### デモパス

1. `pnpm db:seed` → `pnpm dev` → ログイン `floor@shinso.demo` / `demo1234`
2. **/ops** — 本日の営業日・開班状態を確認（seed で開班済）。必要なら **開班**
3. **/pos** — 卓を選んで開台 → 加点 → **送厨** → 明細の **取消**（floor は 403）
4. ログアウト → `owner@shinso.demo` で再ログイン → 同明細を **取消**（成功・監査ログ）
5. POS で **異常フラグ** → **/ops** の異常一覧 → owner が **解消**
6. 全伝票精算後 **/ops** で **閉店**（未結があるときは拒否）
7. 監査ログが /ops 下部に表示されることを確認

### API

- `GET /api/shifts` · `POST /api/shifts/open` · `POST /api/shifts/close`
- `POST /api/checks/:id/void-item` · `POST /api/checks/:id/edit-item`
- `POST /api/checks/:id/flag-exception` · `POST /api/checks/:id/resolve-exception`（resolve は owner）
- `GET /api/ops/exceptions` · `GET /api/ops/audits`

### 子タスク

| Ticket | 内容 |
|--------|------|
| AUT-73 | BusinessDay/Shift + 開收班（未結禁止） |
| AUT-72 | 退改権限 + void/edit + CheckAuditLog |
| AUT-75 | 異常フラグ/解消 + /ops UI（日文） |
| AUT-74 | Seed + テスト + README |

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
| AUT-63 | 支付抽象层 + mock/sandbox/live 切换 |
| AUT-64 | Stripe JP PaymentIntent + 回写 Check |
| AUT-65 | PayPay 沙箱/契约 + 模拟器回写 |
| AUT-67 | Webhook/验签 + 幂等；失败取消不关单 |
| AUT-66 | POS 结账 UI + README 沙箱演示 |

## 明确不做（本 MVP）

库存、完整 CRM、Hot Pepper/食べログ 生产对接、排班、BI、原生 App、硬件驱动、营销官网、微信/支付宝（Q2）。LINE 本单仅为 stub。支付默认 mock；sandbox/live 需 Stripe / PayPay 密钥（无密钥时用标注的模拟器）。


## 標準ハードウェア包（T1 + 厨屏 + プリンタ / AUT-30）

`HARDWARE_MODE=simulator|live`（デフォルト **simulator**）。実機が無くてもシミュレータで三件套をデモできます。純 Web（ハード無し）も従来どおり動作します。

| モード | 挙動 |
|--------|------|
| `simulator` | 登録デバイスの心拍・状態に応じて印刷成功/失敗。オフライン・用紙切れを UI で再現 |
| `live` | 実機ブリッジ未接続時は失敗メッセージ（本ボックスには物理 T1/プリンタ無し） |

### Seed デバイス

`pnpm db:seed` で以下を登録：

| code | type | 用途 |
|------|------|------|
| T1-01 | t1_pos | FOH タッチ POS |
| KDS-01 | kitchen_display | 厨房フルスクリーン |
| PRT-01 | printer | 80mm レシート / 厨打 |

### デモパス

1. `pnpm db:seed` → `pnpm dev` → ログイン `floor@shinso.demo` / `demo1234`
2. **/devices** — シミュレータ：心拍、オフライン/用紙切れ切替、80mm 日文プレビュー
3. **/pos?device=t1** — T1 タッチ向けレイアウトで開台→点餐→送厨
4. **/kitchen?device=display** — 厨屏フルスクリーン（大字・超過ハイライト）
5. 送厨 → 厨打 PrintJob；精算 → レシート PrintJob（同一 Check / KitchenTicket、影オーダー無し）
6. プリンタを「用紙切れ」→ 再印刷で可視エラー → 「オンライン」でリトライ成功
7. ワンショット: `pnpm demo:hardware`

### API

- `GET/POST /api/devices` · `GET/PATCH /api/devices/:id` · `POST .../heartbeat` · `POST .../simulate`
- `GET/POST /api/print-jobs` · `POST /api/print-jobs/:id/retry`
- `GET /api/hardware/config`

### 不変条件

- 印刷・厨显は同一 Check / KitchenTicket を消費（影オーダー禁止）
- paid Check のレシート再印刷は可；新規 fire は不可
- デバイスは Store 所属（日本単店）

