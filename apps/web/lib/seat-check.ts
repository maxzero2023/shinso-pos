import { prisma } from "@shinso/db";

/**
 * Open a Check on a table — AUT-28 invariant: at most one open Check per table.
 */
export async function openCheckOnTable(opts: {
  tableId: string;
  storeId: string;
  guestCount: number;
}) {
  const table = await prisma.table.findFirst({
    where: { id: opts.tableId, area: { storeId: opts.storeId } },
  });
  if (!table) return { error: "テーブルが見つかりません" as const, status: 404 as const };

  const existing = await prisma.check.findFirst({
    where: { tableId: table.id, status: "open" },
  });
  if (existing) {
    return {
      error: "すでにオープン中の伝票があります" as const,
      status: 409 as const,
      checkId: existing.id,
    };
  }

  const check = await prisma.$transaction(async (tx) => {
    const created = await tx.check.create({
      data: {
        tableId: table.id,
        guestCount: opts.guestCount,
        status: "open",
      },
    });
    await tx.table.update({
      where: { id: table.id },
      data: { status: "seated" },
    });
    return created;
  });

  return { check, table };
}
