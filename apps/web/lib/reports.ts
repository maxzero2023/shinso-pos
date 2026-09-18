import { prisma } from "@shinso/db";
import {
  buildBestsellersReport,
  buildDailyReport,
  buildHourlyReport,
  buildTableAvgReport,
  tokyoDateRangeInclusive,
  tokyoDayRange,
  type PaidCheckForReport,
} from "@shinso/api";

async function loadPaidChecksInRange(
  storeId: string,
  start: Date,
  end: Date
): Promise<PaidCheckForReport[]> {
  // Broad fetch: paid checks whose closedAt or a succeeded payment paidAt may fall in range.
  // Precise Tokyo-day filter happens in build* via effectivePaidAt.
  const padMs = 24 * 60 * 60 * 1000;
  const checks = await prisma.check.findMany({
    where: {
      status: "paid",
      table: { area: { storeId } },
      OR: [
        {
          closedAt: {
            gte: new Date(start.getTime() - padMs),
            lt: new Date(end.getTime() + padMs),
          },
        },
        {
          payments: {
            some: {
              status: "succeeded",
              paidAt: {
                gte: new Date(start.getTime() - padMs),
                lt: new Date(end.getTime() + padMs),
              },
            },
          },
        },
      ],
    },
    include: {
      items: true,
      payments: {
        where: { status: "succeeded" },
        select: { status: true, paidAt: true, amountYen: true },
      },
    },
  });
  return checks as PaidCheckForReport[];
}

export async function getDailyReport(storeId: string, dateYmd: string) {
  const { start, end } = tokyoDayRange(dateYmd);
  const checks = await loadPaidChecksInRange(storeId, start, end);
  return buildDailyReport(dateYmd, checks);
}

export async function getTableAvgReport(storeId: string, dateYmd: string) {
  const { start, end } = tokyoDayRange(dateYmd);
  const checks = await loadPaidChecksInRange(storeId, start, end);
  return buildTableAvgReport(dateYmd, checks);
}

export async function getHourlyReport(storeId: string, dateYmd: string) {
  const { start, end } = tokyoDayRange(dateYmd);
  const checks = await loadPaidChecksInRange(storeId, start, end);
  return buildHourlyReport(dateYmd, checks);
}

export async function getBestsellersReport(
  storeId: string,
  fromYmd: string,
  toYmd: string,
  limit = 20
) {
  const { start, end } = tokyoDateRangeInclusive(fromYmd, toYmd);
  const checks = await loadPaidChecksInRange(storeId, start, end);
  return buildBestsellersReport(fromYmd, toYmd, checks, limit);
}
