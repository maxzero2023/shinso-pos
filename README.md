# SHINSO 前厅 POS + 点餐 MVP

可本地演示的餐饮前厅业务端：**开台 → 点餐（POS / 客人 QR / 员工手持）→ 厨打 → 结账 → 清台**（同一桌同一账单），以及 **自社预约 + 候位叫号**（AUT-46）、**信用卡 + PayPay**（AUT-29）、**微信 / 支付宝访日客**（AUT-35）、**硬件シミュレータ**（AUT-30）、**第二套机型 / 手持**（AUT-41）、**候位 LINE 生产化**（AUT-42）、**注文運営**（AUT-31）、**基礎レポート**（AUT-32）、**LINE 会員 CRM**（AUT-33）、**老板 LINE 日報/週報**（AUT-34）、**点餐端日/中/英**（AUT-36）、**多店 Brand/Store**（AUT-37）、**在庫 MVP**（AUT-38）、**調達・発注**（AUT-39）、**財務分析（コスト粗算・毛利・費用）**（AUT-40）、**外卖半自動進単進厨**（AUT-43）、**营销自动化（休眠召回等）**（AUT-44）、**套餐能力边界对照表 Minimum/Standard/Full**（AUT-45）。

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
apps/web          # /login /admin /admin/reports /admin/crm /admin/marketing /admin/inventory /admin/purchasing /admin/finance /admin/multi-store /admin/package-tiers /crm /pos /ops /reservations /delivery /waitlist /waitlist/[id] /qr/[token] /staff /kitchen /devices + /api/*
packages/db       # Prisma schema / migrate / seed
packages/api      # 校验、金额合计、QR 签名、支付网关抽象
docs/             # 产品文档（套餐能力矩阵 package-tiers.md / .csv）
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

| 角色 | Email | Password | 店舗 |
|------|-------|----------|------|
| Brand admin | `brandadmin@shinso.demo` | `demo1234` | ブランド横断（A/B 切替可） |
| Owner | `owner@shinso.demo` | `demo1234` | シンソウデモ店 (A) |
| Manager | `manager@shinso.demo` | `demo1234` | シンソウデモ店 (A) |
| Floor | `floor@shinso.demo` | `demo1234` | シンソウデモ店 (A) |
| Kitchen | `kitchen@shinso.demo` | `demo1234` | シンソウデモ店 (A) |
| Manager B | `manager-b@shinso.demo` | `demo1234` | シンソウデモ店 B |
| Floor B | `floor-b@shinso.demo` | `demo1234` | シンソウデモ店 B |

Seed 内容：ブランド「SHINSO Demo」配下に **店舗 A「シンソウデモ店」**（3 エリア / 12 卓 / 23 品）と **店舗 B「シンソウデモ店 B」**（隔離デモ用ミニメニュー）。既存 `owner@` / `floor@` / `kitchen@` ログインは変更なし。

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

`pnpm db:seed` 会预置今晚（东京日）若干预约（T1/T2/T4/P1）+ 候位队列（待ち + 呼出中；AUT-42 另含会员绑定/未联动演示票）。

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


## 候位 LINE 生产化 / CRM 深度（AUT-42）

在 AUT-46 候位 MVP 之上：**叫号/もうすぐ呼出** 走 `packages/api` 的 `sendLineMessage`（`LINE_MODE=simulator|live`；simulator 仅 stub 日志；live payload 形状预留）。**仅当整理券有 `guestLineId` 或关联 Member 时推送**；未绑定 → 店内提示、**绝不误推**。

### Seed

`pnpm db:seed` 在营业日候位队列外追加：

- **会員・デモ太郎**（`sim_demo_taro` / Member 绑定）→ 呼出时 LINE stub 可达
- **未連携ゲスト** → 呼出 `notify.pushed=false` + staffHint

### 演示路径

1. `pnpm db:seed` → `pnpm dev` → `floor@shinso.demo` / `demo1234`
2. **/waitlist** 取号（可填 `sim_demo_taro`）→ 跳转 **/waitlist/[id]** 看番号・順番・状態（日本語）
3. **/reservations** → **候位ボード**：确认「LINE連携 / 未連携」バッジ
4. **呼出** 绑定票 → 服务端 `[line:messaging:stub]` + 响应 `notify.pushed=true`
5. **呼出** 未绑定票 → `pushed=false`、staffHint「未連携のためプッシュしません」
6. **過号** → status `skipped` → **再呼出** → 回到 `called`（`WaitlistAuditLog`）
7. 选空卓 **着席開台** → open Check（可进 `/pos`）
8. 队列前列（position≤2）绑定票会收到一次 **もうすぐ呼出**（`almostCalledAt`）

### API（增量）

- `POST /api/waitlist/:id/skip` · `POST /api/waitlist/:id/recall`
- `GET /api/waitlist/:id/status`（公开・客态）
- `GET /api/waitlist?skipped=1`（ボード用・含過号）
- 叫号/着席响应含 `notify: { pushed, reason, staffHint, to }`

### 不变量

- 营业日（Asia/Tokyo）内 `(storeId, businessDate, ticketNo)` 唯一
- 未绑定不推送；过号可重叫并写审计
- 入座仍走既有 seat → open Check


## 支付（信用卡 + PayPay / AUT-29 · 微信/支付宝 / AUT-35）

`PAYMENT_MODE=mock|sandbox|live`（默认 **mock**，保留 AUT-28 即时 mock 结账）。

