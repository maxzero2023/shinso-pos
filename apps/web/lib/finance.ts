import { prisma } from "@shinso/db";
import {
  FINANCE_DISCLAIMER_JA,
  buildMarginsBreakdown,
  toQtyNumber,
  tokyoDayRange,
  type ExpenseCreateInput,
  type PaidCheckForReport,
} from "@shinso/api";

async function loadPaidChecksForDay(
  storeId: string,
  dateYmd: string
): Promise<PaidCheckForReport[]> {
  const { start, end } = tokyoDayRange(dateYmd);
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

function dateOnly(ymd: string): Date {
  // Prisma @db.Date — noon UTC avoids TZ edge when storing calendar date
  return new Date(`${ymd}T00:00:00.000Z`);
}

export async function sumExpensesYen(storeId: string, dateYmd: string): Promise<number> {
  const agg = await prisma.expenseEntry.aggregate({
    where: { storeId, date: dateOnly(dateYmd) },
    _sum: { amountYen: true },
  });
  return agg._sum.amountYen ?? 0;
}

export async function getMargins(storeId: string, dateYmd: string) {
  const [checks, bomRows, expensesYen] = await Promise.all([
    loadPaidChecksForDay(storeId, dateYmd),
    prisma.bomLine.findMany({
      where: { ingredient: { storeId } },
      include: {
        ingredient: { select: { id: true, costYenPerUnit: true } },
      },
    }),
    sumExpensesYen(storeId, dateYmd),
  ]);

  const bomLines = bomRows.map((b) => ({
    menuItemId: b.menuItemId,
    ingredientId: b.ingredientId,
    qtyPerItem: toQtyNumber(b.qtyPerItem),
    costYenPerUnit: b.ingredient.costYenPerUnit,
  }));

  return buildMarginsBreakdown({
    dateYmd,
    checks,
    bomLines,
    expensesYen,
    disclaimer: FINANCE_DISCLAIMER_JA,
  });
}

export async function listExpenses(
  storeId: string,
  opts: { date?: string; from?: string; to?: string } = {}
) {
  const where: {
    storeId: string;
    date?: Date | { gte?: Date; lte?: Date };
  } = { storeId };

  if (opts.date) {
    where.date = dateOnly(opts.date);
  } else if (opts.from || opts.to) {
    where.date = {
      ...(opts.from ? { gte: dateOnly(opts.from) } : {}),
      ...(opts.to ? { lte: dateOnly(opts.to) } : {}),
    };
  }

  const rows = await prisma.expenseEntry.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    date: r.date.toISOString().slice(0, 10),
    amountYen: r.amountYen,
    category: r.category,
    label: r.label,
    note: r.note,
    createdById: r.createdById,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createExpense(
  storeId: string,
  staffId: string | undefined,
  input: ExpenseCreateInput
) {
  const row = await prisma.expenseEntry.create({
    data: {
      storeId,
      date: dateOnly(input.date),
      amountYen: input.amountYen,
      category: input.category,
      label: input.label ?? null,
      note: input.note ?? null,
      createdById: staffId ?? null,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return {
    id: row.id,
    storeId: row.storeId,
    date: row.date.toISOString().slice(0, 10),
    amountYen: row.amountYen,
    category: row.category,
    label: row.label,
    note: row.note,
    createdById: row.createdById,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
