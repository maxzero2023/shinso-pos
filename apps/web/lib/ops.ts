import { prisma } from "@shinso/db";
import { tokyoBusinessDate } from "@shinso/api";
import type { Prisma } from "@shinso/db";

export async function findOpenShift(storeId: string) {
  return prisma.shift.findFirst({
    where: { storeId, status: "open" },
    include: { businessDay: true },
    orderBy: { openedAt: "desc" },
  });
}

/** Attribution fields when opening a Check during an open shift. */
export async function checkShiftAttribution(storeId: string): Promise<{
  businessDayId?: string;
  shiftId?: string;
}> {
  const shift = await findOpenShift(storeId);
  if (!shift) return {};
  return { businessDayId: shift.businessDayId, shiftId: shift.id };
}

export async function countOpenChecks(storeId: string): Promise<number> {
  return prisma.check.count({
    where: { status: "open", table: { area: { storeId } } },
  });
}

export async function getOrCreateOpenBusinessDay(opts: {
  storeId: string;
  staffId: string;
  now?: Date;
}) {
  const businessDate = tokyoBusinessDate(opts.now);
  const existing = await prisma.businessDay.findUnique({
    where: {
      storeId_businessDate: {
        storeId: opts.storeId,
        businessDate,
      },
    },
  });
  if (existing) {
    if (existing.status === "closed") {
      return prisma.businessDay.update({
        where: { id: existing.id },
        data: {
          status: "open",
          closedAt: null,
          closedByStaffId: null,
          openedAt: new Date(),
          openedByStaffId: opts.staffId,
        },
      });
    }
    return existing;
  }
  return prisma.businessDay.create({
    data: {
      storeId: opts.storeId,
      businessDate,
      status: "open",
      openedByStaffId: opts.staffId,
    },
  });
}

export async function writeCheckAudit(opts: {
  storeId: string;
  checkId: string;
  staffId: string;
  action: string;
  summary: string;
  detail?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}) {
  const db = opts.tx ?? prisma;
  return db.checkAuditLog.create({
    data: {
      storeId: opts.storeId,
      checkId: opts.checkId,
      staffId: opts.staffId,
      action: opts.action,
      summary: opts.summary,
      detail: opts.detail ?? undefined,
    },
  });
}
