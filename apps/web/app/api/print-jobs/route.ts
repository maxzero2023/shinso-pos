import { prisma } from "@shinso/db";
import { createPrintJobSchema, getHardwareMode } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { printKitchenForTicket, printReceiptForCheck } from "@/lib/hardware";

export async function GET(req: Request) {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;

  const url = new URL(req.url);
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 40) || 40);
  const status = url.searchParams.get("status");

  const jobs = await prisma.printJob.findMany({
    where: {
      storeId: session.storeId,
      ...(status
        ? { status: status as "queued" | "printing" | "printed" | "failed" }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      device: { select: { id: true, code: true, name: true, status: true } },
    },
  });

  return json({ mode: getHardwareMode(), jobs });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const body = await req.json().catch(() => null);
  const parsed = createPrintJobSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  if (parsed.data.type === "receipt") {
    if (!parsed.data.checkId) return error("checkId が必要です", 400);
    const result = await printReceiptForCheck({
      storeId: session.storeId,
      checkId: parsed.data.checkId,
      reprint: parsed.data.reprint ?? true,
      deviceId: parsed.data.deviceId,
    });
    if (!result.ok) return error(result.error, result.status);
    return json(result.data, result.status);
  }

  if (!parsed.data.kitchenTicketId) return error("kitchenTicketId が必要です", 400);
  const result = await printKitchenForTicket({
    storeId: session.storeId,
    kitchenTicketId: parsed.data.kitchenTicketId,
    deviceId: parsed.data.deviceId,
  });
  if (!result.ok) return error(result.error, result.status);
  return json(result.data, result.status);
}
