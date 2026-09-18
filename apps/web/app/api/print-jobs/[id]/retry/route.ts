import { prisma } from "@shinso/db";
import { getHardwareMode, processPrintJob } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;

  const existing = await prisma.printJob.findFirst({
    where: { id, storeId: session.storeId },
  });
  if (!existing) return error("印刷ジョブが見つかりません", 404);

  await prisma.printJob.update({
    where: { id },
    data: { status: "queued", errorMessage: null },
  });
  const job = await processPrintJob(prisma, id);
  return json({ job, mode: getHardwareMode() });
}
