import { Prisma } from "@prisma/client";
import { prisma } from "@shinso/db";
import {
  toQtyNumber,
  type IngredientCreateInput,
  type IngredientUpdateInput,
  type StockLedgerCreateInput,
  type BomLineCreateInput,
  type BomLineUpdateInput,
} from "@shinso/api";

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

export async function getOnHand(ingredientId: string): Promise<number> {
  const agg = await prisma.stockLedger.aggregate({
    where: { ingredientId },
    _sum: { qtyDelta: true },
  });
  return toQtyNumber(agg._sum.qtyDelta);
}

export async function listIngredients(storeId: string) {
  const rows = await prisma.ingredient.findMany({
    where: { storeId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const withOnHand = await Promise.all(
    rows.map(async (r) => {
      const onHand = await getOnHand(r.id);
      const threshold = toQtyNumber(r.lowStockThreshold);
      return {
        ...r,
        lowStockThreshold: threshold,
        onHand,
        isLowStock: onHand < threshold,
      };
    })
  );
  return withOnHand;
}

export async function getIngredient(storeId: string, id: string) {
  const row = await prisma.ingredient.findFirst({ where: { id, storeId } });
  if (!row) return null;
  const onHand = await getOnHand(row.id);
  const threshold = toQtyNumber(row.lowStockThreshold);
  return {
    ...row,
    lowStockThreshold: threshold,
    onHand,
    isLowStock: onHand < threshold,
  };
}

export async function createIngredient(storeId: string, input: IngredientCreateInput) {
  return prisma.ingredient.create({
    data: {
      storeId,
      name: input.name,
      unit: input.unit,
      lowStockThreshold: dec(input.lowStockThreshold),
      costYenPerUnit: input.costYenPerUnit,
      active: input.active ?? true,
    },
  });
}

export async function updateIngredient(
  storeId: string,
  id: string,
  input: IngredientUpdateInput
) {
  const existing = await prisma.ingredient.findFirst({ where: { id, storeId } });
  if (!existing) return null;
  return prisma.ingredient.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.lowStockThreshold !== undefined
        ? { lowStockThreshold: dec(input.lowStockThreshold) }
        : {}),
      ...(input.costYenPerUnit !== undefined ? { costYenPerUnit: input.costYenPerUnit } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function deleteIngredient(storeId: string, id: string) {
  const existing = await prisma.ingredient.findFirst({ where: { id, storeId } });
  if (!existing) return null;
  await prisma.ingredient.delete({ where: { id } });
  return existing;
}

export async function listLedger(storeId: string, ingredientId?: string, limit = 100) {
  return prisma.stockLedger.findMany({
    where: {
      ingredient: { storeId },
      ...(ingredientId ? { ingredientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
    include: {
      ingredient: { select: { id: true, name: true, unit: true, storeId: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Post inbound/outbound. Rejects outbound that would make on-hand negative (409).
 */
export async function postLedger(
  storeId: string,
  staffId: string | undefined,
  input: StockLedgerCreateInput
): Promise<
  | { ok: true; entry: Awaited<ReturnType<typeof prisma.stockLedger.create>>; onHand: number }
  | { ok: false; status: 404 | 409; message: string; onHand?: number }
> {
  const ingredient = await prisma.ingredient.findFirst({
    where: { id: input.ingredientId, storeId },
  });
  if (!ingredient) {
    return { ok: false, status: 404, message: "原料が見つかりません" };
  }

  const onHand = await getOnHand(ingredient.id);
  const next = onHand + input.qtyDelta;
  if (next < -1e-9) {
    return {
      ok: false,
      status: 409,
      message: `在庫不足です（現在庫 ${onHand}${ingredient.unit}、出庫要求 ${Math.abs(input.qtyDelta)}${ingredient.unit}）。負在庫は許可されていません。`,
      onHand,
    };
  }

  const entry = await prisma.stockLedger.create({
    data: {
      ingredientId: ingredient.id,
      qtyDelta: dec(input.qtyDelta),
      reason: input.reason,
      createdById: staffId ?? null,
    },
    include: {
      ingredient: { select: { id: true, name: true, unit: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return { ok: true, entry, onHand: next };
}

export async function listBomLines(storeId: string, menuItemId?: string) {
  return prisma.bomLine.findMany({
    where: {
      ingredient: { storeId },
      ...(menuItemId ? { menuItemId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      ingredient: { select: { id: true, name: true, unit: true, storeId: true } },
      menuItem: {
        select: {
          id: true,
          name: true,
          category: { select: { storeId: true, name: true } },
        },
      },
    },
  });
}

export async function createBomLine(
  storeId: string,
  input: BomLineCreateInput
): Promise<
  | { ok: true; line: Awaited<ReturnType<typeof prisma.bomLine.create>> }
  | { ok: false; status: 400 | 404; message: string }
> {
  const ingredient = await prisma.ingredient.findFirst({
    where: { id: input.ingredientId, storeId },
  });
  if (!ingredient) {
    return { ok: false, status: 404, message: "原料が見つかりません" };
  }

  const menuItem = await prisma.menuItem.findFirst({
    where: { id: input.menuItemId, category: { storeId } },
  });
  if (!menuItem) {
    return {
      ok: false,
      status: 400,
      message: "無効な menuItemId です（当店舗のメニューのみ BOM に紐付け可能）",
    };
  }

  try {
    const line = await prisma.bomLine.create({
      data: {
        menuItemId: input.menuItemId,
        ingredientId: input.ingredientId,
        qtyPerItem: dec(input.qtyPerItem),
      },
      include: {
        ingredient: { select: { id: true, name: true, unit: true } },
        menuItem: { select: { id: true, name: true } },
      },
    });
    return { ok: true, line };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, status: 400, message: "同じメニュー×原料の BOM が既に存在します" };
    }
    throw e;
  }
}

export async function updateBomLine(
  storeId: string,
  id: string,
  input: BomLineUpdateInput
) {
  const existing = await prisma.bomLine.findFirst({
    where: { id, ingredient: { storeId } },
  });
  if (!existing) return null;
  return prisma.bomLine.update({
    where: { id },
    data: { qtyPerItem: dec(input.qtyPerItem) },
    include: {
      ingredient: { select: { id: true, name: true, unit: true } },
      menuItem: { select: { id: true, name: true } },
    },
  });
}

export async function deleteBomLine(storeId: string, id: string) {
  const existing = await prisma.bomLine.findFirst({
    where: { id, ingredient: { storeId } },
  });
  if (!existing) return null;
  await prisma.bomLine.delete({ where: { id } });
  return existing;
}

export async function listLowStock(storeId: string) {
  const ingredients = await listIngredients(storeId);
  return ingredients.filter((i) => i.active && i.isLowStock);
}

/**
 * Rough usage estimate: sold qty of menu items (paid checks in range) × BomLine qty.
 * Not realtime auto-deduct — async estimate only.
 */
export async function estimateUsage(
  storeId: string,
  fromYmd?: string,
  toYmd?: string
) {
  const tokyoYmd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  const to = toYmd ?? tokyoYmd(new Date());
  const from =
    fromYmd ??
    tokyoYmd(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const fromDt = new Date(`${from}T00:00:00+09:00`);
  const toDt = new Date(`${to}T23:59:59.999+09:00`);

  // Paid/closed checks in store within Tokyo date range (async estimate, not auto-deduct)
  const items = await prisma.checkItem.findMany({
    where: {
      status: { not: "void" },
      check: {
        status: "paid",
        closedAt: { gte: fromDt, lte: toDt },
        table: { area: { storeId } },
      },
    },
    select: { menuItemId: true, qty: true },
  });

  const soldByMenu = new Map<string, number>();
  for (const it of items) {
    soldByMenu.set(it.menuItemId, (soldByMenu.get(it.menuItemId) ?? 0) + it.qty);
  }

  const bomLines = await prisma.bomLine.findMany({
    where: { ingredient: { storeId } },
    include: {
      ingredient: { select: { id: true, name: true, unit: true } },
      menuItem: { select: { id: true, name: true } },
    },
  });

  type UsageRow = {
    ingredientId: string;
    ingredientName: string;
    unit: string;
    estimatedQty: number;
    byMenuItem: Array<{
      menuItemId: string;
      menuItemName: string;
      soldQty: number;
      qtyPerItem: number;
      usage: number;
    }>;
  };

  const byIngredient = new Map<string, UsageRow>();

  for (const line of bomLines) {
    const soldQty = soldByMenu.get(line.menuItemId) ?? 0;
    if (soldQty === 0) continue;
    const qtyPerItem = toQtyNumber(line.qtyPerItem);
    const usage = soldQty * qtyPerItem;
    let row = byIngredient.get(line.ingredientId);
    if (!row) {
      row = {
        ingredientId: line.ingredientId,
        ingredientName: line.ingredient.name,
        unit: line.ingredient.unit,
        estimatedQty: 0,
        byMenuItem: [],
      };
      byIngredient.set(line.ingredientId, row);
    }
    row.estimatedQty += usage;
    row.byMenuItem.push({
      menuItemId: line.menuItemId,
      menuItemName: line.menuItem.name,
      soldQty,
      qtyPerItem,
      usage,
    });
  }

  return {
    from,
    to,
    soldMenuItemCount: soldByMenu.size,
    totalSoldQty: [...soldByMenu.values()].reduce((a, b) => a + b, 0),
    ingredients: [...byIngredient.values()].sort((a, b) =>
      a.ingredientName.localeCompare(b.ingredientName, "ja")
    ),
  };
}
