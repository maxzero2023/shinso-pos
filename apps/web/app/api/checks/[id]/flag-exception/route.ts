import { prisma } from "@shinso/db";
import { flagExceptionSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { writeCheckAudit } from "@/lib/ops";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = flagExceptionSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const check = await prisma.check.findFirst({
    where: { id, table: { area: { storeId: session.storeId } } },
  });
  if (!check) return error("伝票が見つかりません", 404);
  if (check.exceptionStatus === "flagged") {
    return error("すでに異常フラグが付いています", 409);
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.check.update({
      where: { id: check.id },
      data: {
        exceptionStatus: "flagged",
        exceptionNote: parsed.data.note,
        exceptionFlaggedAt: now,
        exceptionFlaggedByStaffId: session.staffId,
        exceptionResolvedAt: null,
        exceptionResolvedByStaffId: null,
        exceptionResolveNote: null,
      },
      include: { table: true },
    });
    const audit = await writeCheckAudit({
      tx,
      storeId: session.storeId,
      checkId: check.id,
      staffId: session.staffId,
      action: "flag_exception",
      summary: `異常フラグ: ${parsed.data.note}`,
      detail: { note: parsed.data.note, checkStatus: check.status, role: session.role },
    });
    return { check: updated, audit };
  });

  return json(result);
}
