import { prisma } from "@shinso/db";
import { sumCheckItems } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";
import type { CheckExceptionStatus } from "@shinso/db";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "flagged";

  let exceptionFilter:
    | CheckExceptionStatus
    | { in: CheckExceptionStatus[] } = "flagged";
  if (status === "all") {
    exceptionFilter = { in: ["flagged", "resolved"] };
  } else if (status === "resolved") {
    exceptionFilter = "resolved";
  }

  const checks = await prisma.check.findMany({
    where: {
      table: { area: { storeId: session.storeId } },
      exceptionStatus: exceptionFilter,
    },
    include: {
      table: { include: { area: true } },
      items: true,
    },
    orderBy: { exceptionFlaggedAt: "desc" },
    take: 50,
  });

  return json({
    checks: checks.map((c) => ({
      ...c,
      totalYen: sumCheckItems(c.items),
    })),
  });
}
