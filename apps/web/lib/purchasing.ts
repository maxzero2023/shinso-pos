import { Prisma } from "@prisma/client";
import { prisma } from "@shinso/db";
import {
  toQtyNumber,
  type PurchaseOrderCreateInput,
  type PurchaseOrderUpdateInput,
  type PurchaseOrderReceiveInput,
} from "@shinso/api";
import { getOnHand, listLowStock, postLedger } from "@/lib/inventory";

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

const orderInclude = {
  supplier: { select: { id: true, name: true, active: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  lines: {
    include: {
      ingredient: {
        select: { id: true, name: true, unit: true, storeId: true },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  audits: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    include: {
      staff: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

export type PurchaseOrderWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: typeof orderInclude;
}>;

export function serializeOrder(order: PurchaseOrderWithRelations) {
  return {
    ...order,
    lines: order.lines.map((l) => ({
      ...l,
      orderedQty: toQtyNumber(l.orderedQty),
      receivedQty: l.receivedQty == null ? null : toQtyNumber(l.receivedQty),
    })),
  };
}

export type Suggestion = {
  ingredientId: string;
  name: string;
  unit: string;
  onHand: number;
  lowStockThreshold: number;
  suggestedQty: number;
};

/** Suggestion qty = max(0, lowStockThreshold - onHand), store-scoped. */
export async function listSuggestions(storeId: string): Promise<Suggestion[]> {
  const low = await listLowStock(storeId);
  return low
    .map((i) => {
      const suggestedQty = Math.max(0, i.lowStockThreshold - i.onHand);
      return {
        ingredientId: i.id,
        name: i.name,
        unit: i.unit,
        onHand: i.onHand,
        lowStockThreshold: i.lowStockThreshold,
        suggestedQty,
      };
    })
    .filter((s) => s.suggestedQty > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  opts: {
    storeId: string;
    orderId: string;
    staffId?: string | null;
    action: string;
    summary: string;
    detail?: Prisma.InputJsonValue;
  }
) {
  await tx.purchaseOrderAudit.create({
    data: {
      storeId: opts.storeId,
      orderId: opts.orderId,
      staffId: opts.staffId ?? null,
      action: opts.action,
      summary: opts.summary,
      detail: opts.detail ?? undefined,
    },
  });
}

async function assertIngredientsInStore(
  storeId: string,
  ingredientIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const unique = [...new Set(ingredientIds)];
  const found = await prisma.ingredient.findMany({
    where: { storeId, id: { in: unique } },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    return { ok: false, message: "原料が見つかりません（他店舗または無効な ID）" };
  }
  return { ok: true };
}

export async function listOrders(storeId: string, status?: string) {
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      storeId,
      ...(status ? { status: status as Prisma.EnumPurchaseOrderStatusFilter["equals"] } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: orderInclude,
  });
  return orders.map(serializeOrder);
}

export async function getOrder(storeId: string, id: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, storeId },
    include: orderInclude,
  });
  return order ? serializeOrder(order) : null;
}

export async function createOrder(
  storeId: string,
  staffId: string | undefined,
  input: PurchaseOrderCreateInput
): Promise<
  | { ok: true; order: ReturnType<typeof serializeOrder> }
  | { ok: false; status: 400 | 404; message: string }
> {
  let lines = input.lines;
  if (input.fromSuggestions) {
    const suggestions = await listSuggestions(storeId);
    if (suggestions.length === 0) {
      return { ok: false, status: 400, message: "低在庫の補貨提案がありません" };
    }
    lines = suggestions.map((s) => ({
      ingredientId: s.ingredientId,
      orderedQty: s.suggestedQty,
    }));
  }

  if (!lines.length) {
    return { ok: false, status: 400, message: "明細が必要です" };
  }

  const check = await assertIngredientsInStore(
    storeId,
    lines.map((l) => l.ingredientId)
  );
  if (!check.ok) return { ok: false, status: 400, message: check.message };

  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, storeId },
    });
    if (!supplier) {
      return { ok: false, status: 400, message: "仕入先が見つかりません" };
    }
  }

  const status = input.status ?? "draft";
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        storeId,
        supplierId: input.supplierId ?? null,
        note: input.note ?? null,
        status,
        createdById: staffId ?? null,
        updatedById: staffId ?? null,
        orderedAt: status === "ordered" ? new Date() : null,
        lines: {
          create: lines.map((l) => ({
            ingredientId: l.ingredientId,
            orderedQty: dec(l.orderedQty),
          })),
        },
      },
    });
    await writeAudit(tx, {
      storeId,
      orderId: created.id,
      staffId,
      action: "create",
      summary: `発注書を作成（${status}・${lines.length}行）`,
      detail: { status, lineCount: lines.length, fromSuggestions: !!input.fromSuggestions },
    });
    if (status === "ordered") {
      await writeAudit(tx, {
        storeId,
        orderId: created.id,
        staffId,
        action: "order",
        summary: "発注確定",
      });
    }
    return created;
  });

  const full = await getOrder(storeId, order.id);
  return { ok: true, order: full! };
}