| 模式 | 行为 |
|------|------|
| `mock` | 所有 method 即时成功关单（与 FOH MVP 相同） |
| `sandbox` | card → Stripe PI（无密钥则 **STRIPE SANDBOX SIMULATOR**）；paypay / wechat / alipay → 标注 **SANDBOX SIMULATOR**；cash 仍即时 |
| `live` | 需真实商户密钥；失败/取消 **不** 关 Check |

### 环境变量

见 `.env.example`：`STRIPE_*`、`PAYPAY_*`、`WECHAT_*`、`ALIPAY_*`、`NEXT_PUBLIC_ENABLE_WECHAT_ALIPAY`（默认 ON）。

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

### WeChat / Alipay シミュレータ演示（訪日客 / AUT-35・無商戶キー）

1. `PAYMENT_MODE=sandbox`（WeChat/Alipay キー未設定で可；**不调用真实 API**）
2. `NEXT_PUBLIC_ENABLE_WECHAT_ALIPAY=true`（默认 ON；`false` で POS ボタン非表示）
3. POS → **WeChat 微信** または **Alipay 支付宝** → 開始 → 対応 **SANDBOX SIMULATOR** パネル
4. 「成功」→ Check `paid` / 卓 `free`；「失敗」「取消」→ Payment failed/canceled、**伝票は open のまま**
5. Webhook：`POST /api/webhooks/wechat` · `POST /api/webhooks/alipay`（HMAC 验签失敗 → **401**）
6. Simulate：`GET|POST /api/payments/wechat/simulate` · `/api/payments/alipay/simulate`

### API

- `POST /api/checks/:id/pay` — `{ method, amountYen, idempotencyKey?, simulateOutcome? }`；pending 時は `clientSecret` / `redirectUrl` を返す
- `POST /api/checks/:id/payments/:paymentId/confirm|cancel`
- `POST /api/webhooks/stripe` · `paypay` · `wechat` · `alipay`（验签 + 幂等）
- `GET /api/payments/config` · `GET|POST /api/payments/{paypay|wechat|alipay}/simulate`

### 不变量

- Payment `status ∈ pending|succeeded|failed|canceled`；仅 `succeeded` 时关 Check / free table
- 同一 `idempotencyKey` 重放不二次扣款；同 Check 同时最多一条 pending 网关支付
- wechat / alipay 与 card / paypay / cash 并存；失败/取消不误关单


## 支払い（クレジットカード + PayPay / AUT-29 · WeChat/Alipay / AUT-35）

`PAYMENT_MODE=mock|sandbox|live`（デフォルト **mock**。AUT-28 の即時 mock 精算を維持）。

| モード | 挙動 |
|--------|------|
| `mock` | 全 method が即時成功して伝票クローズ（FOH MVP と同じ） |
| `sandbox` | card → Stripe PI（キー無しは **STRIPE SANDBOX SIMULATOR**）；paypay / wechat / alipay → 标注 **SANDBOX SIMULATOR**；cash は即時 |
| `live` | 実商戶キー必須；失敗/取消は Check を閉じない |

### 環境変数

`.env.example` を参照：`STRIPE_*`、`PAYPAY_*`、`WECHAT_*`、`ALIPAY_*`、`NEXT_PUBLIC_ENABLE_WECHAT_ALIPAY`（デフォルト ON）。

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

### WeChat / Alipay シミュレータデモ（訪日客 / AUT-35・商戶キー無し）

1. `PAYMENT_MODE=sandbox`（WeChat/Alipay キー未設定で可；**実 API は呼ばない**）
2. `NEXT_PUBLIC_ENABLE_WECHAT_ALIPAY=true`（デフォルト ON；`false` で POS ボタン非表示）
3. POS → **WeChat 微信** または **Alipay 支付宝** → 開始 → 対応 **SANDBOX SIMULATOR** パネル
4. 「成功」→ Check `paid` / 卓 `free`；「失敗」「取消」→ Payment failed/canceled、**伝票は open のまま**
5. Webhook：`POST /api/webhooks/wechat` · `POST /api/webhooks/alipay`（HMAC 验签失敗 → **401**）
6. Simulate：`GET|POST /api/payments/wechat/simulate` · `/api/payments/alipay/simulate`

### API

- `POST /api/checks/:id/pay` — `{ method, amountYen, idempotencyKey?, simulateOutcome? }`；pending 時は `clientSecret` / `redirectUrl`
- `POST /api/checks/:id/payments/:paymentId/confirm|cancel`
- `POST /api/webhooks/stripe` · `paypay` · `wechat` · `alipay`（验签 + 幂等）
- `GET /api/payments/config` · `GET|POST /api/payments/{paypay|wechat|alipay}/simulate`

### 不变量

- Payment `status ∈ pending|succeeded|failed|canceled`；`succeeded` のときのみ Check クローズ / 卓 free
- 同一 `idempotencyKey` 再送は二重課金しない；同 Check 同時に pending ゲートウェイ支払いは最大 1
- wechat / alipay は card / paypay / cash と并存；失敗/取消は誤って伝票を閉じない

## 主要 API

