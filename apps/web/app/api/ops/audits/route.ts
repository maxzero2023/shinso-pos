import { prisma } from "@shinso/db";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 40), 100);
  const checkId = url.searchParams.get("checkId") ?? undefined;

  const audits = await prisma.checkAuditLog.findMany({
    where: {
      storeId: session.storeId,
      ...(checkId ? { checkId } : {}),
    },
    include: {
      staff: { select: { id: true, name: true, role: true, email: true } },
      check: {
        select: {
          id: true,
          status: true,
          table: { select: { code: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return json({ audits });
}
