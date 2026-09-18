import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { checkShiftAttribution } from "@/lib/ops";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const table = await prisma.table.findFirst({
    where: { id, area: { storeId: session.storeId } },
  });
  if (!table) return error("テーブルが見つかりません", 404);

  const existing = await prisma.check.findFirst({
    where: { tableId: table.id, status: "open" },
  });
  if (existing) return error("すでにオープン中の伝票があります", 409, { checkId: existing.id });

  const attribution = await checkShiftAttribution(session.storeId);

  const check = await prisma.$transaction(async (tx) => {
    const created = await tx.check.create({
      data: {
        tableId: table.id,
        guestCount: Number(body.guestCount ?? 1),
        status: "open",
        businessDayId: attribution.businessDayId,
        shiftId: attribution.shiftId,
      },
      include: { items: true },
    });
    await tx.table.update({
      where: { id: table.id },
      data: { status: "seated" },
    });
    return created;
  });

  return json({ check }, 201);
}