- `POST /api/auth/login` / `POST /api/auth/logout`
- Admin CRUD：`/api/areas` `/api/tables` `/api/menu/*` `/api/staff`
- Floor：`POST /api/tables/:id/open`、`POST /api/checks/:id/items|fire|pay|split`、`GET /api/tables/:id/qr-token`
- Guest QR：`/api/qr/:token/menu|check|items`（无 open check → **409**）
- Kitchen：`GET /api/kitchen/tickets`、`PATCH /api/kitchen/tickets/:id`
- 预约/候位：见上方 AUT-46 / AUT-42 小节

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
- AUT-42：绑定叫号推送 / 未绑定不推；skip/recall；guest status；seat→Check
- AUT-43：pending 無 KDS；confirm→Check+tickets；bad map 失敗後修正成功
- 日营收 / 热销 / 桌均 / 时段 API；void 除外；kitchen 403；空日 0



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



## 基礎レポート（日営収 / 熱銷 / 卓均 / 時間帯 / AUT-32）

日本単店向けの基礎経営レポート。集計は **アプリケーション層**（Prisma 取得 + `@shinso/api` の純関数）。LINE 日報は同じ API を再利用できる。

### 口径（不変条件）

| 項目 | 決定 |
|------|------|
| 対象伝票 | `Check.status = paid` のみ（**void 除外**） |
| 明細 | `CheckItem.status ≠ void`；金額は **円整数** |
| タイムゾーン | **Asia/Tokyo** |
| 日・時間帯の帰属 | **Payment.paidAt**（無ければ `Check.closedAt`） |
| 卓均 | `tableAvgYen = round(日営収 / 精算件数)`；0 件の日は 0 |
| 熱銷 | MenuItem 単位で qty 合計（同名でも menuItemId） |
| 権限 | **owner + floor 閲覧可**（デモ）；kitchen 不可。店長ロールは現状 owner が兼ねる |

### API

- `GET /api/reports/daily?date=YYYY-MM-DD`
- `GET /api/reports/bestsellers?from=&to=`
- `GET /api/reports/table-avg?date=`
- `GET /api/reports/hourly?date=`

空日は **0** を返す（エラーにしない）。未ログイン 401 / kitchen 403。

### デモパス

1. `pnpm db:seed` → `pnpm dev`
2. ログイン `owner@shinso.demo` または `floor@shinso.demo` / `demo1234`
3. 側欄 **レポート** → `/admin/reports`
4. 本日（Tokyo）の日営収・精算件数・卓均・時間帯バー・熱銷を確認
5. seed は 12/14/18/20/21 時台の paid Check + 1 件 void（レポート外）を投入
6. 日付を空日（例: 遠い未来）に切替 → すべて 0
7. `kitchen@` で API を叩くと 403

### 子タスク

| Ticket | 内容 |
|--------|------|
| AUT-76 | 报表查询层：日营收/热销/桌均/时段 API |
| AUT-77 | Admin `/admin/reports` UI + 权限 |
| AUT-78 | Seed 跨时段已付单 + 测试 + 口径文档 |
| AUT-79 | Member/Coupon 模型 + LINE bind 沙箱 |
| AUT-80 | 集点（paid Check）+ 券发放/核销幂等 |
| AUT-81 | POS/Admin CRM UI + Seed/测试/README |




## LINE 会員 CRM（绑定・集点・簡易券 / AUT-33）

`LINE_MODE=simulator|live`（デフォルト **simulator**）。**実 LINE 認証・Messaging キー不要**。シミュレータは fake `lineUserId`（`sim_*`）で绑定し、Messaging は `[line:messaging:stub]` ログのみ。

| モード | 挙動 |
|--------|------|
| `simulator` | lineUserId 省略可（自動生成）。绑定・集点・券核销をローカル完結 |
| `live` | lineUserId 必須（LIFF/Login 想定）。Messaging は当面 stub |

### ドメイン

- `Member(lineUserId, storeId, points)` — 同一 LINE ユーザーは店舗内ユニーク
- `CouponTemplate` → `CouponIssue(status: issued|redeemed)`
- `PointAward` — **paid Check につき 1 回**（`checkId` unique）
- 集点ルール: **¥100 = 1pt**（切り捨て）。未紐付け Check は集点なし
- 核销: 成功後の再核销は **409**（不可再核销）

### API

- `POST /api/crm/line/bind` — `{ lineUserId?, displayName? }`
- `GET /api/crm/members/me?lineUserId=`
- `GET /api/crm/members`（店員）
- `GET/POST /api/crm/coupon-templates`（作成は owner）
- `POST /api/crm/coupons/issue` · `POST /api/crm/coupons/redeem`
- `GET /api/crm/config`
- 精算 `POST /api/checks/:id/pay` に任意 `memberId` / `lineUserId` → settle 時に集点

### Seed

`pnpm db:seed` で:

| 項目 | 内容 |
|------|------|
| 会員 | デモ太郎 (`sim_demo_taro`) / デモ花子 (`sim_demo_hanako`, 50pt) |
| テンプレ | ドリンク1杯無料 / デザート割引 |
| 券 | `CPDEMO01`（issued） |
| 集点 | 太郎に paid Check 1 件分の PointAward |

### デモパス

1. `pnpm db:seed` → `pnpm dev` → ログイン `floor@shinso.demo` / `demo1234`
2. **/admin/crm** — シミュレータ绑定、テンプレ作成、券発行（コード表示）
3. ゲスト **/crm** — 绑定 → マイページでポイント/券確認
4. **/pos** — 会員を選んで精算 → ポイント増加（¥100=1pt）
5. POS でクーポンコード核销 → 成功 → **再核销は失敗（409）**
6. seed 券 `CPDEMO01` でも同様に核销デモ可

### 子タスク

