# 套餐能力边界对照表（Minimum / Standard / Full）

> **文档性质**：产品/销售/实施对齐用的能力边界 spike（AUT-45）。**非定价、非法务合同**。不承诺本仓库「明确不做」清单中的未规划能力。  
> **权威源**：本文件（`docs/package-tiers.md`）。机器可读副本：`docs/package-tiers.csv`。只读预览：`/admin/package-tiers`。  
> **销售/实施签字**：由产品侧组织评审（工程交付文档后待产品确认）。

## 图例

| 标记 | 含义 |
|------|------|
| **含** | 该档默认包含（开箱可用 / 已规划交付） |
| **不含** | 该档不包含；升级到更高档或另议 |
| **加购** | 该档可选加购模块（不降级已含能力） |

## 锁定决策（不得被套餐文案矛盾覆盖）

| # | 决策 | 套餐落点 |
|---|------|----------|
| L1 | **Q1 支付 = 信用卡 + PayPay** | Minimum 起即含；**WeChat / Alipay** 可作为 Standard / Full **加购**（访日客场景，见 AUT-35） |
| L2 | **Q1 硬件 = T1 + 厨屏 + 打印机** | Minimum 起即含标准包；**第二套 / 手持 alt pack** 为加购（AUT-41），**不替换、不降格**标准包 |
| L3 | **LINE 必上 Q2** | Standard 起含 LINE 会员 / 绑定 / 触达主路径（AUT-33）；Minimum 仅预留 stub，不以 LINE 生产化为卖点 |
| L4 | **日本单店优先** | Minimum / Standard 以日本单店开店与日常经营为主；多店与连锁供应链在 Full（AUT-37+） |

## 档位一句话

| 档位 | 一句话 | 对应里程碑重心 |
|------|--------|----------------|
| **Minimum** | 日本单店「开店闭环」可演示：开台→点餐→厨打→结账 + 预约/候位 MVP + 卡/PayPay + 标准硬件包 | Q1 |
| **Standard** | Minimum + 日常经营：订单运营、报表、**LINE CRM（必上）**、老板日报/周报、点餐三语；微信/支付宝与 alt 硬件可加购 | Q1 + Q2 |
| **Full** | Standard + 连锁供应链与增长：多店、库存、采购、财务概算、候位 LINE 深度、外卖半自动、营销自动化；硬件第二套可加购 | Q1–Q4 |

---

## 1. 开店闭环（Q1）

