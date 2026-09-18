import { prisma } from "@shinso/db";
import { resolveExceptionSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { writeCheckAudit } from "@/lib/ops";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  // Manager/owner only
  const session = await requireSession(["owner"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = resolveExceptionSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const check = await prisma.check.findFirst({
    where: { id, table: { area: { storeId: session.storeId } } },
  });
  if (!check) return error("伝票が見つかりません", 404);
  if (check.exceptionStatus !== "flagged") {
    return error("異常フラグがありません", 409);
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.check.update({
      where: { id: check.id },
      data: {
        exceptionStatus: "resolved",
        exceptionResolvedAt: now,
        exceptionResolvedByStaffId: session.staffId,
        exceptionResolveNote: parsed.data.note ?? null,
      },
      include: { table: true },
    });
    const audit = await writeCheckAudit({
      tx,
      storeId: session.storeId,
      checkId: check.id,
      staffId: session.staffId,
      action: "resolve_exception",
      summary: `異常解消: ${parsed.data.note ?? "(メモなし)"}`,
      detail: {
        resolveNote: parsed.data.note ?? null,
        priorNote: check.exceptionNote,
        role: session.role,
      },
    });
    return { check: updated, audit };
  });

  return json(result);
}
