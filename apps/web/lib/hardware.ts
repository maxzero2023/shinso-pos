import { prisma } from "@shinso/db";
import {
  enqueueKitchenPrint,
  enqueueReceiptPrint,
  getHardwareMode,
  type ReceiptPayload,
  type KitchenTicketPayload,
  sumCheckItems,
} from "@shinso/api";

export async function printReceiptForCheck(opts: {
  storeId: string;
  checkId: string;
  reprint?: boolean;
  deviceId?: string;
}) {
  const check = await prisma.check.findFirst({
    where: { id: opts.checkId, table: { area: { storeId: opts.storeId } } },
    include: {
      items: { where: { status: { not: "void" } } },
      payments: { where: { status: "succeeded" }, orderBy: { paidAt: "desc" }, take: 1 },
      table: { include: { area: { include: { store: true } } } },
    },
  });
  if (!check) return { ok: false as const, status: 404, error: "伝票が見つかりません" };
  if (check.status === "void") {
    return { ok: false as const, status: 409, error: "無効な伝票は印刷できません" };
  }

  const payload: ReceiptPayload = {
    storeName: check.table.area.store.name,
    tableCode: check.table.code,
    areaName: check.table.area.name,
    checkId: check.id,
    guestCount: check.guestCount,
    items: check.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      unitPriceYen: i.unitPriceYen,
      modifiers: Array.isArray(i.modifiers)
        ? (i.modifiers as Array<{ name: string; priceYen?: number }>)
        : [],
    })),
    totalYen: sumCheckItems(check.items),
    paymentMethod: check.payments[0]?.method,
    paidAt: check.payments[0]?.paidAt ?? check.closedAt,
  };

  const job = await enqueueReceiptPrint(prisma, {
    storeId: opts.storeId,
    checkId: check.id,
    payload,
    deviceId: opts.deviceId,
  });

  return { ok: true as const, status: 201 as const, data: { job, mode: getHardwareMode() } };
}

export async function printKitchenForTicket(opts: {
  storeId: string;
  kitchenTicketId: string;
  deviceId?: string;
}) {
  const ticket = await prisma.kitchenTicket.findFirst({
    where: {
      id: opts.kitchenTicketId,
      check: { table: { area: { storeId: opts.storeId } } },
    },
    include: {
      lines: true,
      check: {
        include: { table: { include: { area: { include: { store: true } } } } },
      },
    },
  });
  if (!ticket) return { ok: false as const, status: 404, error: "厨票が見つかりません" };

  const payload: KitchenTicketPayload = {
    storeName: ticket.check.table.area.store.name,
    tableCode: ticket.check.table.code,
    areaName: ticket.check.table.area.name,
    ticketId: ticket.id,
    checkId: ticket.checkId,
    firedAt: ticket.firedAt,
    lines: ticket.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      modifiers: l.modifiers,
    })),
  };

  const job = await enqueueKitchenPrint(prisma, {
    storeId: opts.storeId,
    checkId: ticket.checkId,
    kitchenTicketId: ticket.id,
    payload,
    deviceId: opts.deviceId,
  });

  return { ok: true as const, status: 201 as const, data: { job, mode: getHardwareMode() } };
}

export async function tryPrintAfterFire(storeId: string, kitchenTicketId: string) {
  try {
    return await printKitchenForTicket({ storeId, kitchenTicketId });
  } catch (e) {
    console.error("[hardware] kitchen print failed", e);
    return null;
  }
}

export async function tryPrintAfterPay(storeId: string, checkId: string) {
  try {
    return await printReceiptForCheck({ storeId, checkId });
  } catch (e) {
    console.error("[hardware] receipt print failed", e);
    return null;
  }
}
