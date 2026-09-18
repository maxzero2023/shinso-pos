import { RECEIPT_WIDTH_CHARS } from "./types";

export type ReceiptLineItem = {
  name: string;
  qty: number;
  unitPriceYen: number;
  modifiers?: Array<{ name: string; priceYen?: number }>;
};

export type ReceiptPayload = {
  storeName: string;
  tableCode: string;
  areaName?: string;
  checkId: string;
  guestCount?: number;
  items: ReceiptLineItem[];
  totalYen: number;
  paymentMethod?: string;
  paidAt?: Date | string | null;
};

export type KitchenTicketPayload = {
  storeName: string;
  tableCode: string;
  areaName?: string;
  ticketId: string;
  checkId: string;
  firedAt: Date | string;
  lines: Array<{ name: string; qty: number; modifiers?: unknown }>;
};

function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  return w;
}

function truncate(s: string, max: number): string {
  let w = 0;
  let out = "";
  for (const ch of s) {
    const cw = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
    if (w + cw > max) break;
    out += ch;
    w += cw;
  }
  return out;
}

function padCenter(text: string, width = RECEIPT_WIDTH_CHARS): string {
  const t = truncate(text, width);
  const pad = Math.max(0, width - displayWidth(t));
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + t + " ".repeat(pad - left);
}

function moneyLine(label: string, yen: number, width = RECEIPT_WIDTH_CHARS): string {
  const right = `¥${yen.toLocaleString("ja-JP")}`;
  const leftMax = width - displayWidth(right) - 1;
  const left = truncate(label, Math.max(0, leftMax));
  const pad = Math.max(1, width - displayWidth(left) - displayWidth(right));
  return left + " ".repeat(pad) + right;
}

function formatTokyo(d: Date | string | null | undefined): string {
  const date = d ? new Date(d) : new Date();
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

const METHOD_JA: Record<string, string> = {
  cash: "現金",
  card: "カード",
  paypay: "PayPay",
  wechat: "WeChat",
  alipay: "Alipay",
};

export function formatReceiptText(p: ReceiptPayload): string {
  const lines: string[] = [];
  lines.push(padCenter("================================"));
  lines.push(padCenter(p.storeName));
  lines.push(padCenter("領　収　書"));
  lines.push(padCenter("================================"));
  lines.push(`卓: ${p.areaName ? `${p.areaName} ` : ""}${p.tableCode}`);
  if (p.guestCount) lines.push(`人数: ${p.guestCount}名`);
  lines.push(`伝票: ${p.checkId.slice(0, 12)}`);
  lines.push(`日時: ${formatTokyo(p.paidAt)}`);
  lines.push("--------------------------------");
  for (const item of p.items) {
    lines.push(moneyLine(`${item.name} x${item.qty}`, item.unitPriceYen * item.qty));
    for (const m of item.modifiers ?? []) {
      const add = m.priceYen ? ` (+¥${m.priceYen})` : "";
      lines.push(`  + ${m.name}${add}`);
    }
  }
  lines.push("--------------------------------");
  lines.push(moneyLine("合計（税込）", p.totalYen));
  if (p.paymentMethod) {
    lines.push(`お支払: ${METHOD_JA[p.paymentMethod] ?? p.paymentMethod}`);
  }
  lines.push("================================");
  lines.push(padCenter("ご来店ありがとうございました"));
  lines.push(padCenter("またのお越しをお待ちしております"));
  lines.push("");
  return lines.join("\n");
}

export function formatReceiptHtml(p: ReceiptPayload): string {
  const escaped = formatReceiptText(p)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre class="receipt-80mm" style="font-family:ui-monospace,monospace;font-size:12px;line-height:1.35;width:80mm;max-width:100%;white-space:pre-wrap;background:#fff;border:1px dashed #999;padding:12px;margin:0;">${escaped}</pre>`;
}

export function formatKitchenTicketText(p: KitchenTicketPayload): string {
  const lines: string[] = [];
  lines.push(padCenter("******** 厨　打 ********"));
  lines.push(padCenter(p.storeName));
  lines.push(`卓: ${p.areaName ? `${p.areaName} ` : ""}${p.tableCode}`);
  lines.push(`票: ${p.ticketId.slice(0, 10)}`);
  lines.push(`伝票: ${p.checkId.slice(0, 12)}`);
  lines.push(`送厨: ${formatTokyo(p.firedAt)}`);
  lines.push("------------------------------");
  for (const l of p.lines) {
    lines.push(`${l.name}  x${l.qty}`);
    const mods = Array.isArray(l.modifiers) ? l.modifiers : [];
    for (const m of mods as Array<{ name?: string } | string>) {
      const name = typeof m === "string" ? m : m?.name;
      if (name) lines.push(`  + ${name}`);
    }
  }
  lines.push("------------------------------");
  lines.push(padCenter("キッチン確認"));
  lines.push("");
  return lines.join("\n");
}

export function formatKitchenTicketHtml(p: KitchenTicketPayload): string {
  const escaped = formatKitchenTicketText(p)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre class="receipt-80mm kitchen-chit" style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.4;width:80mm;max-width:100%;white-space:pre-wrap;background:#fffef5;border:2px solid #0e8f52;padding:12px;margin:0;">${escaped}</pre>`;
}