export async function updateOrder(
  storeId: string,
  id: string,
  staffId: string | undefined,
  input: PurchaseOrderUpdateInput
): Promise<
  | { ok: true; order: NonNullable<Awaited<ReturnType<typeof getOrder>>> }
  | { ok: false; status: 400 | 404 | 409; message: string }
> {
  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, storeId },
    include: { lines: true },
  });
  if (!existing) return { ok: false, status: 404, message: "発注書が見つかりません" };

  if (existing.status === "received" || existing.status === "canceled") {
    return {
      ok: false,
      status: 409,
      message: `ステータス ${existing.status} の発注書は編集できません`,
    };
  }

  if (input.lines) {
    if (existing.status !== "draft") {
      return { ok: false, status: 409, message: "明細の編集は下書きのみ可能です" };
    }
    const check = await assertIngredientsInStore(
      storeId,
      input.lines.map((l) => l.ingredientId)
    );
    if (!check.ok) return { ok: false, status: 400, message: check.message };
  }

  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, storeId },
    });
    if (!supplier) {
      return { ok: false, status: 400, message: "仕入先が見つかりません" };
    }
  }

  let nextStatus: "draft" | "ordered" | "received" | "canceled" = existing.status;
  if (input.status === "canceled") {
    if (existing.status !== "draft" && existing.status !== "ordered") {
      return { ok: false, status: 409, message: "キャンセルできません" };
    }
    nextStatus = "canceled";
  } else if (input.status === "ordered") {
    if (existing.status !== "draft") {
      return { ok: false, status: 409, message: "発注確定は下書きからのみ可能です" };
    }
    nextStatus = "ordered";
  } else if (input.status === "draft" && existing.status !== "draft") {
    return { ok: false, status: 409, message: "下書きへ戻せません" };
  }

  await prisma.$transaction(async (tx) => {
    if (input.lines) {
      await tx.purchaseOrderLine.deleteMany({ where: { orderId: id } });
      await tx.purchaseOrderLine.createMany({
        data: input.lines.map((l) => ({
          orderId: id,
          ingredientId: l.ingredientId,
          orderedQty: dec(l.orderedQty),
        })),
      });
    }

    await tx.purchaseOrder.update({
      where: { id },
      data: {
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        status: nextStatus,
        updatedById: staffId ?? null,
        ...(nextStatus === "ordered" && existing.status !== "ordered"
          ? { orderedAt: new Date() }
          : {}),
        ...(nextStatus === "canceled" ? { canceledAt: new Date() } : {}),
      },
    });

    await writeAudit(tx, {
      storeId,
      orderId: id,
      staffId,
      action: nextStatus === "canceled" ? "cancel" : nextStatus === "ordered" && existing.status === "draft" ? "order" : "update",
      summary:
        nextStatus === "canceled"
          ? "発注書をキャンセル"
          : nextStatus === "ordered" && existing.status === "draft"
            ? "発注確定"
            : "発注書を更新",
      detail: {
        from: existing.status,
        to: nextStatus,
        linesUpdated: !!input.lines,
      },
    });
  });

  const full = await getOrder(storeId, id);
  return { ok: true, order: full! };
}

