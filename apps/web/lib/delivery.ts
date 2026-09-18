import { prisma } from "@shinso/db";
import { findUnmappedLines, suggestMenuItemId } from "@shinso/api";
import type { Prisma } from "@shinso/db";
import { checkShiftAttribution } from "./ops";

const DELIVERY_AREA_NAME = "配達";

/** Ensure store has a 配達 area + at least one free virtual DEL-* table. */
export async function ensureDeliveryTables(storeId: string) {
  let area = await prisma.area.findFirst({
    where: { storeId, name: DELIVERY_AREA_NAME },
  });
  if (!area) {
    area = await prisma.area.create({
      data: { storeId, name: DELIVERY_AREA_NAME, sortOrder: 99 },
    });
  }

  const tables = await prisma.table.findMany({
    where: { areaId: area.id },
    orderBy: { sortOrder: "asc" },
  });

  const openChecks = await prisma.check.findMany({
    where: { status: "open", tableId: { in: tables.map((t) => t.id) } },
    select: { tableId: true },
  });
  const busy = new Set(openChecks.map((c) => c.tableId));
  const free = tables.filter((t) => !busy.has(t.id));

  if (free.length > 0) {
    return { area, table: free[0]! };
  }

  const nextNum = tables.length + 1;
  const created = await prisma.table.create({
    data: {
      areaId: area.id,
      code: `DEL-${String(nextNum).padStart(2, "0")}`,
      seats: 1,
      sortOrder: nextNum,
      status: "free",
    },
  });
  return { area, table: created };
}

export type SimulateLineInput = {
  externalItemName: string;
  externalItemCode?: string | null;
  qty: number;
  unitPriceYen: number;
  menuItemId?: string | null;
  note?: string | null;
};

/**
 * Create a pending ExternalOrder. Does NOT create Check or KitchenTicket.
 * Auto-suggests menu mappings as hints only.
 */
export async function createPendingExternalOrder(opts: {
  storeId: string;
  channel: "demaecan" | "uber_eats_jp";
  externalId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  note?: string | null;
  lines: SimulateLineInput[];
  rawPayload?: Prisma.InputJsonValue;
}) {
  const menuItems = await prisma.menuItem.findMany({
    where: { category: { storeId: opts.storeId } },
    select: { id: true, name: true, nameZh: true, nameEn: true, active: true },
  });

  const order = await prisma.externalOrder.create({
    data: {
      storeId: opts.storeId,
      channel: opts.channel,
      externalId: opts.externalId,
      status: "pending",
      customerName: opts.customerName ?? null,
      customerPhone: opts.customerPhone ?? null,
      note: opts.note ?? null,
      rawPayload: opts.rawPayload ?? undefined,
      lines: {
        create: opts.lines.map((line, idx) => {
          const hinted =
            line.menuItemId && menuItems.some((m) => m.id === line.menuItemId)
              ? line.menuItemId
              : suggestMenuItemId(line.externalItemName, menuItems);
          return {
            externalItemName: line.externalItemName,
            externalItemCode: line.externalItemCode ?? null,
            qty: line.qty,
            unitPriceYen: line.unitPriceYen,
            menuItemId: hinted,
            note: line.note ?? null,
            sortOrder: idx + 1,
          };
        }),
      },
    },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { menuItem: { select: { id: true, name: true, priceYen: true, active: true } } },
      },
    },
  });

  return order;
}

export async function patchExternalOrderMappings(opts: {
  storeId: string;
  orderId: string;
  lines: Array<{ id: string; menuItemId: string | null; note?: string | null }>;
  note?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
}) {
  const order = await prisma.externalOrder.findFirst({
    where: { id: opts.orderId, storeId: opts.storeId },
    include: { lines: true },
  });
  if (!order) return { error: "外部注文が見つかりません" as const, status: 404 as const };
  if (order.status !== "pending") {
    return { error: "確認待ち注文のみマッピング編集できます" as const, status: 409 as const };
  }

  const lineIds = new Set(order.lines.map((l) => l.id));
  for (const patch of opts.lines) {
    if (!lineIds.has(patch.id)) {
      return { error: `行 ${patch.id} はこの注文にありません` as const, status: 400 as const };
    }
    if (patch.menuItemId) {
      const item = await prisma.menuItem.findFirst({
        where: { id: patch.menuItemId, category: { storeId: opts.storeId }, active: true },
      });
      if (!item) {
        return {
          error: `メニュー ${patch.menuItemId} が店舗に存在しないか無効です` as const,
          status: 400 as const,
        };
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const patch of opts.lines) {
      await tx.externalOrderLine.update({
        where: { id: patch.id },
        data: {
          menuItemId: patch.menuItemId,
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        },
      });
    }
    await tx.externalOrder.update({
      where: { id: order.id },
      data: {
        mappingError: null,
        ...(opts.note !== undefined ? { note: opts.note } : {}),
        ...(opts.customerName !== undefined ? { customerName: opts.customerName } : {}),
        ...(opts.customerPhone !== undefined ? { customerPhone: opts.customerPhone } : {}),
      },
    });
  });

  const updated = await prisma.externalOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { menuItem: { select: { id: true, name: true, priceYen: true, active: true } } },
      },
    },
  });
  return { order: updated };
}

