import { z } from "zod";

export type ReportRole = "brand_admin" | "owner" | "manager" | "floor" | "kitchen";

/** Demo: brand_admin / owner / manager / floor may read reports; kitchen may not. */
export function canReadReports(role: ReportRole): boolean {
  return (
    role === "brand_admin" ||
    role === "owner" ||
    role === "manager" ||
    role === "floor"
  );
}

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

export const reportDateSchema = z
  .string()
  .regex(ymdRe, "date は YYYY-MM-DD（Asia/Tokyo）で指定してください");

export const bestsellersQuerySchema = z.object({
  from: reportDateSchema,
  to: reportDateSchema,
});

/** Asia/Tokyo calendar day → [start, end) in absolute time. */
export function tokyoDayRange(dateYmd: string): { start: Date; end: Date } {
  if (!ymdRe.test(dateYmd)) {
    throw new Error(`invalid date: ${dateYmd}`);
  }
  const start = new Date(`${dateYmd}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Inclusive from–to → [start, endExclusive). */
export function tokyoDateRangeInclusive(
  fromYmd: string,
  toYmd: string
): { start: Date; end: Date } {
  const { start } = tokyoDayRange(fromYmd);
  const { end } = tokyoDayRange(toYmd);
  if (start.getTime() > end.getTime() - 1) {
    throw new Error("from は to 以前である必要があります");
  }
  return { start, end };
}

/** Hour 0–23 in Asia/Tokyo. */
export function tokyoHour(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  // Some engines emit "24" for midnight — normalize
  const n = Number(hour);
  return n === 24 ? 0 : n;
}

export function tokyoYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Effective paidAt for a paid Check: latest succeeded Payment.paidAt,
 * else Check.closedAt. Used for daily / hourly bucketing.
 */
export function effectivePaidAt(opts: {
  closedAt: Date | string | null;
  payments: Array<{ status: string; paidAt: Date | string | null }>;
}): Date | null {
  let latest: Date | null = null;
  for (const p of opts.payments) {
    if (p.status !== "succeeded" || !p.paidAt) continue;
    const t = p.paidAt instanceof Date ? p.paidAt : new Date(p.paidAt);
    if (!latest || t.getTime() > latest.getTime()) latest = t;
  }
  if (latest) return latest;
  if (!opts.closedAt) return null;
  return opts.closedAt instanceof Date ? opts.closedAt : new Date(opts.closedAt);
}

export type PaidCheckForReport = {
  id: string;
  status: string;
  closedAt: Date | string | null;
  items: Array<{
    menuItemId: string;
    name: string;
    unitPriceYen: number;
    qty: number;
    status: string;
    modifiers?: unknown;
  }>;
  payments: Array<{ status: string; paidAt: Date | string | null; amountYen?: number }>;
};

/** Line revenue for non-void items (JPY integer). */
export function checkRevenueYen(
  items: PaidCheckForReport["items"]
): number {
  return items
    .filter((i) => i.status !== "void")
    .reduce((sum, item) => {
      const mods = Array.isArray(item.modifiers)
        ? (item.modifiers as Array<{ priceYen?: number }>).reduce(
            (m, x) => m + (x.priceYen ?? 0),
            0
          )
        : 0;
      return sum + (item.unitPriceYen + mods) * item.qty;
    }, 0);
}

export type DailyReport = {
  date: string;
  timezone: "Asia/Tokyo";
  revenueYen: number;
  paidCheckCount: number;
  voidExcluded: true;
};

export function buildDailyReport(
  dateYmd: string,
  checks: PaidCheckForReport[]
): DailyReport {
  const { start, end } = tokyoDayRange(dateYmd);
  let revenueYen = 0;
  let paidCheckCount = 0;
  for (const c of checks) {
    if (c.status !== "paid") continue;
    const paidAt = effectivePaidAt(c);
    if (!paidAt) continue;
    const t = paidAt.getTime();
    if (t < start.getTime() || t >= end.getTime()) continue;
    revenueYen += checkRevenueYen(c.items);
    paidCheckCount += 1;
  }
  return {
    date: dateYmd,
    timezone: "Asia/Tokyo",
    revenueYen,
    paidCheckCount,
    voidExcluded: true,
  };
}

export type TableAvgReport = {
  date: string;
  timezone: "Asia/Tokyo";
  revenueYen: number;
  paidCheckCount: number;
  /** revenueYen / paidCheckCount (rounded JPY); 0 when no paid checks */
  tableAvgYen: number;
  voidExcluded: true;
};

export function buildTableAvgReport(
  dateYmd: string,
  checks: PaidCheckForReport[]
): TableAvgReport {
  const daily = buildDailyReport(dateYmd, checks);
  const tableAvgYen =
    daily.paidCheckCount === 0
      ? 0
      : Math.round(daily.revenueYen / daily.paidCheckCount);
  return {
    date: dateYmd,
    timezone: "Asia/Tokyo",
    revenueYen: daily.revenueYen,
    paidCheckCount: daily.paidCheckCount,
    tableAvgYen,
    voidExcluded: true,
  };
}

export type HourlyBucket = {
  hour: number; // 0–23 Tokyo
  label: string; // "12:00"
  revenueYen: number;
  paidCheckCount: number;
};

export type HourlyReport = {
  date: string;
  timezone: "Asia/Tokyo";
  bucketBy: "paidAt";
  hours: HourlyBucket[];
  voidExcluded: true;
};

export function buildHourlyReport(
  dateYmd: string,
  checks: PaidCheckForReport[]
): HourlyReport {
  const { start, end } = tokyoDayRange(dateYmd);
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    revenueYen: 0,
    paidCheckCount: 0,
  }));
  for (const c of checks) {
    if (c.status !== "paid") continue;
    const paidAt = effectivePaidAt(c);
    if (!paidAt) continue;
    const t = paidAt.getTime();
    if (t < start.getTime() || t >= end.getTime()) continue;
    const h = tokyoHour(paidAt);
    buckets[h].revenueYen += checkRevenueYen(c.items);
    buckets[h].paidCheckCount += 1;
  }
  return {
    date: dateYmd,
    timezone: "Asia/Tokyo",
    bucketBy: "paidAt",
    hours: buckets,
    voidExcluded: true,
  };
}

export type BestsellerRow = {
  menuItemId: string;
  name: string;
  qty: number;
  revenueYen: number;
};

export type BestsellersReport = {
  from: string;
  to: string;
  timezone: "Asia/Tokyo";
  items: BestsellerRow[];
  voidExcluded: true;
};

export function buildBestsellersReport(
  fromYmd: string,
  toYmd: string,
  checks: PaidCheckForReport[],
  limit = 20
): BestsellersReport {
  const { start, end } = tokyoDateRangeInclusive(fromYmd, toYmd);
  const map = new Map<string, BestsellerRow>();
  for (const c of checks) {
    if (c.status !== "paid") continue;
    const paidAt = effectivePaidAt(c);
    if (!paidAt) continue;
    const t = paidAt.getTime();
    if (t < start.getTime() || t >= end.getTime()) continue;
    for (const item of c.items) {
      if (item.status === "void") continue;
      const mods = Array.isArray(item.modifiers)
        ? (item.modifiers as Array<{ priceYen?: number }>).reduce(
            (m, x) => m + (x.priceYen ?? 0),
            0
          )
        : 0;
      const lineYen = (item.unitPriceYen + mods) * item.qty;
      const prev = map.get(item.menuItemId);
      if (prev) {
        prev.qty += item.qty;
        prev.revenueYen += lineYen;
      } else {
        map.set(item.menuItemId, {
          menuItemId: item.menuItemId,
          name: item.name,
          qty: item.qty,
          revenueYen: lineYen,
        });
      }
    }
  }
  const items = [...map.values()].sort((a, b) => {
    if (b.qty !== a.qty) return b.qty - a.qty;
    return b.revenueYen - a.revenueYen;
  });
  return {
    from: fromYmd,
    to: toYmd,
    timezone: "Asia/Tokyo",
    items: items.slice(0, limit),
    voidExcluded: true,
  };
}
