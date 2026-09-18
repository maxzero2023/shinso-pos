/**
 * Package capability matrix (AUT-45) — Japanese labels for Admin read-only page.
 * Canonical human doc: docs/package-tiers.md
 */

export type TierMark = "含" | "不含" | "加购" | "—";

export type MatrixRow = {
  module: string;
  minimum: TierMark;
  standard: TierMark;
  full: TierMark;
  ticket: string;
  ticketUrl: string;
};

export type MatrixSection = {
  id: string;
  title: string;
  rows: MatrixRow[];
};

const L = (id: string) => `https://linear.app/autoagentshinso/issue/${id}`;

export const LOCKED_DECISIONS: Array<{ id: string; text: string }> = [
  {
    id: "L1",
    text: "Q1 支払いはクレジットカード + PayPay。WeChat / Alipay は Standard / Full の加購可（AUT-35）。",
  },
  {
    id: "L2",
    text: "Q1 標準ハードウェア = T1 + 厨屏 + プリンタ。第二套 / 手持（alt）は加購であり標準包を置換・降格しない（AUT-30 / AUT-41）。",
  },
  {
    id: "L3",
    text: "LINE は Q2 必須。Standard から LINE 会員 CRM を含む（AUT-33）。",
  },
  {
    id: "L4",
    text: "日本単店優先。Minimum / Standard は単店前提；多店・サプライチェーンは Full（AUT-37+）。",
  },
];

export const TIER_BLURBS: Array<{ tier: string; blurb: string }> = [
  {
    tier: "Minimum",
    blurb: "日本単店の開店クローズドループ：開台→点餐→厨打→精算 + 予約/候位 MVP + カード/PayPay + 標準ハード包。",
  },
  {
    tier: "Standard",
    blurb: "Minimum + 日常運営（注文運営・レポート・LINE CRM 必須・店主ダイジェスト・三言語）。WeChat/Alipay と alt ハードは加購可。",
  },
  {
    tier: "Full",
    blurb: "Standard + 連鎖/サプライチェーン + 成長（多店・在庫・調達・財務概算・候位 LINE 深度・配達・マーケ自動化）。",
  },
];

export const MATRIX_SECTIONS: MatrixSection[] = [
  {
    id: "q1",
    title: "Q1 開店クローズドループ",
    rows: [
      {
        module: "FOH POS：開台→点餐→厨打→精算",
        minimum: "含",
        standard: "含",
        full: "含",
        ticket: "AUT-28",
        ticketUrl: L("AUT-28"),
      },
      {
        module: "自社予約 + 候位 MVP",
        minimum: "含",
        standard: "含",
        full: "含",
        ticket: "AUT-46",
        ticketUrl: L("AUT-46"),
      },
      {
        module: "支払い：クレジットカード + PayPay",
        minimum: "含",
        standard: "含",
        full: "含",
        ticket: "AUT-29",
        ticketUrl: L("AUT-29"),
      },
      {
        module: "支払い：WeChat / Alipay（訪日客）",
        minimum: "不含",
        standard: "加购",
        full: "加购",
        ticket: "AUT-35",
        ticketUrl: L("AUT-35"),
      },
      {
        module: "標準ハード包：T1 + 厨屏 + プリンタ",
        minimum: "含",
        standard: "含",
        full: "含",
        ticket: "AUT-30",
        ticketUrl: L("AUT-30"),
      },
      {
        module: "第二套ハード / 手持（alt pack）",
        minimum: "不含",
        standard: "加购",
        full: "加购",
        ticket: "AUT-41",
        ticketUrl: L("AUT-41"),
      },
    ],
  },
  {
    id: "q2",
    title: "Q2 日常運営",
    rows: [
      {
        module: "注文運営：退改・営業日/班次・異常単",
        minimum: "不含",
        standard: "含",
        full: "含",
        ticket: "AUT-31",
        ticketUrl: L("AUT-31"),
      },
      {
        module: "基礎レポート",
        minimum: "不含",
        standard: "含",
        full: "含",
        ticket: "AUT-32",
        ticketUrl: L("AUT-32"),
      },
      {
        module: "LINE 会員 CRM（LINE 必須）",
        minimum: "不含",
        standard: "含",
        full: "含",
        ticket: "AUT-33",
        ticketUrl: L("AUT-33"),
      },
      {
        module: "店主 LINE 日報 / 週報",
        minimum: "不含",
        standard: "含",
        full: "含",
        ticket: "AUT-34",
        ticketUrl: L("AUT-34"),
      },
      {
        module: "点餐端 日 / 中 / 英",
        minimum: "不含",
        standard: "含",
        full: "含",
        ticket: "AUT-36",
        ticketUrl: L("AUT-36"),
      },
    ],
  },
  {
    id: "q3",
    title: "Q3 連鎖とサプライチェーン",
    rows: [
      {
        module: "多店：Brand / Store・権限・切替",
        minimum: "不含",
        standard: "不含",
        full: "含",
        ticket: "AUT-37",
        ticketUrl: L("AUT-37"),
      },
      {
        module: "在庫 MVP",
        minimum: "不含",
        standard: "不含",
        full: "含",
        ticket: "AUT-38",
        ticketUrl: L("AUT-38"),
      },
      {
        module: "調達・発注",
        minimum: "不含",
        standard: "不含",
        full: "含",
        ticket: "AUT-39",
        ticketUrl: L("AUT-39"),
      },
      {
        module: "財務概算（コスト粗算・毛利・費用）",
        minimum: "不含",
        standard: "不含",
        full: "含",
        ticket: "AUT-40",
        ticketUrl: L("AUT-40"),
      },
    ],
  },
  {
    id: "q4",
    title: "Q4 シーン拡張と成長",
    rows: [
      {
        module: "候位 LINE 生産化 / CRM 深度",
        minimum: "不含",
        standard: "不含",
        full: "含",
        ticket: "AUT-42",
        ticketUrl: L("AUT-42"),
      },
      {
        module: "配達・外卖 半自動進単進厨",
        minimum: "不含",
        standard: "不含",
        full: "含",
        ticket: "AUT-43",
        ticketUrl: L("AUT-43"),
      },
      {
        module: "マーケ自動化（休眠召回など 2–3 ルール）",
        minimum: "不含",
        standard: "不含",
        full: "含",
        ticket: "AUT-44",
        ticketUrl: L("AUT-44"),
      },
    ],
  },
];

export const DOC_PATH = "docs/package-tiers.md";
export const CSV_PATH = "docs/package-tiers.csv";
