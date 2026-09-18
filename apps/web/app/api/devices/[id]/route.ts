import { prisma } from "@shinso/db";
import { deviceStatusSchema, isDeviceEffectivelyOffline, devicePrintError, isPrinterDeviceType } from "@shinso/api";
import { z } from "zod";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  status: deviceStatusSchema.optional(),
  meta: z.record(z.unknown()).optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const device = await prisma.device.findFirst({ where: { id, storeId: session.storeId } });
  if (!device) return error("端末が見つかりません", 404);
  return json({
    device: {
      ...device,
      effectivelyOffline: isDeviceEffectivelyOffline(device),
      printError: isPrinterDeviceType(device.type) ? devicePrintError(device) : null,
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const existing = await prisma.device.findFirst({ where: { id, storeId: session.storeId } });
  if (!existing) return error("端末が見つかりません", 404);

  const device = await prisma.device.update({
    where: { id },
    data: {
      name: parsed.data.name,
      status: parsed.data.status,
      meta: (parsed.data.meta as object | undefined) ?? undefined,
      ...(parsed.data.status === "online" ? { lastHeartbeatAt: new Date() } : {}),
    },
  });
  return json({ device });
}
