import { ingredientCreateSchema } from "@shinso/api";
import { requireSession, isResponse, activeStoreId } from "@/lib/auth-guard";
import { error, json } from "@/lib/http";
import { listIngredients, createIngredient } from "@/lib/inventory";
import { Prisma } from "@prisma/client";

export async function GET() {
  const session = await requireSession(["owner", "manager", "floor"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);
  const ingredients = await listIngredients(storeId);
  return json({ ingredients });
}

export async function POST(req: Request) {
  const session = await requireSession(["owner", "manager"]);
  if (isResponse(session)) return session;
  const storeId = activeStoreId(session);

  const body = await req.json().catch(() => null);
  const parsed = ingredientCreateSchema.safeParse(body);
  if (!parsed.success) return error("入力が不正です", 400, { details: parsed.error.flatten() });

  try {
    const ingredient = await createIngredient(storeId, parsed.data);
    return json(
      {
        ingredient: {
          ...ingredient,
          lowStockThreshold: Number(ingredient.lowStockThreshold),
          onHand: 0,
          isLowStock: 0 < Number(ingredient.lowStockThreshold),
        },
      },
      201
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return error("同名の原料が既に存在します", 400);
    }
    throw e;
  }
}