| 能力模块 | Minimum | Standard | Full | 工单 |
|----------|---------|----------|------|------|
| FOH POS：开台→点餐→厨打→结账（同一桌同一 Check） | 含 | 含 | 含 | [AUT-28](https://linear.app/autoagentshinso/issue/AUT-28) |
| 自社预约 + 候位叫号 MVP（预占 ≠ open Check） | 含 | 含 | 含 | [AUT-46](https://linear.app/autoagentshinso/issue/AUT-46) |
| 支付：信用卡 + PayPay（日本单店） | 含 | 含 | 含 | [AUT-29](https://linear.app/autoagentshinso/issue/AUT-29) |
| 支付：微信 / 支付宝（访日客） | 不含 | 加购 | 加购 | [AUT-35](https://linear.app/autoagentshinso/issue/AUT-35) |
| 标准硬件包：T1 + 厨屏 + 打印机（シミュレータ） | 含 | 含 | 含 | [AUT-30](https://linear.app/autoagentshinso/issue/AUT-30) |
| 硬件第二套 / 手持适配（alt pack） | 不含 | 加购 | 加购 | [AUT-41](https://linear.app/autoagentshinso/issue/AUT-41) |

## 2. 日常经营（Q2）

| 能力模块 | Minimum | Standard | Full | 工单 |
|----------|---------|----------|------|------|
| 订单运营：退改权限、营业日/班次、异常单 | 不含 | 含 | 含 | [AUT-31](https://linear.app/autoagentshinso/issue/AUT-31) |
| 基础报表：日营收 / 热销 / 桌均 / 时段 | 不含 | 含 | 含 | [AUT-32](https://linear.app/autoagentshinso/issue/AUT-32) |
| LINE 会员：绑定、集点、简易券核销（**LINE 必上**） | 不含 | 含 | 含 | [AUT-33](https://linear.app/autoagentshinso/issue/AUT-33) |
| 老板 LINE 日报 / 周报推送 | 不含 | 含 | 含 | [AUT-34](https://linear.app/autoagentshinso/issue/AUT-34) |
| 点餐端日 / 中 / 英体验 | 不含 | 含 | 含 | [AUT-36](https://linear.app/autoagentshinso/issue/AUT-36) |

## 3. 连锁与供应链（Q3）

| 能力模块 | Minimum | Standard | Full | 工单 |
|----------|---------|----------|------|------|
| 多店架构：Brand / Store、权限、切换 | 不含 | 不含 | 含 | [AUT-37](https://linear.app/autoagentshinso/issue/AUT-37) |
| 库存 MVP：原料、出入库、低库存、简单 BOM | 不含 | 不含 | 含 | [AUT-38](https://linear.app/autoagentshinso/issue/AUT-38) |
| 采购单：补货建议 → 草稿 → 到货入库 | 不含 | 不含 | 含 | [AUT-39](https://linear.app/autoagentshinso/issue/AUT-39) |
| 财务加深：成本粗算、毛利、简要费用 | 不含 | 不含 | 含 | [AUT-40](https://linear.app/autoagentshinso/issue/AUT-40) |
| （再列）硬件第二套 / 手持 | 不含 | 加购 | 加购 | [AUT-41](https://linear.app/autoagentshinso/issue/AUT-41) |

> **日本单店优先**：Minimum / Standard 对外讲解默认单店；Full 才把多店与供应链作为主能力讲。

## 4. 场景扩展与增长（Q4）

| 能力模块 | Minimum | Standard | Full | 工单 |
|----------|---------|----------|------|------|
| 候位 LINE 生产化 / CRM 深度（叫号推送、过号策略） | 不含 | 不含 | 含 | [AUT-42](https://linear.app/autoagentshinso/issue/AUT-42) |
| 外卖半自动进单进厨 | 不含 | 不含 | 含 | [AUT-43](https://linear.app/autoagentshinso/issue/AUT-43) |
| 营销自动化：沉睡召回等 2–3 条规则 | 不含 | 不含 | 含 | [AUT-44](https://linear.app/autoagentshinso/issue/AUT-44) |
| 本对照表 / Admin 只读预览 | — | — | — | [AUT-45](https://linear.app/autoagentshinso/issue/AUT-45) |

---

## 附录 A：能力项 → Linear 父工单（AUT-28 … AUT-45）

| ID | 标题 | 里程碑 | 主要落入档位 |
|----|------|--------|--------------|
| [AUT-28](https://linear.app/autoagentshinso/issue/AUT-28) | FOH POS 开台→点餐→厨打→结账 MVP | Q1 开店闭环 | Minimum+ |
| [AUT-46](https://linear.app/autoagentshinso/issue/AUT-46) | 预约与候位 MVP | Q1 开店闭环 | Minimum+ |
| [AUT-29](https://linear.app/autoagentshinso/issue/AUT-29) | 信用卡 + PayPay | Q1 开店闭环 | Minimum+ |
| [AUT-30](https://linear.app/autoagentshinso/issue/AUT-30) | 标准硬件包 T1 + 厨屏 + 打印机 | Q1 开店闭环 | Minimum+ |
| [AUT-31](https://linear.app/autoagentshinso/issue/AUT-31) | 订单运营 | Q2 日常经营 | Standard+ |
| [AUT-32](https://linear.app/autoagentshinso/issue/AUT-32) | 基础报表 | Q2 日常经营 | Standard+ |
| [AUT-33](https://linear.app/autoagentshinso/issue/AUT-33) | LINE 会员 CRM | Q2 日常经营 | Standard+（LINE 必上） |
| [AUT-34](https://linear.app/autoagentshinso/issue/AUT-34) | 老板 LINE 日报/周报 | Q2 日常经营 | Standard+ |
| [AUT-35](https://linear.app/autoagentshinso/issue/AUT-35) | 微信 / 支付宝 | Q2 日常经营 | Standard/Full **加购** |
| [AUT-36](https://linear.app/autoagentshinso/issue/AUT-36) | 点餐端日中英 | Q2 日常经营 | Standard+ |
| [AUT-37](https://linear.app/autoagentshinso/issue/AUT-37) | 多店 Brand/Store | Q3 连锁与供应链 | Full |
| [AUT-38](https://linear.app/autoagentshinso/issue/AUT-38) | 库存 MVP | Q3 连锁与供应链 | Full |
| [AUT-39](https://linear.app/autoagentshinso/issue/AUT-39) | 采购单 | Q3 连锁与供应链 | Full |
| [AUT-40](https://linear.app/autoagentshinso/issue/AUT-40) | 财务加深 | Q3 连锁与供应链 | Full |
| [AUT-41](https://linear.app/autoagentshinso/issue/AUT-41) | 硬件扩展第二套/手持 | Q3 连锁与供应链 | Standard/Full **加购** |
| [AUT-42](https://linear.app/autoagentshinso/issue/AUT-42) | 候位 LINE 生产化 | Q4 场景扩展与增长 | Full |
| [AUT-43](https://linear.app/autoagentshinso/issue/AUT-43) | 外卖半自动进单进厨 | Q4 场景扩展与增长 | Full |
| [AUT-44](https://linear.app/autoagentshinso/issue/AUT-44) | 营销自动化 | Q4 场景扩展与增长 | Full |
| [AUT-45](https://linear.app/autoagentshinso/issue/AUT-45) | 套餐能力边界对照表（本文） | Q4 场景扩展与增长 | 文档 / Admin 只读 |

相关商业父题：[AUT-27](https://linear.app/autoagentshinso/issue/AUT-27)（对外可讲清）。

## 附录 B：明确不在本矩阵承诺范围

与仓库 README「明确不做」对齐，**不得**在销售话术中当作已含能力：

- 完整总账 / 税务申报 / 多主体合并
- 供应商门户 / 多级审批 / ERP 对接
- 无限营销规则编排 / 完整 CDP
- Hot Pepper / 食べログ **生产**对接、排班、BI、原生 App、实机 SDK 驱动
- 微信/支付宝 **真实商户**对接（当前为标注沙箱模拟器）
- 具体 **定价** 与 **法务合同** 文本

## 附录 C：Seed 桌码约定（AUT-127）

演示店桌台编码统一为 **T1–T5**（テーブル）、**C1–C4**（カウンター）、**P1–P3**（個室）。  
硬件设备码 **T1-01** 表示标准 POS 机型「SHINSO T1」，与桌码 T1 同前缀但分属不同实体；勿与桌台混淆。  
历史 seed 曾误写桌码 `A1`（不存在）→ 已改为查找 `T1`，与 POS/Staff/文档一致。

---

*最后更新：AUT-45 / AUT-126 / AUT-127 spike。*