| Ticket | 内容 |
|--------|------|
| AUT-79 | Member/Coupon モデル + LINE bind 沙箱 |
| AUT-80 | 集点規則（paid Check）+ 券发放/核销幂等 |
| AUT-81 | POS/Admin CRM UI + Seed/测试/README |




## 老板 LINE 日報/週報推送（AUT-34）

店舗オーナー向けに **Asia/Tokyo** の日報（昨日）・週報（月〜日）を LINE Messaging **stub** で送信。指標は AUT-32 レポート（`packages/api/src/reports.ts`）と同一口径。実 LINE ネットワーク不要。

### ドメイン / 不変条件

| 項目 | 決定 |
|------|------|
| 绑定 | `OwnerLineBinding(storeId, lineUserId, dailyEnabled, weeklyEnabled)` — 店舗につき 1 |
| 未绑定 | **送信しない**（skipped ログ） |
| スイッチ OFF | **送信しない**（skipped ログ） |
| 口径 | paid Check のみ・void 除外・`Payment.paidAt`（無ければ `closedAt`）・円整数 |
| スナップショット | 送信時の指標を `OwnerLineDeliveryLog.snapshot` に保存 |
| 失敗 | **1 回リトライ**後 `failed` ログ |
| 権限 | 绑定/設定/トリガーは **owner**；ログ閲覧は owner + floor |

### API

- `GET /api/crm/owner-line` — 現在の绑定
- `POST /api/crm/owner-line/bind` — `{ lineUserId? }`（simulator は省略可）
- `PATCH /api/crm/owner-line/settings` — `{ dailyEnabled?, weeklyEnabled? }`
- `GET /api/crm/owner-line/delivery-logs?limit=`
- `POST /api/crm/owner-line/trigger` — `{ kind: "daily"|"weekly", date?: "YYYY-MM-DD" }`（デモ用手動実行）

### Seed

`pnpm db:seed` で:

| 項目 | 内容 |
|------|------|
| 绑定 | `sim_owner_line`（日報/週報 ON） |
| 昨日 paid | 3 件（日報に数字が出る） |
| 週内 paid | 月曜分も投入（週報用） |

### デモパス

1. `pnpm db:seed` → `pnpm dev`
2. ログイン `owner@shinso.demo` / `demo1234`
3. **/admin/crm** — 「オーナー LINE 日報/週報」で绑定確認（seed 済み）
4. **日報トリガー** → サーバログに `[line:messaging:stub]`、画面の送信記録に `sent` + 売上摘要
5. 日報スイッチ OFF → 再トリガー → `skipped (disabled)`、stub 送信なし
6. スイッチ ON に戻し **週報トリガー** → Mon〜Sun 期間の摘要
7. `GET /api/crm/owner-line/delivery-logs` または画面一覧で履歴確認
8. （任意）binding 削除後トリガー → `skipped (unbound)`

### 子タスク

| Ticket | 内容 |
|--------|------|
| AUT-82 | OwnerLineBinding + bind/settings API |
| AUT-83 | 日报/周报 digest job（Asia/Tokyo） |
| AUT-84 | delivery-logs API |
| AUT-85 | Admin UI + seed/tests/README |


## 领域不变量

- 一张桌同时最多一张 `open` Check
- QR / Staff / POS 只能往 `open` Check 追加
- `fire` 后生成厨房票；已结账不可再 fire / 加菜
- 预约 `hold`/`confirmed` 预占 ≠ `open` Check；仅 seat 创建 Check
- 已 `cancelled`/`noshow` 预约不可开台；候位叫号超时可过号（默认 10 分）
- LINE 会员：`(storeId, lineUserId)` 唯一；集点仅 paid Check；券核销后不可再核销
- 老板 LINE 日報：未绑定/开关 OFF 不发送；快照与 AUT-32 报表口径一致；失败最多 1 次重试


## 外卖半自動進単進厨（AUT-43）

**半自動策略（必須）**：チャネル stub（出前館 / Uber Eats JP シミュレータ）からの Webhook は **pending ExternalOrder のみ**作成する。店員がメニューマッピングを確認して `POST /api/delivery/orders/:id/confirm` するまで **Check / KitchenTicket は一切作らない**（静默错单禁止）。マッピング失敗時は明確なエラーを返し、部分伝票は作成しない。店員はマッピングを直して再確認できる。

### ドメイン / 不変条件

* `ExternalOrder`（channel stub）→ 行ごとに `MenuItem` マッピング → 確認後 `Check.channel=delivery` + 既存 fire パイプラインで `KitchenTicket`
* 未確認は厨房に出ない
* マッピング失敗 → エラー + `mappingError` 保存、Check なし
* Store-scoped（`activeStoreId`）
* 配達枠は仮想卓 `DEL-xx`（エリア「配達」）

### 範囲外

* 全自動多平台無確認進単
* 骑手调度 / 配送追踪
* 実パートナー SDK

### API

* `POST /api/delivery/simulate/webhook` — シミュレータ受信（pending のみ）
* `GET /api/delivery/orders?status=pending|confirmed|cancelled`
* `GET/PATCH /api/delivery/orders/:id` — 詳細 / マッピング編集
* `POST /api/delivery/orders/:id/confirm` — 確認 → Check + 送厨

### Seed

`pnpm db:seed` で確認待ちデモ 2 件：

* `SEED-DEMAE-001`（出前館・全行マップ済・未確認）
* `SEED-UE-BADMAP`（Uber Eats・1 行未マップ・確認するとエラー）

### デモパス

