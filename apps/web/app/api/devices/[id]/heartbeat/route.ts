import { prisma } from "@shinso/db";
import { heartbeatSchema, isDeviceEffectivelyOffline } from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = heartbeatSchema.safeParse(body ?? {});
  if (!parsed.success) return error("入力が不正です", 400);

  const existing = await prisma.device.findFirst({ where: { id, storeId: session.storeId } });
  if (!existing) return error("端末が見つかりません", 404);

  const nextStatus =
    parsed.data.status ??
    (existing.status === "out_of_paper" || existing.status === "error"
      ? existing.status
      : "online");

  const device = await prisma.device.update({
    where: { id },
    data: {
      status: nextStatus,
      lastHeartbeatAt: new Date(),
      meta: (parsed.data.meta as object | undefined) ?? undefined,
    },
  });

  return json({
    device: { ...device, effectivelyOffline: isDeviceEffectivelyOffline(device) },
  });
}
