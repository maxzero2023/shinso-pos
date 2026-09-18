import { prisma } from "@shinso/db";
import { getHardwareMode, simulateDeviceSchema } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  if (getHardwareMode() === "live") {
    return error("LIVE モードではシミュレートできません", 400);
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = simulateDeviceSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const existing = await prisma.device.findFirst({ where: { id, storeId: session.storeId } });
  if (!existing) return error("端末が見つかりません", 404);

  const device = await prisma.device.update({
    where: { id },
    data: {
      status: parsed.data.status,
      lastHeartbeatAt:
        parsed.data.status === "offline" ? existing.lastHeartbeatAt : new Date(),
    },
  });

  return json({ device, mode: getHardwareMode() });
}
