import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { tryPrintAfterFire } from "@/lib/hardware";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const check = await prisma.check.findFirst({
    where: { id, table: { area: { storeId: session.storeId } } },
    include: { items: { where: { status: "draft" } } },
  });
  if (!check) return error("伝票が見つかりません", 404);
  if (check.status !== "open") return error("締めた伝票は送厨できません", 409);
  if (check.items.length === 0) return error("送厨する下書きがありません", 400);

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.kitchenTicket.create({
      data: {
        checkId: check.id,
        status: "queued",
        lines: {
          create: check.items.map((item) => ({
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
      where: { id: { in: check.items.map((i) => i.id) } },
      data: { status: "fired" },
    });
    return created;
  });

  // Same KitchenTicket → kitchen print (no shadow order). Best-effort.
  const print = await tryPrintAfterFire(session.storeId, ticket.id);
  const printJob = print?.ok ? print.data.job : null;

  return json(
    {
      ticket,
      printJob,
      printError: printJob?.status === "failed" ? printJob.errorMessage : null,
    },
    201
  );
}
