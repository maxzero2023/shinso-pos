import { prisma } from "@shinso/db";
import { tokyoBusinessDateString } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import { countOpenChecks, findOpenShift } from "@/lib/ops";

export async function GET() {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const [openShift, openCheckCount, recentShifts] = await Promise.all([
    findOpenShift(session.storeId),
    countOpenChecks(session.storeId),
    prisma.shift.findMany({
      where: { storeId: session.storeId },
      include: { businessDay: true },
      orderBy: { openedAt: "desc" },
      take: 10,
    }),
  ]);

  return json({
    timezone: "Asia/Tokyo",
    todayBusinessDate: tokyoBusinessDateString(),
    openCheckCount,
    currentShift: openShift,
    recentShifts,
  });
}
