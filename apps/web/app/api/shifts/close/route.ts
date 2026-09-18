import { prisma } from "@shinso/db";
import { closeShiftSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { countOpenChecks, findOpenShift } from "@/lib/ops";

export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = closeShiftSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const openShift = await findOpenShift(session.storeId);
  if (!openShift) return error("オープン中のシフトがありません", 404);

  const openCheckCount = await countOpenChecks(session.storeId);
  if (openCheckCount > 0) {
    return error("未結伝票があるため閉店できません", 409, { openCheckCount });
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.update({
      where: { id: openShift.id },
      data: {
        status: "closed",
        closedAt: now,
        closedByStaffId: session.staffId,
        note: parsed.data.note ?? openShift.note,
      },
      include: { businessDay: true },
    });

    // Close business day when no other open shifts remain
    const otherOpen = await tx.shift.count({
      where: {
        storeId: session.storeId,
        businessDayId: openShift.businessDayId,
        status: "open",
        id: { not: openShift.id },
      },
    });
    if (otherOpen === 0) {
      await tx.businessDay.update({
        where: { id: openShift.businessDayId },
        data: {
          status: "closed",
          closedAt: now,
          closedByStaffId: session.staffId,
        },
      });
    }

    return shift;
  });

  return json({ shift: result, openCheckCount: 0 });
}
