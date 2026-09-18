import { prisma } from "@shinso/db";
import { openShiftSchema, tokyoBusinessDateString } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { findOpenShift, getOrCreateOpenBusinessDay } from "@/lib/ops";

export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = openShiftSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const existing = await findOpenShift(session.storeId);
  if (existing) {
    return json({
      shift: existing,
      alreadyOpen: true,
      todayBusinessDate: tokyoBusinessDateString(),
    });
  }

  const businessDay = await getOrCreateOpenBusinessDay({
    storeId: session.storeId,
    staffId: session.staffId,
  });

  const shift = await prisma.shift.create({
    data: {
      storeId: session.storeId,
      businessDayId: businessDay.id,
      status: "open",
      openedByStaffId: session.staffId,
      note: parsed.data.note,
    },
    include: { businessDay: true },
  });

  return json({ shift, alreadyOpen: false, todayBusinessDate: tokyoBusinessDateString() }, 201);
}