1. `pnpm db:seed` → `pnpm dev` → `floor@shinso.demo` / `demo1234`
2. **/delivery**（側栏「配達・外卖」）→ seed の確認待ち一覧
3. `SEED-DEMAE-001` を開きマッピング確認 → **確認して厨房へ送る** → **/kitchen** に queued
4. 「誤マップ受信デモ」または `SEED-UE-BADMAP` → 確認 → エラー表示（Check なし）→ マップ修正 → 再確認成功
5. （任意）`POST /api/delivery/simulate/webhook` で追加受信

### 子タスク

| ID | 内容 |
|---|---|
| AUT-118 | ExternalOrder + 模擬收単 |
| AUT-119 | 確認マッピング進単進厨 |
| AUT-121 | 待確認一覧 UI |
| AUT-120 | seed/tests/README |


## 营销自动化（休眠召回等 / AUT-44）

**プリセット 2〜3 ルール**（完全 CDP / 無限ルールビルダー / クロスチャネル归因ではない）。LINE 会員のみ・`marketingOptIn` 同意者のみ触达。

### ルール種別

| type | 説明 | 主な params |
|------|------|-------------|
| `sleep_recall` | N 日来店なし（paid Check / PointAward） | `inactiveDays`（既定 30） |
| `coupon_nudge` | 未使用クーポンまたは低ポイント | `lowPointsThreshold`（既定 20）、`requireUnusedCoupon` |
| `welcome` | 直近 N 日で新規バインド | `welcomeWithinDays`（既定 3） |

### 不変条件

* `MarketingRule(storeId, type, enabled, params JSON, frequencyDays)`
* 無効ルール → 送信しない（`skipped_disabled` ログ）
* 同一 rule+member が `frequencyDays` 内に再送 → `skipped_freq`
* `Member.marketingOptIn=false` → マッチ対象外（オプトアウト）

### API

* `GET /api/crm/marketing/rules` — プリセット一覧（無ければ自動作成）
* `PATCH /api/crm/marketing/rules/:id` — `{ enabled?, frequencyDays?, params? }`
* `GET /api/crm/marketing/logs?limit=`
* `POST /api/crm/marketing/run` — `{ ruleId? }` 手動実行（LINE stub 実送 + MarketingSendLog）

### Seed

* `sim_demo_sleeping`（休眠一郎）— 約 45 日前の paid Check、`marketingOptIn=true`
* `sim_demo_optout`（拒否花）— 同様に休眠だが `marketingOptIn=false`（コントロール）
* `sim_demo_welcome`（新規次郎）— ウェルカム対象
* 3 ルール（sleep_recall / coupon_nudge / welcome）有効

### デモパス

1. `pnpm db:seed` → `pnpm dev` → `owner@shinso.demo` / `demo1234`
2. **/admin/marketing**（側栏「マーケ」）→ ルール一覧
3. 「休眠会員の再来店リコール」→ **このルールを実行** → 送信ログに `休眠一郎` / 送信済
4. もう一度実行 → `頻度スキップ`（`skipped_freq`）
5. ルールを無効にして実行 → 送信増なし（`skipped_disabled`）
6. （任意）`POST /api/crm/marketing/run` with `{ "ruleId": "..." }`

### 子タスク

| ID | 内容 |
|---|---|
| AUT-122 | MarketingRule モデル + 2–3 ルール |
| AUT-123 | run + 送信ログ + 頻控 |
| AUT-124 | Admin ルール UI（日文） |
| AUT-125 | seed/tests/README |


## 套餐能力边界对照表（Minimum / Standard / Full / AUT-45）

文档 spike：**对外销售与实施讲清各档含/不含/加购**。非定价、非法务合同；不承诺 README「明确不做」中的未规划能力。

### 文档位置

| 文件 | 用途 |
|------|------|
| [`docs/package-tiers.md`](docs/package-tiers.md) | 权威对照表 + 锁定决策 + Linear 工单附录 |
| [`docs/package-tiers.csv`](docs/package-tiers.csv) | 机器可读矩阵 |
| `/admin/package-tiers` | Admin 只读日文预览（owner/manager） |

### 锁定决策（摘要）

1. **Q1 支付** = 信用卡 + PayPay；WeChat/Alipay 为 Standard/Full **加购**
2. **Q1 硬件** = T1 + 厨屏 + 打印机；第二套/手持为 **加购**（不降格标准包）
3. **LINE 必上 Q2**（Standard 起含 LINE 会员 CRM）
4. **日本单店优先**（多店/供应链在 Full）

### Seed 桌码（AUT-127）

演示桌台统一 **T1–T5 / C1–C4 / P1–P3**。AUT-44 休眠会员 seed 曾误查不存在的桌码 `A1`，已改为 `T1`（与 POS/Staff 一致）。设备码 `T1-01` 为硬件机型，与桌码 T1 分属不同实体。

### 验收说明

- 工程：矩阵文档 + 附录映射 + seed 修复 + 可选 Admin 页
- **销售/实施签字**：产品侧评审（本 PR 文档 ready for review）

### 子任务