/**
 * Receive PO: post inbound ledger for each line, mark received.
 * Short-receive (receivedQty < ordered) and over-receive allowed; qty >= 0.
 * Canceled orders cannot be received.
 */
export async function receiveOrder(
  storeId: string,
  id: string,
  staffId: string | undefined,
  input: PurchaseOrderReceiveInput
): Promise<
  | {
      ok: true;
      order: NonNullable<Awaited<ReturnType<typeof getOrder>>>;
      ledgerResults: Array<{ ingredientId: string; onHand: number; qtyDelta: number }>;
    }
  | { ok: false; status: 400 | 404 | 409; message: string }
> {
  const existing = await prisma.purchaseOrder.findFirst({
    where: { id, storeId },
    include: { lines: true },
  });
  if (!existing) return { ok: false, status: 404, message: "発注書が見つかりません" };

  if (existing.status === "canceled") {
    return { ok: false, status: 409, message: "キャンセル済みの発注書は入庫できません" };
  }
  if (existing.status === "received") {
    return { ok: false, status: 409, message: "既に入庫済みです" };
  }
  if (existing.status !== "draft" && existing.status !== "ordered") {
    return { ok: false, status: 409, message: "このステータスでは入庫できません" };
  }

  const lineByIng = new Map(existing.lines.map((l) => [l.ingredientId, l]));
  for (const recv of input.lines) {
    if (!lineByIng.has(recv.ingredientId)) {
      return {
        ok: false,
        status: 400,
        message: `明細にない原料です: ${recv.ingredientId}`,
      };
    }
  }

  // Default: receive all lines; missing lines in payload keep orderedQty as received
  const recvMap = new Map(input.lines.map((l) => [l.ingredientId, l.receivedQty]));
  const toReceive = existing.lines.map((l) => ({
    ingredientId: l.ingredientId,
    receivedQty: recvMap.has(l.ingredientId)
      ? recvMap.get(l.ingredientId)!
      : toQtyNumber(l.orderedQty),
  }));

  const ledgerResults: Array<{ ingredientId: string; onHand: number; qtyDelta: number }> = [];

  // Post ledger first (outside status update) — inbound always allowed
  for (const row of toReceive) {
    if (row.receivedQty > 0) {
      const result = await postLedger(storeId, staffId, {
        ingredientId: row.ingredientId,
        qtyDelta: row.receivedQty,
        reason: `purchase_receive:${id}`,
      });
      if (!result.ok) {
        return { ok: false, status: result.status, message: result.message };
      }
      ledgerResults.push({
        ingredientId: row.ingredientId,
        onHand: result.onHand,
        qtyDelta: row.receivedQty,
      });
    } else {
      const onHand = await getOnHand(row.ingredientId);
      ledgerResults.push({
        ingredientId: row.ingredientId,
        onHand,
        qtyDelta: 0,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const row of toReceive) {
      await tx.purchaseOrderLine.updateMany({
        where: { orderId: id, ingredientId: row.ingredientId },
        data: { receivedQty: dec(row.receivedQty) },
      });
    }
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "received",
        receivedAt: new Date(),
        updatedById: staffId ?? null,
        // If still draft, also stamp orderedAt for audit clarity
        ...(existing.status === "draft" ? { orderedAt: existing.orderedAt ?? new Date() } : {}),
      },
    });
    await writeAudit(tx, {
      storeId,
      orderId: id,
      staffId,
      action: "receive",
      summary: `入庫確認（${toReceive.length}行）`,
      detail: {
        lines: toReceive,
      },
    });
  });

  const full = await getOrder(storeId, id);
  return { ok: true, order: full!, ledgerResults };
}

export async function listSuppliers(storeId: string) {
  return prisma.supplier.findMany({
    where: { storeId, active: true },
    orderBy: { name: "asc" },
  });
}

export async function ensureDefaultSupplier(storeId: string, name = "デフォルト仕入先") {
  const existing = await prisma.supplier.findFirst({
    where: { storeId, name },
  });
  if (existing) return existing;
  return prisma.supplier.create({
    data: { storeId, name },
  });
}
