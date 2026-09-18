import { simulateDeliveryWebhookSchema } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { createPendingExternalOrder } from "@/lib/delivery";

/**
 * Stub partner webhook / simulator.
 * Creates pending ExternalOrder only — NEVER Check or KitchenTicket.
 */
export async function POST(req: Request) {
  const session = await requireSession(["owner", "floor", "manager", "brand_admin"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);

  const body = await req.json().catch(() => null);
  const parsed = simulateDeliveryWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  const externalId =
    parsed.data.externalId ??
    `SIM-${parsed.data.channel.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  try {
    const order = await createPendingExternalOrder({
      storeId,
      channel: parsed.data.channel,
      externalId,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      note: parsed.data.note,
      lines: parsed.data.lines,
      rawPayload: body as object,
    });

    return json(
      {
        order,
        semiAuto: true,
        message:
          "外部注文を受付しました（確認待ち）。Check / KitchenTicket はまだ作成されていません。",
      },
      201
    );
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? (e as { code: string }).code : "";
    if (code === "P2002") {
      return error("同じチャネルの外部注文IDが既に存在します", 409);
    }
    throw e;
  }
}