| ID | 内容 |
|---|---|
| AUT-126 | 三档能力矩阵文档 |
| AUT-127 | 工单映射附录 + seed 桌码 A1→T1 |

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
| AUT-42 | 候位 LINE 生产化 / CRM 深度 |
| AUT-43 | 外卖半自動進単進厨 |
| AUT-44 | 营销自动化（休眠召回等 2–3 规则） |
| AUT-45 | 套餐能力边界对照表 Minimum/Standard/Full |
| AUT-126 | 三档能力矩阵文档 |
| AUT-127 | 工单映射 + seed 桌码 T1 统一 |
| AUT-118 | ExternalOrder + 模擬收単 |
| AUT-119 | 確認マッピング進単進厨 |
| AUT-121 | 待確認一覧 UI |
| AUT-120 | seed/tests/README |
| AUT-117 | 叫号 LINE Messaging + Member 绑定 |
| AUT-115 | 过号/再呼出 + もうすぐ呼出 |
| AUT-114 | 顾客状态页 + 看板日文 |
| AUT-116 | seed/tests/README |
| AUT-63 | 支付抽象层 + mock/sandbox/live 切换 |
| AUT-64 | Stripe JP PaymentIntent + 回写 Check |
| AUT-65 | PayPay 沙箱/契约 + 模拟器回写 |
| AUT-36 | 点餐端日/中/英体验打磨 |
| AUT-90 | i18n 骨架 + 语言切换器 |
| AUT-93 | 菜单三语字段 + seed |
| AUT-92 | QR/手持端主路径三语打磨 |
| AUT-91 | tests + README 演示 |
| AUT-37 | 多店 Brand/Store MVP |
| AUT-38 | 在庫 MVP（原料・出入庫・低在庫・BOM） |
| AUT-39 | 調達：補貨提案 → 発注草稿 → 入庫 |
| AUT-40 | 財務：コスト粗算・毛利・簡要費用 |
| AUT-41 | ハードウェア拡張：第二套機型 / 手持 |
| AUT-106 | コスト粗算 + 毛利 API |
| AUT-107 | ExpenseEntry |
| AUT-108 | Admin 毛利看板 + 口径ドキュメント |
| AUT-109 | seed/tests + seed PO 清理 |
| AUT-102 | 補貨提案 suggestions |
| AUT-104 | PurchaseOrder 草稿/編集 |
| AUT-103 | 入庫 + Admin UI |
| AUT-105 | seed/tests/README |
| AUT-94 | Brand/Store モデル + 単店移行 |
| AUT-95 | 権限 + switch-store |
| AUT-97 | Admin 多店 UI |
| AUT-96 | seed/tests/README |
| AUT-35 | 微信/支付宝访日客（沙箱模拟器） |
| AUT-86 | WeChat/Alipay gateway + registry |
| AUT-87 | Webhook/simulate + settle |
| AUT-88 | POS UI 微信/支付宝 |
| AUT-89 | tests + README |
| AUT-67 | Webhook/验签 + 幂等；失败取消不关单 |
| AUT-66 | POS 结账 UI + README 沙箱演示 |
| AUT-76 | 报表查询层：日营收/热销/桌均/时段 API |
| AUT-77 | Admin /admin/reports UI + 权限 |
| AUT-78 | Seed 跨时段已付单 + 测试 + 口径文档 |
| AUT-79 | Member/Coupon 模型 + LINE bind 沙箱 |
| AUT-80 | 集点（paid Check）+ 券发放/核销幂等 |
| AUT-81 | POS/Admin CRM UI + Seed/测试/README |
| AUT-34 | 老板 LINE 日报/周报推送 |
| AUT-82 | OwnerLineBinding + bind/settings |
| AUT-83 | 日报/周报 digest job |
| AUT-84 | delivery-logs API |
| AUT-85 | Admin UI + seed/tests/README |

## 点餐端日/中/英体验（AUT-36）

默认语言 **ja**；`/qr` 与 `/staff` 提供语言切换器（ja / zh / en），偏好保存在浏览器 `localStorage`（`shinso_locale`），不影响服务端账务。

菜单模型：`MenuCategory` / `MenuItem` 增加可空字段 `nameZh` / `nameEn`；`name` 仍为日文主名。API 按 `?locale=` 或 `Accept-Language` 返回 `displayName`（回退：目标语言 → `name` → 其余语言字段）。

### 演示路径

1. `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`
2. 登录 `floor@shinso.demo` / `demo1234` → POS 开台
3. 发行 QR → 打开 `/qr/[token]` → 右上角切换 **日本語 / 中文 / EN** → 浏览菜单（菜名随语言变化）→ 加购下单（同一 check）
4. 未开台时访问 QR：三语均提示找服务员（`noOpenCheck`）
5. `/staff` 手持：切换语言后抽查菜单与「无开台」提示；下单仍走同一 open check
6. Admin `/admin` 菜单区只读展示日/中/英名；编辑 zh/en 可用 `PATCH /api/menu/items`（body: `{ id, nameZh?, nameEn? }`）或改 seed

### 验收要点

- 默认日文；切换无关键文案
- 空态 / 加载 / 错误 / 无 open check 三语覆盖
- Check 同单、厨票、结账语义不变
- 触控热区 ≥ 44px；品牌色不变


## 多店アーキ：Brand / Store（AUT-37）

単店 Q1/Q2 フローを壊さず、**ブランド → 門店** 階層・権限・切替の MVP。

| 概念 | 内容 |
|------|------|
| Brand 1—N Store | 既存店舗はデフォルトブランド「SHINSO Demo」にマウント |
| 役割 | `brand_admin`（ブランド横断）/ `owner`・`manager`（店舗 elevated）/ `floor`・`kitchen`（店舗のみ） |
| セッション | `activeStoreId`（=`storeId` 互換）+ `POST /api/session/switch-store` |
| 隔離 | Check / Table / Menu / Payments / CRM はいずれも **active store** の `storeId` 行レベル |