/**
 * Confirm mapping → create Check (channel=delivery) + fire KitchenTickets atomically.
 * On mapping failure: clear error, NO partial Check.
 */
export async function confirmExternalOrder(opts: {
  storeId: string;
  orderId: string;
  staffId: string;
  guestCount?: number;
}) {
  const order = await prisma.externalOrder.findFirst({
    where: { id: opts.orderId, storeId: opts.storeId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!order) return { error: "外部注文が見つかりません" as const, status: 404 as const };
  if (order.status === "confirmed" && order.checkId) {
    return {
      error: "すでに確認済みです" as const,
      status: 409 as const,
      checkId: order.checkId,
    };
  }
  if (order.status === "cancelled") {
    return { error: "キャンセル済みの注文は確認できません" as const, status: 409 as const };
  }
  if (order.lines.length === 0) {
    return { error: "明細がありません" as const, status: 400 as const };
  }

  const unmapped = findUnmappedLines(order.lines);
  if (unmapped.length > 0) {
    const msg = `マッピング未完了: ${unmapped.map((u) => u.externalItemName).join("、")}`;
    await prisma.externalOrder.update({
      where: { id: order.id },
      data: { mappingError: msg },
    });
    return {
      error: msg,
      status: 400 as const,
      unmapped,
      mappingError: msg,
    };
  }

  const menuIds = [...new Set(order.lines.map((l) => l.menuItemId!))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuIds }, category: { storeId: opts.storeId } },
  });
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  const bad: string[] = [];
  for (const line of order.lines) {
    const m = byId.get(line.menuItemId!);
    if (!m || !m.active) bad.push(line.externalItemName);
  }
  if (bad.length > 0) {
    const msg = `無効または他店のメニュー: ${bad.join("、")}`;
    await prisma.externalOrder.update({
      where: { id: order.id },
      data: { mappingError: msg },
    });
    return { error: msg, status: 400 as const, mappingError: msg };
  }

  const { table } = await ensureDeliveryTables(opts.storeId);
  const attribution = await checkShiftAttribution(opts.storeId);
  const guestCount = opts.guestCount ?? 1;
  const noteParts = [
    `配達/${order.channel}`,
    order.externalId,
    order.customerName ? `客:${order.customerName}` : null,
    order.note,
  ].filter(Boolean);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.check.findFirst({
        where: { tableId: table.id, status: "open" },
      });
      if (existing) {
        throw new Error("DELIVERY_TABLE_BUSY");
      }

      const check = await tx.check.create({
        data: {
          tableId: table.id,
          channel: "delivery",
          guestCount,
          note: noteParts.join(" / "),
          status: "open",
          businessDayId: attribution.businessDayId,
          shiftId: attribution.shiftId,
        },
      });

      await tx.table.update({
        where: { id: table.id },
        data: { status: "ordering" },
      });

      const checkItems = [];
      for (const line of order.lines) {
        const menu = byId.get(line.menuItemId!)!;
        const item = await tx.checkItem.create({
          data: {
            checkId: check.id,
            menuItemId: menu.id,
            name: menu.name,
            unitPriceYen: menu.priceYen,
            qty: line.qty,
            modifiers: [],
            status: "draft",
            note: line.note ?? `外部: ${line.externalItemName}`,
          },
        });
        checkItems.push(item);
      }

      const ticket = await tx.kitchenTicket.create({
        data: {
          checkId: check.id,
          status: "queued",
          lines: {
            create: checkItems.map((item) => ({
              checkItemId: item.id,
              qty: item.qty,
              name: item.name,
              modifiers: item.modifiers ?? [],
            })),
          },
        },
        include: { lines: true },
      });

      await tx.checkItem.updateMany({
        where: { id: { in: checkItems.map((i) => i.id) } },
        data: { status: "fired" },
      });

      const updatedOrder = await tx.externalOrder.update({
        where: { id: order.id },
        data: {
          status: "confirmed",
          checkId: check.id,
          confirmedAt: new Date(),
          confirmedByStaffId: opts.staffId,
          mappingError: null,
        },
        include: {
          lines: {
            orderBy: { sortOrder: "asc" },
            include: { menuItem: { select: { id: true, name: true, priceYen: true } } },
          },
        },
      });

      return { check, ticket, order: updatedOrder, checkItems };
    });

    return result;
  } catch (e) {
    const msg =
      e instanceof Error && e.message === "DELIVERY_TABLE_BUSY"
        ? "配達枠の割当に失敗しました。再試行してください"
        : "確認処理に失敗しました（部分伝票は作成されていません）";
    await prisma.externalOrder.update({
      where: { id: order.id },
      data: { mappingError: msg },
    });
    return { error: msg, status: 500 as const, mappingError: msg };
  }
}

export async function listExternalOrders(opts: {
  storeId: string;
  status?: "pending" | "confirmed" | "cancelled";
}) {
  return prisma.externalOrder.findMany({
    where: {
      storeId: opts.storeId,
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { menuItem: { select: { id: true, name: true, priceYen: true, active: true } } },
      },
      check: {
        select: {
          id: true,
          status: true,
          channel: true,
          kitchenTickets: { select: { id: true, status: true } },
        },
      },
    },
  });
}
