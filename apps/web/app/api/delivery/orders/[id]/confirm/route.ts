import { confirmExternalOrderSchema } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { confirmExternalOrder } from "@/lib/delivery";
import { tryPrintAfterFire } from "@/lib/hardware";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "floor", "manager", "brand_admin"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = confirmExternalOrderSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return error("入力が不正です", 400, { details: parsed.error.flatten() });
  }

  const result = await confirmExternalOrder({
    storeId,
    orderId: id,
    staffId: session.staffId,
    guestCount: parsed.data.guestCount,
  });

  if ("error" in result && result.error) {
    return error(result.error, result.status, {
      unmapped: "unmapped" in result ? result.unmapped : undefined,
      mappingError: "mappingError" in result ? result.mappingError : undefined,
      checkId: "checkId" in result ? result.checkId : undefined,
    });
  }
  if (!("check" in result) || !result.check) {
    return error("確認に失敗しました", 500);
  }

  // Best-effort kitchen print (same pipeline as POS fire)
  const print = await tryPrintAfterFire(storeId, result.ticket.id);
  const printJob = print?.ok ? print.data.job : null;

  return json(
    {
      order: result.order,
      check: result.check,
      ticket: result.ticket,
      printJob,
      printError: printJob?.status === "failed" ? printJob.errorMessage : null,
      message: "確認完了：伝票作成・厨房へ送信しました",
    },
    201
  );
}
