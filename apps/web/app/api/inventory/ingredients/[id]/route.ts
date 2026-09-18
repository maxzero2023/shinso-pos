import { ingredientUpdateSchema } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { getIngredient, updateIngredient, deleteIngredient } from "@/lib/inventory";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const ingredient = await getIngredient(activeStoreId(session), id);
  if (!ingredient) return error("原料が見つかりません", 404);
  return json({ ingredient });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = ingredientUpdateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  try {
    const ingredient = await updateIngredient(activeStoreId(session), id, parsed.data);
    if (!ingredient) return error("原料が見つかりません", 404);
    const full = await getIngredient(activeStoreId(session), id);
    return json({ ingredient: full });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return error("同名の原料が既に存在します", 400);
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const { id } = await ctx.params;
  const deleted = await deleteIngredient(activeStoreId(session), id);
  if (!deleted) return error("原料が見つかりません", 404);
  return json({ ok: true });
}