### デモパス

1. `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`
2. `brandadmin@shinso.demo` / `demo1234` でログイン → 側欄 **店舗切替** または **/admin/multi-store**
3. 店舗 A ↔ B を切替 → `/pos` の卓番・`/api/menu/categories` が店ごとに変わる（串データなし）
4. `manager@shinso.demo` で B へ切替試行 → **403**
5. レガシー: `floor@shinso.demo` / `owner@shinso.demo` は従来どおり店舗 A で Q1 開台フロー可

### API

- `GET /api/session/stores` · `POST /api/session/switch-store` `{ storeId }`
- `GET/POST /api/brands` · `GET/PATCH /api/brands/:id`
- `GET/POST /api/stores` · `GET/PATCH /api/stores/:id`（作成は `brand_admin` のみ）

### 範囲外（本 MVP）

加盟精算、跨店在庫調撥、加盟承認ワークフロー。


## 在庫 MVP：原料・出入庫・低在庫・簡易 BOM（AUT-38）

日本門店向けの在庫 MVP。**現在庫 = StockLedger.qtyDelta の合計**。出庫で負在庫になる場合は **409 で拒否**（サイレント負在庫なし）。単位は `g` / `ml` / `pc`（換算なし）。金額は円整数。全 API はセッションの **activeStoreId** で隔離（AUT-37）。

| モデル | 内容 |
|--------|------|
| Ingredient | storeId / name / unit / lowStockThreshold / costYenPerUnit |
| StockLedger | ingredientId / qtyDelta（+入/−出） / reason / createdBy? |
| BomLine | menuItemId → ingredientId / qtyPerItem（無効 menuItemId は拒否） |

### デモパス

1. `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`
2. `owner@shinso.demo` / `demo1234` → **/admin/inventory**
3. **原料**タブ：鶏もも肉・生ビール原液・枝豆（冷凍）・串竹（Seed）。枝豆は入庫 3000 → 出庫 2000 で現在庫 1000 &lt; 閾値 1500
4. **低在庫**タブ（または `GET /api/inventory/low-stock`）で枝豆アラートを確認
5. **出入庫**：任意原料を入庫 → 出庫。在庫超の出庫は 409
6. **BOM**：もも / ねぎま / 枝豆 / 生ビール / 唐揚げ定食の簡易レシピを確認
7. **粗算耗用**：直近 7 日の精算済販売数 × BOM（リアルタイム自動減算ではない）
8. 店舗隔離：`brandadmin@` で店舗 B に切替 → A の枝豆は見えない

### API

- `GET/POST /api/inventory/ingredients` · `GET/PATCH/DELETE /api/inventory/ingredients/:id`
- `GET/POST /api/inventory/ledger`（出庫超過 → 409）
- `GET/POST /api/inventory/bom` · `PATCH/DELETE /api/inventory/bom/:id`
- `GET /api/inventory/low-stock`
- `GET /api/inventory/usage-estimate?from=&to=`（任意・Asia/Tokyo 日付）

### 範囲外（本 MVP）

多倉、生産計画、送厨時のリアルタイム理論在庫同期。調達は AUT-39。

### 子課題

| ID | 内容 |
|----|------|
| AUT-98 | Ingredient + StockLedger |
| AUT-99 | 簡易 BOM + 粗算耗用 |
| AUT-100 | 低在庫 API + Admin UI |
| AUT-101 | seed / tests / README |



## 調達・発注：補貨提案 → 草稿 → 入庫（AUT-39）

在庫 MVP（AUT-38）の低在庫から **補貨提案 → PurchaseOrder（draft|ordered|received|canceled）→ 入庫 → StockLedger inbound** までを接続。提案数量 = `max(0, lowStockThreshold − onHand)`（店舗 = activeStoreId）。短収・超収いずれも可（数量 ≥ 0）。キャンセル済みは入庫不可。作成/編集/入庫は `PurchaseOrderAudit` に留痕。

| モデル | 内容 |
|--------|------|
| Supplier | storeId / name（最小主データ） |
| PurchaseOrder | storeId / supplierId? / status / note / who·when |
| PurchaseOrderLine | ingredientId / orderedQty / receivedQty? |
| PurchaseOrderAudit | action (create\|update\|order\|receive\|cancel) / summary / detail |

### デモパス

1. `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`
2. `owner@shinso.demo` / `demo1234` → **/admin/purchasing**（または在庫で枝豆が低在庫であることを確認）
3. **補貨提案**：枝豆（冷凍）が現在庫 1000 / 閾値 1500 → 提案数量 **500**
4. 「提案から下書き作成」→ **発注書**タブで数量を編集して保存 → 「発注確定」
5. **入庫確認**：入庫数量を入力（短収・超収可）→ 「入庫確定」→ 現在庫が増加し `/admin/inventory` の流水に `purchase_receive:…` が記録される
6. キャンセルした発注書は入庫 API が 409
7. 店舗隔離：`brandadmin@` で店舗 B に切替 → A の提案・発注は見えない

### API

- `GET /api/purchasing/suggestions`
- `GET/POST /api/purchasing/orders` · `GET/PATCH /api/purchasing/orders/:id`
- `POST /api/purchasing/orders/:id/receive`
- `GET /api/purchasing/suppliers`

### 範囲外（本 MVP）

仕入先ポータル、多段承認、外部 ERP 同期。

### 子課題

