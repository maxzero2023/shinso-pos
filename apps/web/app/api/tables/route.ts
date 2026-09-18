import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { sumCheckItems } from "@shinso/api";

export async function GET() {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;

  const tables = await prisma.table.findMany({
    where: { area: { storeId: session.storeId } },
    orderBy: [{ area: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: {
      area: true,
      checks: {
        where: { status: "open" },
        take: 1,
        include: { items: true },
      },
    },
  });

  return json({
    tables: tables.map((t) => {
      const open = t.checks[0] ?? null;
      return {
        id: t.id,
        code: t.code,
        seats: t.seats,
        status: t.status,
        areaId: t.areaId,
        areaName: t.area.name,
        openCheck: open
          ? {
              id: open.id,
              guestCount: open.guestCount,
              itemCount: open.items.filter((i) => i.status !== "void").length,
              totalYen: sumCheckItems(open.items),
              openedAt: open.openedAt,
            }
          : null,
      };
    }),
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const body = await req.json().catch(() => null);
  if (!body?.areaId || !body?.code) return error("areaId と code が必要です");
  const area = await prisma.area.findFirst({
    where: { id: body.areaId, storeId: session.storeId },
  });
  if (!area) return error("エリアが見つかりません", 404);
  const table = await prisma.table.create({
    data: {
      areaId: area.id,
      code: String(body.code),
      seats: Number(body.seats ?? 4),
      sortOrder: Number(body.sortOrder ?? 0),
    },
  });
  return json({ table }, 201);
}
