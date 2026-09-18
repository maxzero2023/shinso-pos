import { prisma } from "@shinso/db";
import {
  getHardwareMode,
  registerDeviceSchema,
  refreshStaleDeviceStatuses,
  isDeviceEffectivelyOffline,
  devicePrintError,
} from "@shinso/api";
import { requireSession, isResponse } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";

export async function GET() {
  const session = await requireSession(["owner", "floor", "kitchen"]);
  if (isResponse(session)) return session;

  await refreshStaleDeviceStatuses(prisma, session.storeId);
  const devices = await prisma.device.findMany({
    where: { storeId: session.storeId },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });

  return json({
    mode: getHardwareMode(),
    devices: devices.map((d) => ({
      ...d,
      effectivelyOffline: isDeviceEffectivelyOffline(d),
      printError: d.type === "printer" ? devicePrintError(d) : null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor"]);
  if (isResponse(session)) return session;
  const body = await req.json().catch(() => null);
  const parsed = registerDeviceSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400);

  const existing = await prisma.device.findUnique({
    where: { storeId_code: { storeId: session.storeId, code: parsed.data.code } },
  });
  if (existing) return error("同じコードの端末が既に登録されています", 409);

  const device = await prisma.device.create({
    data: {
      storeId: session.storeId,
      type: parsed.data.type,
      name: parsed.data.name,
      code: parsed.data.code,
      status: "online",
      lastHeartbeatAt: new Date(),
      meta: (parsed.data.meta as object | undefined) ?? undefined,
    },
  });

  return json({ device, mode: getHardwareMode() }, 201);
}