| ID | 内容 |
|----|------|
| AUT-102 | 補貨提案 suggestions |
| AUT-104 | PurchaseOrder 草稿/編集 |
| AUT-103 | 入庫 + Admin UI |
| AUT-105 | seed / tests / README |



## 財務分析：コスト粗算・毛利・簡要費用（AUT-40）

**経営分析用の概算 / 非法定帳務。** 会計帳簿・税務申告・監査の代替ではありません。Asia/Tokyo 日界、JPY 整数、店舗 = `activeStoreId`。

### 口径

| 指標 | 定義 |
|------|------|
| 売上 (revenue) | 当日の **paid Check**（AUT-32 と同じ `effectivePaidAt` / void 除外） |
| 原価粗算 (COGS) | 当日販売 MenuItem について `Σ (soldQty × BomLine.qtyPerItem × Ingredient.costYenPerUnit)`。BOM 未設定の品目は **0 円**（レスポンスに注記） |
| 費用 (expenses) | `ExpenseEntry` 手入力。**売上には加算しない** |
| 粗利概算 | `revenue − COGS − expenses` |

ライブ計算（MVP）。スナップショット表は任意・未使用。

### デモパス

1. `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`
2. `owner@shinso.demo` / `demo1234` → **/admin/finance**
3. 営業日を選び **毛利ボード**（売上・原価粗算・費用・粗利）を確認。BOM 未設定メニューは注記される
4. **費用入力**でカテゴリ（光熱費など）と金額を登録 → 粗利が減少する（売上は不変）
5. seed は Store A に当日・昨日の費用サンプル、Store B に隔離用 1 件を投入
6. 店舗隔離：`brandadmin@` で店舗 B に切替 → A の費用・毛利は見えない
7. `PAYMENT_MODE=mock pnpm test` に finance スイート含む

### API

- `GET /api/finance/margins?date=YYYY-MM-DD`
- `GET /api/finance/expenses?date=`（または `from`/`to`）
- `POST /api/finance/expenses`（owner/manager）

### 範囲外（本 MVP）

完全な総勘定元帳、税務申告、多主体連結。

### 子課題

| ID | 内容 |
|----|------|
| AUT-106 | コスト粗算 + 毛利 API |
| AUT-107 | ExpenseEntry |
| AUT-108 | Admin UI + 口径ドキュメント |
| AUT-109 | seed/tests + seed PO 清理 |

## 明确不做（本 MVP）

完整总账/税务申报/多主体合并（财务为经营概算）、供应商门户/多级审批/ERP 对接、多仓/生产计划、实时理论库存强一致、无限规则编排/完整 CDP（AUT-44 为预设 2–3 条）、Hot Pepper/食べログ 生产对接、排班、BI、原生 App、硬件驱动、营销官网、微信/支付宝**真实商户对接**（AUT-35 为标注沙箱模拟器）。LINE 会员 MVP 默认 simulator（无真实凭证）；Messaging 为 stub。支付默认 mock；sandbox/live 需 Stripe / PayPay / WeChat / Alipay 密钥（无密钥时用标注的模拟器）。


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

## ハードウェア拡張：第二套 + 手持（AUT-41）

Q1 **標準包は基準のまま**（置換・降格しない）。第二套は `pack=alt` / `isPrimaryStandardPack=false`。

### 互換性マトリクス（対応プロファイルのみ — 全機種対応は未宣言）

| pack | type | ラベル | 役割 | 状態 |
|------|------|--------|------|------|
| standard | t1_pos | SHINSO T1 POS | FOH タッチ | ✅ シミュレータ |
| standard | kitchen_display | Kitchen display | 厨屏フルスクリーン | ✅ シミュレータ |
| standard | printer | 80mm thermal | レシート / 厨打 | ✅ シミュレータ |
| alt | handheld_pos | Handheld POS (Sunmi 系) | 手持 /staff | ✅ シミュレータ |
| alt | kitchen_display_alt | Kitchen display (alt) | 副厨屏 | ✅ シミュレータ |
| alt | thermal_printer_alt | Thermal printer (alt) | 副サーマル | ✅ シミュレータ |

**明示的に未対応:** 無制限 SKU、自社カスタムハード、実機 SDK ブリッジ（`HARDWARE_MODE=live` は未接続メッセージ）、全日本市販機種の保証。

### 印刷ルーティング

1. `deviceId` 指定 → そのプリンタ（alt デモ用。標準デフォルトは奪わない）
2. 未指定 → **標準包** `printer`（`isPrimaryStandardPack`）を優先
3. 標準包が無い場合のみ他プリンタへフォールバック

### Seed（追加）

| code | type | pack |
|------|------|------|
| HH-01 | handheld_pos | alt |
| KDS-A1 | kitchen_display_alt | alt |
| PRT-A1 | thermal_printer_alt | alt |

### デモパス（第二套 + 手持）

1. `pnpm db:seed` → `pnpm dev` → `floor@shinso.demo` / `demo1234`
2. **/devices** — 標準包と第二套を並列表記；「第二套を登録」「alt で再印刷デモ」
3. **/staff** — 手持レイアウト：卓番/コード選択 → 点菜 → **厨房へ送る**（同一 Check）
4. `POST /api/print-jobs` に `deviceId=<PRT-A1>` で alt 出票；続けて deviceId 無し再印刷は **PRT-01** のまま
5. 標準包回帰: `/pos?device=t1` → 送厨 → 精算 → `/devices` プレビュー
6. ワンショット: `pnpm demo:hardware`（標準） / `pnpm demo:hardware:alt`（第二套）


