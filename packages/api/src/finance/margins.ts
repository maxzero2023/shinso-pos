import {
  buildDailyReport,
  checkRevenueYen,
  effectivePaidAt,
  tokyoDayRange,
  type PaidCheckForReport,
} from "../reports";

export type SoldMenuQty = {
  menuItemId: string;
  name: string;
  soldQty: number;
  revenueYen: number;
};

export type BomCostLine = {
  menuItemId: string;
  ingredientId: string;
  qtyPerItem: number;
  costYenPerUnit: number;
};

export type MenuCogsRow = {
  menuItemId: string;
  name: string;
  soldQty: number;
  revenueYen: number;
  cogsYen: number;
  hasBom: boolean;
};

/**
 * Aggregate sold qty / line revenue from paid checks in a Tokyo day.
 * Void checks and void items excluded (same口径 as AUT-32).
 */
export function soldMenuFromPaidChecks(
  dateYmd: string,
  checks: PaidCheckForReport[]
): SoldMenuQty[] {
  const { start, end } = tokyoDayRange(dateYmd);
  const byMenu = new Map<string, SoldMenuQty>();

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
      const lineRev = (item.unitPriceYen + mods) * item.qty;
      const row = byMenu.get(item.menuItemId);
      if (!row) {
        byMenu.set(item.menuItemId, {
          menuItemId: item.menuItemId,
          name: item.name,
          soldQty: item.qty,
          revenueYen: lineRev,
        });
      } else {
        row.soldQty += item.qty;
        row.revenueYen += lineRev;
        if (!row.name && item.name) row.name = item.name;
      }
    }
  }

  return [...byMenu.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ja")
  );
}

/**
 * COGS estimate: Σ (soldQty × BomLine.qtyPerItem × Ingredient.costYenPerUnit).
 * Missing BOM → 0 for that menu item (noted by caller via hasBom=false).
 * Result rounded to JPY integer per menu line, then summed.
 */
export function estimateCogsFromBom(
  sold: SoldMenuQty[],
  bomLines: BomCostLine[]
): {
  cogsYen: number;
  byMenuItem: MenuCogsRow[];
  missingBomMenuItemIds: string[];
  missingBomNotes: string[];
} {
  const bomByMenu = new Map<string, BomCostLine[]>();
  for (const line of bomLines) {
    const arr = bomByMenu.get(line.menuItemId) ?? [];
    arr.push(line);
    bomByMenu.set(line.menuItemId, arr);
  }

  const byMenuItem: MenuCogsRow[] = [];
  const missingBomMenuItemIds: string[] = [];
  const missingBomNotes: string[] = [];
  let cogsYen = 0;

  for (const s of sold) {
    const lines = bomByMenu.get(s.menuItemId) ?? [];
    const hasBom = lines.length > 0;
    let lineCogs = 0;
    if (hasBom) {
      for (const line of lines) {
        lineCogs += s.soldQty * line.qtyPerItem * line.costYenPerUnit;
      }
      lineCogs = Math.round(lineCogs);
    } else if (s.soldQty > 0) {
      missingBomMenuItemIds.push(s.menuItemId);
      missingBomNotes.push(
        `${s.name || s.menuItemId}: BOM 未設定のため原価 0 円として計上`
      );
    }
    cogsYen += lineCogs;
    byMenuItem.push({
      menuItemId: s.menuItemId,
      name: s.name,
      soldQty: s.soldQty,
      revenueYen: s.revenueYen,
      cogsYen: lineCogs,
      hasBom,
    });
  }

  return { cogsYen, byMenuItem, missingBomMenuItemIds, missingBomNotes };
}

/** Gross margin = revenue − COGS − expenses (expenses never add to revenue). */
export function computeGrossMarginYen(
  revenueYen: number,
  cogsYen: number,
  expensesYen: number
): number {
  return revenueYen - cogsYen - expensesYen;
}

export type MarginsBreakdown = {
  date: string;
  timezone: "Asia/Tokyo";
  disclaimer: string;
  statutoryAccounting: false;
  revenueYen: number;
  paidCheckCount: number;
  cogsYen: number;
  expensesYen: number;
  grossMarginYen: number;
  byMenuItem: MenuCogsRow[];
  missingBomMenuItemIds: string[];
  missingBomNotes: string[];
};

export function buildMarginsBreakdown(opts: {
  dateYmd: string;
  checks: PaidCheckForReport[];
  bomLines: BomCostLine[];
  expensesYen: number;
  disclaimer: string;
}): MarginsBreakdown {
  const daily = buildDailyReport(opts.dateYmd, opts.checks);
  const sold = soldMenuFromPaidChecks(opts.dateYmd, opts.checks);
  const cogs = estimateCogsFromBom(sold, opts.bomLines);
  const expensesYen = Math.max(0, Math.round(opts.expensesYen));
  const grossMarginYen = computeGrossMarginYen(
    daily.revenueYen,
    cogs.cogsYen,
    expensesYen
  );

  return {
    date: opts.dateYmd,
    timezone: "Asia/Tokyo",
    disclaimer: opts.disclaimer,
    statutoryAccounting: false,
    revenueYen: daily.revenueYen,
    paidCheckCount: daily.paidCheckCount,
    cogsYen: cogs.cogsYen,
    expensesYen,
    grossMarginYen,
    byMenuItem: cogs.byMenuItem,
    missingBomMenuItemIds: cogs.missingBomMenuItemIds,
    missingBomNotes: cogs.missingBomNotes,
  };
}

/** Re-export for callers that only need revenue math. */
export { checkRevenueYen, buildDailyReport };
